import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, passerEnPro, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import {
  debutPeriode,
  debutPeriodePrecedente,
  ecartPeriodePrecedente,
  jamaisOuvertes,
  lireActivite,
  lirePlusConsultees,
  lireSemaines,
  ParametresAnalyses,
  partAvecSuivi,
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

const activite = (partiel: Partial<Activite>): Activite => ({
  commandesCreees: 0,
  commandesOuvertes: 0,
  vuesTotales: 0,
  qcApprouve: 0,
  qcRefuse: 0,
  qcEnAttente: 0,
  avecSuivi: 0,
  archivees: 0,
  commandesLivrees: 0,
  creeesPeriodePrecedente: 0,
  ...partiel,
});

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

const MAINTENANT = new Date("2026-08-21T12:00:00Z");

/**
 * ⚠️ LES DATES SONT ANCRÉES SUR `MAINTENANT`, PAS SUR `now()`.
 *
 * Ce test posait ses commandes à `now() - N jours` tout en interrogeant depuis
 * un instant FIXE. Les deux horloges se croisaient : tant que la date réelle
 * restait proche du 21 août 2026, les bornes tombaient juste. Six mois plus
 * tard, la commande « il y a 200 jours » serait retombée DANS la fenêtre de
 * l'instant fixe, et la suite serait devenue rouge sans qu'aucune ligne de
 * produit ait bougé — un test qu'on relance jusqu'au vert n'est plus bloquant.
 */
function ilYA(jours: number): string {
  return new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();
}

async function creer(
  qui: UtilisateurDeTest,
  options: {
    vues?: number;
    qc?: "en_attente" | "approuve" | "refuse";
    ilYAJours?: number;
    suivi?: string;
  } = {},
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
           created_at = $4::timestamptz,
           tracking_number = $5
     where id = $1`,
    [id, options.vues ?? 0, options.qc ?? "en_attente", ilYA(options.ilYAJours ?? 0), options.suivi ?? null],
  );

  return id;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("analyses-alice");
  bob = await creerUtilisateur("analyses-bob");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; ce test mesure les fenêtres d'analyse sur 6 commandes, pas
  // le quota. (Bob en crée 5 : il reste gratuit.)
  await passerEnPro(alice);

  /*
   * LE JEU D'ALICE COUVRE LES TROIS FENÊTRES ET LEURS TROIS PRÉCÉDENTES.
   *
   *   il y a   2 j  → dans 7 j, 30 j, 90 j
   *   il y a   3 j  → dans 7 j, 30 j, 90 j
   *   il y a   4 j  → dans 7 j, 30 j, 90 j
   *   il y a  10 j  → dans 30 j et 90 j, et dans la PRÉCÉDENTE de 7 j
   *   il y a  45 j  → dans 90 j, et dans la PRÉCÉDENTE de 30 j
   *   il y a 200 j  → dans AUCUNE, pas même la précédente de 90 j (qui s'arrête
   *                   à 180) : c'est la borne BASSE de la fenêtre précédente,
   *                   celle qu'un `where` oublié laisserait grande ouverte.
   */
  await creer(alice, { vues: 5, qc: "approuve", ilYAJours: 2, suivi: "AL-ANA-01" });
  await creer(alice, { vues: 2, qc: "refuse", ilYAJours: 3, suivi: "AL-ANA-02" });
  await creer(alice, { vues: 0, qc: "en_attente", ilYAJours: 4 });
  await creer(alice, { vues: 1, qc: "approuve", ilYAJours: 10 });
  await creer(alice, { vues: 7, qc: "refuse", ilYAJours: 45 });
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

/**
 * LES LECTURES D ANALYSES, EXIGEES LISIBLES.
 *
 * Depuis le 04/09/2026 chacune rend `null` quand le transport a lache — la
 * regle partagee de `lib/reseau/panne.ts`, posee apres cinq occurrences du meme
 * defaut. Ici la base repond pour de vrai : `null` serait un defaut, et le
 * LEVER vaut mieux qu un `!` qui ferait passer une regression pour un detail
 * de typage.
 */
async function lisible<T>(promesse: Promise<T | null>, quoi: string): Promise<T> {
  const valeur = await promesse;
  if (valeur === null) throw new Error(quoi + " illisible alors que la base repond");
  return valeur;
}

describe("Ce que le vendeur voit de son activité", () => {
  test("ses commandes de la période, et uniquement les siennes", async () => {
    const a = await lisible(lireActivite(alice.client, "30j", MAINTENANT), "lireActivite");

    expect(a.commandesCreees, "les commandes de Bob sont comptées chez Alice").toBe(4);
    expect(a.commandesOuvertes).toBe(3);
    expect(a.vuesTotales).toBe(8);
  });

  test("contre-test positif : Bob a bien ses propres chiffres", async () => {
    // Sans lui, une fonction qui rendrait toujours zéro passerait le test
    // précédent sans rien prouver.
    const b = await lisible(lireActivite(bob.client, "30j", MAINTENANT), "lireActivite");
    expect(b.commandesCreees).toBe(5);
    expect(b.vuesTotales).toBe(15);
  });

  test("la période borne réellement, dans les deux sens", async () => {
    // Sans ce test, une borne inversée ou ignorée passerait : les autres
    // chiffres seraient corrects, et seul le total varierait — sans que rien ne
    // le signale.
    const sept = await lisible(lireActivite(alice.client, "7j", MAINTENANT), "lireActivite");
    const trente = await lisible(lireActivite(alice.client, "30j", MAINTENANT), "lireActivite");
    const quatreVingtDix = await lisible(lireActivite(alice.client, "90j", MAINTENANT), "lireActivite");

    expect(sept.commandesCreees).toBe(3);
    expect(trente.commandesCreees).toBe(4);
    expect(quatreVingtDix.commandesCreees).toBe(5);

    // La commande de 200 jours n'entre dans AUCUNE fenêtre : ses 99 vues sont
    // le témoin qui rendrait un débordement visible.
    expect(quatreVingtDix.vuesTotales).toBe(15);
  });

  test("les trois états du contrôle qualité s'additionnent au total", async () => {
    // « En attente » est COMPTÉ, pas déduit par soustraction : une déduction
    // produirait un total faux le jour où une valeur d'énumération s'ajoute, et
    // les trois chiffres continueraient de s'afficher sans erreur.
    const a = await lisible(lireActivite(alice.client, "30j", MAINTENANT), "lireActivite");
    expect(a.qcApprouve + a.qcRefuse + a.qcEnAttente).toBe(a.commandesCreees);
    expect(a.qcApprouve).toBe(2);
    expect(a.qcRefuse).toBe(1);
    expect(a.qcEnAttente).toBe(1);
  });

  test("le suivi se compte sur la période, pas sur le compte entier", async () => {
    const a = await lisible(lireActivite(alice.client, "30j", MAINTENANT), "lireActivite");
    expect(a.avecSuivi).toBe(2);
    expect(partAvecSuivi(a)).toBe(50);
  });
});

/**
 * LA FENÊTRE PRÉCÉDENTE.
 *
 * C'est la seule information de l'écran qui dise une DIRECTION, et une
 * direction fausse est plus dangereuse qu'un total faux : elle se lit comme une
 * conclusion. Trois façons de la casser sans que rien ne lève :
 *
 *  1. oublier de fermer la fenêtre précédente en haut — elle contiendrait alors
 *     la période courante, et le delta serait toujours négatif ;
 *  2. oublier de la fermer en bas — elle contiendrait toute l'histoire du
 *     compte, et le delta d'un vendeur ancien serait toujours négatif ;
 *  3. lui donner une longueur différente de la fenêtre courante — le delta
 *     mesurerait alors la différence de durée en se faisant passer pour une
 *     tendance.
 */
describe("La comparaison avec la période précédente", () => {
  test("elle est fermée EN HAUT : la période courante n'y est pas", async () => {
    const a = await lisible(lireActivite(alice.client, "7j", MAINTENANT), "lireActivite");
    // 3 commandes dans les 7 jours, 1 seule dans les 7 d'avant (celle de 10 j).
    expect(a.creeesPeriodePrecedente).toBe(1);
    expect(ecartPeriodePrecedente(a)).toBe(2);
  });

  test("elle est fermée EN BAS : l'histoire ancienne n'y est pas non plus", async () => {
    // La fenêtre précédente de 90 jours s'arrête à 180 : la commande de 200
    // jours en est dehors. Sans borne basse, elle y serait, et un vendeur
    // ancien lirait une baisse à chaque période.
    const a = await lisible(lireActivite(alice.client, "90j", MAINTENANT), "lireActivite");
    expect(a.creeesPeriodePrecedente).toBe(0);
    expect(ecartPeriodePrecedente(a)).toBe(5);
  });

  test("elle a EXACTEMENT la longueur de la période courante", () => {
    for (const p of ["7j", "30j", "90j"] as const) {
      const debut = debutPeriode(p, MAINTENANT).getTime();
      const precedent = debutPeriodePrecedente(p, MAINTENANT).getTime();

      expect(precedent, "la fenêtre précédente commence après la courante").toBeLessThan(debut);
      expect(debut - precedent).toBe(MAINTENANT.getTime() - debut);
    }
  });

  test("rien à comparer ne se rend PAS « +0 »", () => {
    const vide = activite({});
    expect(ecartPeriodePrecedente(vide)).toBeNull();
    // Contre-test positif : une vraie stabilité, elle, se dit.
    expect(
      ecartPeriodePrecedente(activite({ commandesCreees: 4, creeesPeriodePrecedente: 4 })),
    ).toBe(0);
  });
});

/**
 * LA FRISE HEBDOMADAIRE.
 *
 * LE PIÈGE QU'ELLE VISE : `count(*)` sur une jointure externe. La semaine sans
 * commande produit tout de même une ligne, dont les colonnes de `orders` sont
 * nulles — `count(*)` la compterait pour UN. Toutes les semaines vides
 * afficheraient alors exactement une commande, ce qui ne lève rien, ne casse
 * rien, et se lit comme une activité régulière.
 */
describe("La frise des commandes par semaine", () => {
  test("elle rend AUTANT de semaines que demandé, vides comprises", async () => {
    const s = await lisible(lireSemaines(alice.client, MAINTENANT, 12), "lireSemaines");
    expect(s).toHaveLength(12);

    // Le jeu d'Alice n'a rien entre la 45ᵉ et la 10ᵉ journée : il y a donc des
    // semaines à zéro au milieu de la série, et c'est exactement ce qu'un
    // regroupement sans axe du temps aurait supprimé.
    expect(s.some((x) => x.total === 0), "aucune semaine vide : l'axe est faux").toBe(true);
  });

  test("une semaine vide vaut ZÉRO, pas un", async () => {
    const s = await lisible(lireSemaines(alice.client, MAINTENANT, 12), "lireSemaines");
    for (const semaine of s) {
      expect(Number.isInteger(semaine.total)).toBe(true);
      expect(semaine.total).toBeGreaterThanOrEqual(0);
    }
    // Douze semaines couvrent les commandes de 2, 3, 4, 10 et 45 jours : cinq.
    // La somme est le contrôle qui attrape le `count(*)` — elle vaudrait 12 de
    // plus si chaque semaine vide comptait pour une.
    expect(s.reduce((n, x) => n + x.total, 0)).toBe(5);
  });

  test("les semaines sont ordonnées, et distantes d'exactement sept jours", async () => {
    const s = await lisible(lireSemaines(alice.client, MAINTENANT, 12), "lireSemaines");
    const debuts = s.map((x) => x.debut.getTime());
    for (let i = 1; i < debuts.length; i += 1) {
      expect((debuts[i] ?? 0) - (debuts[i - 1] ?? 0)).toBe(7 * 86_400_000);
    }
  });

  test("contre-test d'isolation : Bob ne voit que ses cinq commandes", async () => {
    const s = await lisible(lireSemaines(bob.client, MAINTENANT, 12), "lireSemaines");
    expect(s.reduce((n, x) => n + x.total, 0)).toBe(5);
  });
});

/**
 * LE CLASSEMENT DES PLUS CONSULTÉES.
 *
 * Il porte le nom du destinataire et la référence produit — c'est-à-dire des
 * données d'un vendeur. Une fuite ici n'exposerait pas un chiffre agrégé mais
 * le carnet d'un concurrent.
 */
describe("Les commandes les plus consultées", () => {
  test("elles sont triées par vues et bornées à la période", async () => {
    const c = await lisible(lirePlusConsultees(alice.client, "30j", MAINTENANT, 3), "lirePlusConsultees");

    expect(c.map((x) => x.vues)).toEqual([5, 2, 1]);
    // La commande de 45 jours porte 7 vues : elle serait EN TÊTE si la période
    // n'était pas appliquée. C'est le témoin qui attrape une borne oubliée.
    expect(c.some((x) => x.vues === 7)).toBe(false);
  });

  test("la limite coupe le classement, elle ne le filtre pas", async () => {
    // Sur 90 jours Alice a QUATRE commandes consultées ; la limite en rend
    // trois, et ce sont les trois PREMIÈRES — un `limit` posé avant le tri
    // rendrait trois lignes parfaitement crédibles, prises au hasard.
    const c = await lisible(lirePlusConsultees(alice.client, "90j", MAINTENANT, 3), "lirePlusConsultees");
    expect(c.map((x) => x.vues)).toEqual([7, 5, 2]);
  });

  test("une commande jamais ouverte n'est pas « la plus consultée »", async () => {
    // Alice a une commande à zéro vue dans la fenêtre. Sans le filtre, elle
    // remplirait une ligne du classement d'un compte qui débute — et un
    // classement dont la dernière ligne dit « 0 » n'est plus un classement.
    const c = await lisible(lirePlusConsultees(alice.client, "30j", MAINTENANT, 10), "lirePlusConsultees");
    expect(c).toHaveLength(3);
    expect(c.every((x) => x.vues > 0)).toBe(true);
  });

  test("contre-test d'isolation : Bob ne voit jamais les commandes d'Alice", async () => {
    const c = await lisible(lirePlusConsultees(bob.client, "30j", MAINTENANT, 10), "lirePlusConsultees");
    expect(c).toHaveLength(5);
    expect(c.every((x) => x.vues === 3)).toBe(true);
  });
});

describe("Les dérivées, là où une métrique se fausse sans bruit", () => {
  test("aucune commande ne rend PAS « 0 % »", () => {
    // « 0 % » affirme que rien n'a été ouvert, ce qui est une information.
    // L'absence de commande n'en est pas une. Les deux se ressemblent à l'écran
    // et se confondent dans un tableau de suivi, or l'une appelle une action du
    // vendeur et l'autre non.
    expect(tauxOuverture(activite({}))).toBeNull();
    expect(vuesParCommandeOuverte(activite({}))).toBeNull();
    expect(partAvecSuivi(activite({}))).toBeNull();
    expect(jamaisOuvertes(activite({}))).toBeNull();
  });

  test("contre-test positif : un vrai zéro reste zéro", () => {
    // Dix commandes dont aucune ouverte EST une information, et une importante.
    expect(tauxOuverture(activite({ commandesCreees: 10, commandesOuvertes: 0 }))).toBe(0);
    expect(jamaisOuvertes(activite({ commandesCreees: 10, commandesOuvertes: 10 }))).toBe(0);
    expect(partAvecSuivi(activite({ commandesCreees: 10, avecSuivi: 0 }))).toBe(0);
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
    expect(jamaisOuvertes(a)).toBe(5);
  });
});

describe("Les paramètres", () => {
  test("une période inventée retombe sur le défaut", () => {
    expect(ParametresAnalyses.parse({ periode: "depuis-toujours" }).periode).toBe("30j");
    expect(ParametresAnalyses.parse({}).periode).toBe("30j");
    // ⚠️ « tout » A EXISTÉ, et les liens partagés ou mis en favori le portent
    // encore. Il doit retomber sur le défaut, pas produire une page en erreur.
    expect(ParametresAnalyses.parse({ periode: "tout" }).periode).toBe("30j");
  });

  test("les trois fenêtres sont ordonnées de la plus courte à la plus longue", () => {
    expect(debutPeriode("7j", MAINTENANT) < MAINTENANT).toBe(true);
    expect(debutPeriode("30j", MAINTENANT) < debutPeriode("7j", MAINTENANT)).toBe(true);
    expect(debutPeriode("90j", MAINTENANT) < debutPeriode("30j", MAINTENANT)).toBe(true);
  });
});
