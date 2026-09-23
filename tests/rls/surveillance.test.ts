import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { promouvoirAdmin } from "../aide/admin";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireSurveillance, NON_MESURE, TACHES_ATTENDUES } from "@/lib/audit/surveillance";

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
  const s = await surveillanceLisible(u.client, RETARD_MINUTES);
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
  await promouvoirAdmin(catalogue, admin);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(admin);
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

/**
 * LA SURVEILLANCE LUE, SES TROIS SECTIONS EXIGEES LISIBLES.
 *
 * Depuis le 04/09/2026 chaque section peut valoir `null` — « pas lisible en ce
 * moment » — pour qu une coupure de transport n emporte plus l ecran entier.
 * Ici la base repond pour de vrai : `null` serait un defaut, et le LEVER vaut
 * mieux qu un `!` qui ferait passer une regression pour un detail de typage.
 */
async function surveillanceLisible(
  client: Parameters<typeof lireSurveillance>[0],
  retard: Parameters<typeof lireSurveillance>[1],
) {
  const s = await lireSurveillance(client, retard);
  const { indicateurs, taches, surveillees, colisParJour } = s;
  if (indicateurs === null || taches === null || surveillees === null || colisParJour === null) {
    throw new Error(
      "surveillance partiellement illisible alors que la base repond — indicateurs:" +
        String(indicateurs === null) +
        " taches:" +
        String(taches === null) +
        " surveillees:" +
        String(surveillees === null) +
        " colis:" +
        String(colisParJour === null),
    );
  }
  return { ...s, indicateurs, taches, surveillees, colisParJour };
}

describe("Qui peut lire la surveillance", () => {
  test("un vendeur est refusé, et n'apprend pas que la surface existe", async () => {
    await expect(lireSurveillance(vendeur.client, RETARD_MINUTES)).rejects.toThrow(/impossible/i);
  });

  test("contre-test positif : l'administrateur la lit", async () => {
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
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
        `select colis from public.appliquer_etat_colis($1, 'expedie', 'In transit', '', '[]'::jsonb,
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
      `select colis as n from public.appliquer_etat_colis($1, 'expedie', 'In transit', '', '[]'::jsonb,
         '', '', '{}'::jsonb, '')`,
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

    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
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
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
    expect(s.nonMesure).toEqual(NON_MESURE);
    expect(s.nonMesure.length, "un ensemble vide passerait tout").toBeGreaterThan(0);
  });

  test("aucune grandeur inventée par la maquette n'est rendue", async () => {
    // La maquette affiche disponibilité, websockets, IOPS et latences. Le
    // produit n'en mesure aucune : les voir apparaître ici signifierait qu'on a
    // commencé à en inventer.
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
    const cles = s.indicateurs.map((i) => i.indicateur);
    for (const invente of NON_MESURE) {
      expect(cles, `« ${invente} » est rendu comme mesuré`).not.toContain(invente);
    }
  });
});

/**
 * LA FRISE DES COLIS PRIS EN CHARGE.
 *
 * ⚠️ LES JOURS VIDES DOIVENT VALOIR ZÉRO, PAS UN. Sur une jointure externe,
 * `count(*)` compte la LIGNE PRODUITE PAR LA JOINTURE : un jour sans colis
 * rendrait 1. Le même piège avait été attrapé sur la frise des semaines en
 * migration 107, et il ne se voit qu'un jour où il ne s'est rien passé —
 * c'est-à-dire jamais sur un jeu dense.
 *
 * ET LES JOURS VIDES DOIVENT ÊTRE RENDUS. Une frise qui saute les jours creux
 * tasse le temps et fait disparaître exactement ce qu'on y cherche.
 */
describe("La frise des colis, jour par jour", () => {
  test("elle rend TOUS les jours demandés, vides compris", async () => {
    const { data, error } = await admin.client.rpc("colis_par_jour_admin", { p_jours: 14 });
    expect(error).toBeNull();
    expect(data?.length, "la frise ne rend pas 14 jours").toBe(14);
  });

  /*
   * ⚠️ CE TEST EFFAÇAIT DE VRAIES DONNÉES DE PRODUCTION — CONSTATÉ LE
   * 05/09/2026, SUR LA COMMANDE D'UN VRAI CLIENT.
   *
   * Il faisait `delete from tracked_parcels where registered_at >= now() -
   * interval '30 days'` pour rendre la fenêtre creuse, et son commentaire
   * l'assumait : « c'est le seul état où le piège de count(*) se voit ». C'était
   * sans conséquence quand la base ne servait personne. **Elle sert désormais de
   * vrais vendeurs**, et un simple `pnpm gates` a supprimé les deux colis d'une
   * commande réelle — avec leurs liens et leurs points de passage, emportés par
   * la cascade. Les numéros de suivi, eux, sont restés sur `orders` : la perte
   * était donc SILENCIEUSE côté vendeur, et sa page repassait simplement en
   * « en attente du transporteur ».
   *
   * ⚠️ UNE SUITE NE SUPPRIME QUE CE QU'ELLE A CRÉÉ. C'est la règle qui manquait,
   * et aucune borne de prudence ne la remplace : `registered_at >= now() - 30
   * jours` ne désigne pas « les données de test », il désigne « les données
   * récentes », c'est-à-dire exactement celles qui comptent.
   *
   * LA FENÊTRE CREUSE S'OBTIENT SANS RIEN DÉTRUIRE. `colis_par_jour_admin`
   * borne `p_jours` à 90 : sur une telle fenêtre, il existe forcément des jours
   * sans aucune prise en charge, et c'est là que le piège se voit. On EXIGE
   * qu'il y en ait au moins un — sans quoi le contrôle serait vrai en n'ayant
   * rien regardé.
   */
  test("un jour sans colis vaut ZÉRO, jamais un", async () => {
    const { data, error } = await admin.client.rpc("colis_par_jour_admin", { p_jours: 90 });
    expect(error).toBeNull();

    // Le type de retour d une RPC `returns table` n est pas inferable ici : on
    // le NOMME plutot que de laisser un `any` implicite passer.
    const jours = (data ?? []) as readonly { readonly jour: string; readonly n: number }[];
    const vides = jours.filter((j) => Number(j.n) === 0);
    const aUn = jours.filter((j) => Number(j.n) === 1);

    // LE PLANCHER, ET IL EST LE CŒUR DU CONTRÔLE : sans un seul jour creux dans
    // la fenêtre, « aucun jour ne vaut 1 à tort » serait vrai d'une fonction
    // cassée. Sur 90 jours, l'absence totale de jour vide signalerait un jeu
    // anormal, pas un produit sain.
    expect(
      vides.length,
      `aucun jour creux dans 90 : le piège de count(*) ne peut pas se voir ` +
        `(jours à 1 : ${aUn.length})`,
    ).toBeGreaterThan(0);

    // Sur une jointure externe, `count(*)` compte la LIGNE PRODUITE PAR LA
    // JOINTURE : un jour sans colis rendrait 1. Il n'y a donc rien à effacer —
    // il suffit de regarder une fenêtre assez large pour en contenir.
    expect(
      jours.every((j) => Number.isInteger(Number(j.n)) && Number(j.n) >= 0),
      "la frise rend une valeur qui n'est pas un compte",
    ).toBe(true);
  });

  /*
   * ⚠️ CE CONTRE-TEST EXIGEAIT « EXACTEMENT 1 », donc il supposait la table
   * VIDE — c'est-à-dire qu'il dépendait de la suppression destructrice du test
   * précédent. Une fois celle-ci retirée, il rougissait en annonçant `9` :
   * l'assertion ne décrivait pas le produit, elle décrivait un effet de bord.
   *
   * Il compte désormais un ÉCART : combien de colis le jour porte avant, et
   * combien après. Ce qui est vrai quel que soit l'état de la base, donc vrai
   * aussi en production.
   *
   * ⚠️ ET IL RAMASSE SA PROPRE LIGNE. `FRISE-1` n'était nettoyé nulle part :
   * c'est la suppression du test voisin qui l'emportait par accident. Sans
   * elle, chaque passage des portes laissait un colis de plus dans les écrans
   * d'administration d'un produit en service.
   */
  test("contre-test : un colis pris en charge aujourd'hui apparaît au dernier jour", async () => {
    const dernierDe = async () => {
      const { data } = await admin.client.rpc("colis_par_jour_admin", { p_jours: 7 });
      const jours = (data ?? []) as readonly { readonly n: number }[];
      return Number(jours[jours.length - 1]?.n ?? -1);
    };

    const avant = await dernierDe();
    try {
      await interroger(
        catalogue,
        `insert into public.tracked_parcels (shop_id, tracking_number, registered_at)
         values ($1, 'FRISE-1', now())`,
        [vendeur.shopId],
      );
      // Sans ce contrôle, « aucun jour ne vaut 1 à tort » serait vrai d'une
      // fonction qui ne compterait JAMAIS rien.
      expect(await dernierDe(), "le colis du jour n'est pas compté").toBe(avant + 1);
    } finally {
      await interroger(
        catalogue,
        "delete from public.tracked_parcels where tracking_number = 'FRISE-1'",
      );
    }
  });

  test("un vendeur ne lit pas la frise, et n'apprend pas qu'elle existe", async () => {
    const { error } = await vendeur.client.rpc("colis_par_jour_admin", { p_jours: 7 });
    expect(error, "un vendeur a lu la frise d'administration").not.toBeNull();
  });
});

/**
 * LES TROIS ÉTATS D'UNE TÂCHE, PAR TÂCHE.
 *
 * ⚠️ `scheduler_heartbeat` NE PORTE QUE LES SOURCES AYANT DÉJÀ BATTU. Une tâche
 * jamais exécutée y est donc INVISIBLE, et se présentait jusqu'ici comme
 * absente — indiscernable d'une tâche qui n'existe pas. C'est l'inventaire
 * `TACHES_ATTENDUES` qui rend le troisième état possible, et il mène la
 * jointure.
 */
describe("Les tâches attendues ont trois états", () => {
  test("sans battement : JAMAIS EXÉCUTÉE, et ce n'est pas un retard", async () => {
    await interroger(catalogue, "delete from public.scheduler_heartbeat");
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);

    expect(s.surveillees.length, "l'inventaire est vide : la sonde n'inspecte rien").toBe(
      TACHES_ATTENDUES.length,
    );
    for (const tache of s.surveillees) {
      expect(tache.etat).toBe("jamais_executee");
      // « Jamais exécutée » n'est PAS « en retard » : une tâche posée ce matin
      // n'a pas encore eu son premier passage, et la signaler enverrait chercher
      // une panne dans un mécanisme inexistant.
      expect(tache.minutes).toBeNull();
    }
  });

  test("battement récent : ACTIF", async () => {
    for (const source of TACHES_ATTENDUES) {
      await interroger(
        catalogue,
        "insert into public.scheduler_heartbeat (source, beat_at) values ($1, now())",
        [source],
      );
    }
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
    expect(s.surveillees.every((t) => t.etat === "actif")).toBe(true);
  });

  test("battement trop ancien : EN RETARD — le contre-test des deux autres", async () => {
    // Sans lui, une fonction qui rendrait TOUJOURS « actif » passerait le test
    // précédent sans rien prouver.
    await interroger(
      catalogue,
      "update public.scheduler_heartbeat set beat_at = now() - interval '5 hours'",
    );
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
    expect(s.surveillees.every((t) => t.etat === "en_retard")).toBe(true);
    expect(s.surveillees[0]?.minutes ?? 0).toBeGreaterThan(200);
  });

  test("une source INCONNUE de l'inventaire n'invente pas une tâche", async () => {
    await interroger(
      catalogue,
      "insert into public.scheduler_heartbeat (source, beat_at) values ('source-fantome', now())",
    );
    const s = await surveillanceLisible(admin.client, RETARD_MINUTES);
    // L'INVENTAIRE MÈNE, pas les battements : une source qui bat sans être
    // attendue n'est pas une tâche du produit, c'est un résidu.
    expect(s.surveillees.map((t) => t.source)).not.toContain("source-fantome");
    expect(s.surveillees.length).toBe(TACHES_ATTENDUES.length);
  });
});
