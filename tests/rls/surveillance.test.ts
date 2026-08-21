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
 *  1. LE COMPTEUR D'INTERROGATIONS SUIT LES INSTANTANÉS, un pour un. C'est
 *     notre seul coût facturé par un tiers avec le stockage : un compteur plus
 *     bas que la facture est exactement le défaut qu'on ne voit qu'en recevant
 *     la facture.
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

describe("Le compteur d'interrogations suit les instantanés", () => {
  test("chaque instantané écrit incrémente le compteur du mois", async () => {
    const avant = (await indicateur(admin, "interrogations_ce_mois")) ?? 0;

    const colis = await creerColis(vendeur.shopId, `SURV-${Date.now()}`);
    for (let i = 0; i < 3; i += 1) {
      await interroger(
        catalogue,
        "insert into public.tracking_snapshots (parcel_id, raw_payload) values ($1, $2)",
        [colis, JSON.stringify({ essai: i })],
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
    const avant = (await indicateur(admin, "interrogations_ce_mois")) ?? 0;

    const colis = await creerColis(vendeur.shopId, `VIDE-${Date.now()}`);
    await interroger(
      catalogue,
      `insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
       values ($1, '{}'::jsonb, null)`,
      [colis],
    );

    expect((await indicateur(admin, "interrogations_ce_mois")) ?? 0).toBe(avant + 1);
  });

  test("le compteur ÉGALE le nombre réel d'instantanés du mois", async () => {
    // Le contrôle central : un compteur dénormalisé qui dérive est rapide et
    // faux, donc crédible. On le compare au décompte complet, celui qu'on refuse
    // de faire à la lecture.
    const reel = await interroger<{ n: string }>(
      catalogue,
      `select count(*) as n from public.tracking_snapshots
       where fetched_at >= date_trunc('month', now())`,
    );
    expect(await indicateur(admin, "interrogations_ce_mois")).toBe(Number(reel[0]?.n));
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
