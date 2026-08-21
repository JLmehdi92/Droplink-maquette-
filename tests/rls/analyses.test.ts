import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import {
  debutPeriode,
  lireActivite,
  ParametresAnalyses,
  tauxOuverture,
  vuesParCommandeOuverte,
  type Activite,
} from "@/lib/analyses/activite";

/**
 * LES ANALYSES.
 *
 * Ce sont des MÉTRIQUES DE VERDICT : elles servent à décider. Une métrique
 * légèrement faussée est pire qu'une métrique cassée, parce qu'elle reste
 * crédible — et une métrique fausse qui confirme ce qu'on espère ne se remet
 * jamais en question.
 *
 * D'où l'insistance sur deux points que rien d'autre ne rattraperait :
 *
 *  1. LES CHIFFRES D'UN VENDEUR NE CONTIENNENT PAS CEUX D'UN AUTRE. Un total
 *     gonflé par les commandes du voisin serait parfaitement crédible.
 *  2. « AUCUNE COMMANDE » ET « AUCUNE OUVERTURE » NE SE CONFONDENT PAS. Les deux
 *     s'affichent pareil si l'on rend zéro dans les deux cas, or l'une appelle
 *     une action du vendeur et l'autre non.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

const MAINTENANT = new Date("2026-08-21T12:00:00Z");

async function creer(
  qui: UtilisateurDeTest,
  options: { vues?: number; qc?: "en_attente" | "approuve" | "refuse"; ilYAJours?: number } = {},
): Promise<string> {
  const { data } = await qui.client
    .from("orders")
    .insert({ shop_id: qui.shopId, customer_label: "Client" })
    .select("id")
    .single();
  const id = (data as { id: string }).id;

  await interroger(
    catalogue,
    `update public.orders
       set views_count = $2,
           qc_status = $3::public.qc_status,
           created_at = now() - make_interval(days => $4)
     where id = $1`,
    [id, options.vues ?? 0, options.qc ?? "en_attente", options.ilYAJours ?? 0],
  );

  return id;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("analyses-alice");
  bob = await creerUtilisateur("analyses-bob");

  // Chez Alice, sur les 30 derniers jours : 3 commandes, 2 ouvertes, 7 vues.
  await creer(alice, { vues: 5, qc: "approuve", ilYAJours: 2 });
  await creer(alice, { vues: 2, qc: "refuse", ilYAJours: 3 });
  await creer(alice, { vues: 0, qc: "en_attente", ilYAJours: 4 });
  // Une quatrième, HORS des 30 jours : elle ne doit compter que dans « tout ».
  await creer(alice, { vues: 99, qc: "approuve", ilYAJours: 200 });

  // Chez Bob, un volume volontairement différent : s'il fuitait chez Alice, les
  // totaux resteraient parfaitement crédibles.
  for (let i = 0; i < 5; i += 1) await creer(bob, { vues: 3, qc: "approuve", ilYAJours: 1 });
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Ce que le vendeur voit de son activité", () => {
  test("ses commandes de la période, et uniquement les siennes", async () => {
    const a = await lireActivite(alice.client, "30j", MAINTENANT);

    expect(a.commandesCreees, "les commandes de Bob sont comptées chez Alice").toBe(3);
    expect(a.commandesOuvertes).toBe(2);
    expect(a.vuesTotales).toBe(7);
  });

  test("contre-test positif : Bob a bien ses propres chiffres", async () => {
    // Sans lui, une fonction qui rendrait toujours zéro passerait le test
    // précédent sans rien prouver.
    const b = await lireActivite(bob.client, "30j", MAINTENANT);
    expect(b.commandesCreees).toBe(5);
    expect(b.vuesTotales).toBe(15);
  });

  test("la période borne réellement, dans les deux sens", async () => {
    // La commande de 200 jours n'apparaît qu'en « tout ». Sans ce test, une
    // borne inversée ou ignorée passerait : les trois autres chiffres seraient
    // corrects, et seul le total varierait — sans que rien ne le signale.
    const trenteJours = await lireActivite(alice.client, "30j", MAINTENANT);
    const tout = await lireActivite(alice.client, "tout", MAINTENANT);

    expect(trenteJours.commandesCreees).toBe(3);
    expect(tout.commandesCreees).toBe(4);
    expect(tout.vuesTotales).toBe(106);
  });

  test("les trois états du contrôle qualité s'additionnent au total", async () => {
    // « En attente » est COMPTÉ, pas déduit par soustraction : une déduction
    // produirait un total faux le jour où une valeur d'énumération s'ajoute, et
    // les trois chiffres continueraient de s'afficher sans erreur.
    const a = await lireActivite(alice.client, "30j", MAINTENANT);
    expect(a.qcApprouve + a.qcRefuse + a.qcEnAttente).toBe(a.commandesCreees);
    expect(a.qcApprouve).toBe(1);
    expect(a.qcRefuse).toBe(1);
    expect(a.qcEnAttente).toBe(1);
  });
});

describe("Les dérivées, là où une métrique se fausse sans bruit", () => {
  const activite = (partiel: Partial<Activite>): Activite => ({
    commandesCreees: 0,
    commandesOuvertes: 0,
    vuesTotales: 0,
    qcApprouve: 0,
    qcRefuse: 0,
    qcEnAttente: 0,
    avecSuivi: 0,
    archivees: 0,
    ...partiel,
  });

  test("aucune commande ne rend PAS « 0 % »", () => {
    // « 0 % » affirme que rien n'a été ouvert, ce qui est une information.
    // L'absence de commande n'en est pas une. Les deux se ressemblent à l'écran
    // et se confondent dans un tableau de suivi, or l'une appelle une action du
    // vendeur et l'autre non.
    expect(tauxOuverture(activite({}))).toBeNull();
    expect(vuesParCommandeOuverte(activite({}))).toBeNull();
  });

  test("contre-test positif : un vrai zéro reste zéro", () => {
    // Dix commandes dont aucune ouverte EST une information, et une importante.
    expect(tauxOuverture(activite({ commandesCreees: 10, commandesOuvertes: 0 }))).toBe(0);
  });

  test("les vues moyennes se comptent sur les commandes OUVERTES", () => {
    // Le brief fixe « vues par commande > 3 » comme signal que le destinataire
    // REVIENT. Diviser par les commandes créées mélangerait ce signal avec le
    // taux d'ouverture : un vendeur dont tous les clients reviennent trois fois
    // afficherait la même valeur qu'un vendeur dont un tiers des liens n'est
    // jamais ouvert.
    const a = activite({ commandesCreees: 10, commandesOuvertes: 5, vuesTotales: 20 });
    expect(vuesParCommandeOuverte(a)).toBe(4);
    expect(tauxOuverture(a)).toBe(50);
  });
});

describe("Les paramètres", () => {
  test("une période inventée retombe sur le défaut", () => {
    expect(ParametresAnalyses.parse({ periode: "depuis-toujours" }).periode).toBe("30j");
    expect(ParametresAnalyses.parse({}).periode).toBe("30j");
  });

  test("« tout » est borné à une date réelle, pas à une valeur nulle", () => {
    // Une borne nulle aurait exigé un `or p_depuis is null` dans le `where` de la
    // fonction, condition que l'optimiseur ne peut plus satisfaire par l'index
    // sur `(shop_id, created_at)`.
    expect(debutPeriode("tout", MAINTENANT).getTime()).toBe(0);
    expect(debutPeriode("7j", MAINTENANT) < MAINTENANT).toBe(true);
    expect(debutPeriode("30j", MAINTENANT) < debutPeriode("7j", MAINTENANT)).toBe(true);
  });
});
