import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireSurveillance, NON_MESURE } from "@/lib/audit/surveillance";

/**
 * L'ÉCRAN DE SURVEILLANCE.
 *
 * Trois propriétés portent tout le reste :
 *
 *  1. LE COMPTEUR D'INTERROGATIONS SUIT LES APPELS, un pour un — et non les
 *     écritures qu'ils provoquent. C'est notre seul coût facturé par un tiers
 *     avec le stockage : un compteur plus bas que la facture est exactement le
 *     défaut qu'on ne voit qu'en recevant la facture.
 *  2. LES INTERROGATIONS VIDES COMPTENT AUSSI. Le fournisseur facture l'appel,
 *     qu'il rende un mouvement ou rien. Les exclure ferait diverger notre
 *     chiffre du sien, du côté rassurant.
 *  3. LES SURFACES DE LIMITATION NE SE MÉLANGENT JAMAIS. Une saturation de la
 *     page publique peut être un vendeur qui perce ; une saturation de
 *     l'authentification est une attaque. Les additionner effacerait la seule
 *     distinction qui compte.
 */

let admin: UtilisateurDeTest;
let vendeur: UtilisateurDeTest;
let catalogue: Client;

const RETARD_MINUTES = 60;

async function indicateur(u: UtilisateurDeTest, cle: string): Promise<number | undefined> {
  const s = await lireSurveillance(u.client, RETARD_MINUTES);
  return s.indicateurs.find((i) => i.indicateur === cle)?.valeur;
}

/** Crée un colis et rend son identifiant. */
async function creerColis(shopId: string, numero: string): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    `insert into public.tracked_parcels (shop_id, tracking_number, registered_at)
     values ($1, $2, now()) returning id`,
    [shopId, numero],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("colis non créé");
  return id;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  admin = await creerUtilisateur("surv-admin");
  vendeur = await creerUtilisateur("surv-vendeur");
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [
    admin.profilId,
  ]);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

describe("Qui peut lire la surveillance", () => {
  test("un vendeur est refusé, et n'apprend pas que la surface existe", async () => {
    await expect(lireSurveillance(vendeur.client, RETARD_MINUTES)).rejects.toThrow(/impossible/i);
  });

  test("contre-test positif : l'administrateur la lit", async () => {
    const s = await lireSurveillance(admin.client, RETARD_MINUTES);
    expect(s.indicateurs.length).toBeGreaterThan(0);
  });
});

/*
 * LE COMPTEUR SUIT L'APPEL, PLUS L'ÉCRITURE — ET C'EST UN CHANGEMENT DE CONTRAT.
 *
 * Ces trois contrôles éprouvaient auparavant un déclencheur posé sur
 * `tracking_snapshots` : un instantané écrit, un appel imputé. Le contrat était
 * FAUX, et le contrôle le certifiait fidèlement.
 *
 * Il l'était de deux façons opposées, ce qui est la raison pour laquelle
 * personne ne l'avait vu : `appliquer_etat_colis` écrivait un instantané PAR
 * COLIS portant le numéro, donc SURESTIMAIT dès que deux vendeurs suivaient le
 * même colis — mesuré, deux imputations pour un appel — tandis qu'une
 * interrogation VIDE n'écrivait aucun instantané, donc n'était pas comptée du
 * tout, et le retour vide est le cas le plus fréquent.
 *
 * Le contrôle a donc changé parce que le PRODUIT avait tort, pas parce qu'il
 * gênait.
 */
describe("Le compteur d'interrogations suit les APPELS", () => {
  test("chaque appel au fournisseur incrémente le compteur du mois", async () => {
    const avant = (await indicateur(admin, "interrogations_ce_mois")) ?? 0;

    const numero = `SURV-${Date.now()}`;
    await creerColis(vendeur.shopId, numero);
    for (let i = 0; i < 3; i += 1) {
      await interroger(
        catalogue,
        `select public.appliquer_etat_colis($1, 'expedie', 'In transit', '', '[]'::jsonb,
           '', '', $2::jsonb, '')`,
        [numero, JSON.stringify({ essai: i })],
      );
    }

    expect(
      await indicateur(admin, "interrogations_ce_mois"),
      "le compteur ne suit pas les interrogations : il divergera de la facture",
    ).toBe(avant + 3);
  });

  test("une interrogation VIDE compte aussi", async () => {
    // Le fournisseur facture l'appel qu'il rende un mouvement ou rien. Un numéro
    // fraîchement collé n'est souvent pas encore scanné : exclure ces
    // interrogations ferait diverger notre chiffre du sien, du côté rassurant.
    // Elles n'étaient PAS comptées, précisément parce qu'elles n'écrivent aucun
    // instantané et que le comptage suivait l'instantané.
    const avant = (await indicateur(admin, "interrogations_ce_mois")) ?? 0;

    const numero = `VIDE-${Date.now()}`;
    await creerColis(vendeur.shopId, numero);
    await interroger(catalogue, "select public.compter_interrogation_vide($1)", [numero]);

    expect((await indicateur(admin, "interrogations_ce_mois")) ?? 0).toBe(avant + 1);
  });

  test("deux vendeurs sur un même numéro ne comptent qu'un appel", async () => {
    // Le contrôle central, et celui qui manquait : c'est ici que le compteur
    // divergeait de la facture. Un compteur dénormalisé qui dérive est rapide et
    // faux, donc crédible.
    const avant = (await indicateur(admin, "interrogations_ce_mois")) ?? 0;

    const numero = `PARTAGE-${Date.now()}`;
    await creerColis(vendeur.shopId, numero);
    await creerColis(admin.shopId, numero);

    const touches = await interroger<{ n: number }>(
      catalogue,
      `select public.appliquer_etat_colis($1, 'expedie', 'In transit', '', '[]'::jsonb,
         '', '', '{}'::jsonb, '') as n`,
      [numero],
    );
    expect(touches[0]?.n, "l'état n'a pas été appliqué aux deux colis : rien n'est éprouvé").toBe(2);

    expect(
      (await indicateur(admin, "interrogations_ce_mois")) ?? 0,
      "un appel unique a été facturé deux fois",
    ).toBe(avant + 1);
  });

  test("le compteur ne descend jamais sous le nombre d'instantanés du mois", async () => {
    // La borne qui reste vraie après le changement de contrat : tout instantané
    // vient d'un appel, mais tout appel n'écrit pas d'instantané — un retour
    // vide n'en produit aucun. L'égalité d'autrefois était donc devenue fausse
    // dans le bon sens ; l'inégalité, elle, se vérifie encore et attrape la
    // dérive qui compte : un compteur PLUS BAS que la réalité.
    const reel = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from public.tracking_snapshots
       where fetched_at >= date_trunc('month', now())`,
    );
    expect(await indicateur(admin, "interrogations_ce_mois")).toBeGreaterThanOrEqual(
      Number(reel[0]?.n),
    );
  });
});

describe("Les abandons du mois", () => {
  test("ils sont comptés, et un colis actif ne l'est pas", async () => {
    const avant = (await indicateur(admin, "abandons_ce_mois")) ?? 0;

    await creerColis(vendeur.shopId, `ACTIF-${Date.now()}`);
    expect(
      (await indicateur(admin, "abandons_ce_mois")) ?? 0,
      "un colis actif est compté comme abandonné",
    ).toBe(avant);

    const abandonne = await creerColis(vendeur.shopId, `ABANDON-${Date.now()}`);
    await interroger(
      catalogue,
      "update public.tracked_parcels set abandoned_at = now() where id = $1",
      [abandonne],
    );

    expect((await indicateur(admin, "abandons_ce_mois")) ?? 0).toBe(avant + 1);
  });
});

describe("Les surfaces de limitation ne se mélangent pas", () => {
  test("chaque surface porte son propre pic", async () => {
    // Une saturation de la page publique peut être un vendeur qui perce ; une
    // saturation de l'authentification est une attaque. Les additionner
    // effacerait la seule distinction qui compte ici.
    await interroger(
      catalogue,
      `insert into public.rate_limit (cle, fenetre_debut, compte)
       values ('auth-ip:sonde', date_trunc('minute', now()), 41),
              ('publique-requetes:sonde', date_trunc('minute', now()), 7)
       on conflict (cle, fenetre_debut) do update set compte = excluded.compte`,
    );

    const s = await lireSurveillance(admin.client, RETARD_MINUTES);
    const pics = new Map(s.indicateurs.map((i) => [i.indicateur, i.valeur]));

    expect(pics.get("pic_auth-ip"), "le pic d'authentification n'est pas remonté").toBeGreaterThanOrEqual(41);
    expect(pics.get("pic_publique-requetes")).toBeGreaterThanOrEqual(7);
    // Le point : les deux ne sont pas le MÊME chiffre.
    expect(pics.get("pic_auth-ip")).not.toBe(pics.get("pic_publique-requetes"));
  });

  test("c'est le PIC qui est rendu, pas une moyenne", async () => {
    // Une moyenne diluerait le pic dans les fenêtres calmes, or c'est le pic qui
    // décide : une attaque de dix minutes disparaîtrait dans une heure de trafic
    // normal.
    await interroger(
      catalogue,
      `insert into public.rate_limit (cle, fenetre_debut, compte)
       values ('auth-email:calme', date_trunc('minute', now()) - interval '10 minutes', 1),
              ('auth-email:pointe', date_trunc('minute', now()), 99)
       on conflict (cle, fenetre_debut) do update set compte = excluded.compte`,
    );

    expect(await indicateur(admin, "pic_auth-email")).toBe(99);
  });

  test("une fenêtre trop ancienne ne compte plus", async () => {
    // Contre-test : sans borne de temps, l'écran montrerait un pic vieux de
    // plusieurs jours comme s'il venait d'arriver.
    await interroger(catalogue, "delete from public.rate_limit where cle like 'auth-email:%'");
    await interroger(
      catalogue,
      `insert into public.rate_limit (cle, fenetre_debut, compte)
       values ('auth-email:vieux', now() - interval '3 hours', 500)`,
    );

    expect(
      await indicateur(admin, "pic_auth-email"),
      "un pic vieux de trois heures est présenté comme actuel",
    ).toBeUndefined();
  });
});

describe("Ce qui n'est PAS mesuré est nommé", () => {
  test("la liste vient de la configuration, pas d'une valeur absente", async () => {
    // Déduire « pas de valeur donc pas mesuré » deviendrait faux le jour où une
    // grandeur vaut légitimement zéro. La liste est donc déclarée.
    const s = await lireSurveillance(admin.client, RETARD_MINUTES);
    expect(s.nonMesure).toEqual(NON_MESURE);
    expect(s.nonMesure.length, "un ensemble vide passerait tout").toBeGreaterThan(0);
  });

  test("aucune grandeur inventée par la maquette n'est rendue", async () => {
    // La maquette affiche disponibilité, websockets, IOPS et latences. Le
    // produit n'en mesure aucune : les voir apparaître ici signifierait qu'on a
    // commencé à en inventer.
    const s = await lireSurveillance(admin.client, RETARD_MINUTES);
    const cles = s.indicateurs.map((i) => i.indicateur);
    for (const invente of NON_MESURE) {
      expect(cles, `« ${invente} » est rendu comme mesuré`).not.toContain(invente);
    }
  });
});
