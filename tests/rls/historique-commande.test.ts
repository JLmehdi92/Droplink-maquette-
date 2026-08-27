import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { lireHistorique, PLAFOND_HISTORIQUE } from "@/lib/commandes/historique";
import { TYPES_EVENEMENT } from "@/lib/commandes/journal";
import type { ClientHistorique } from "@/lib/commandes/historique";

/**
 * L'HISTORIQUE DE COMMANDE, LU SOUS LA VRAIE RLS.
 *
 * `order_events` était remplie et JAMAIS LUE : dix types d'événements écrits à
 * chaque mutation, une policy de lecture posée pour le vendeur, et aucun écran.
 * La table est désormais rendue dans l'éditeur — donc elle devient une SURFACE,
 * et la première question qu'on lui pose est celle de l'isolation.
 *
 * ⚠️ CES TESTS APPELLENT `lireHistorique`, la fonction du produit, avec la
 * session d'un utilisateur RÉELLEMENT authentifié. Rejouer une requête
 * équivalente prouverait que la copie est correcte, jamais que le produit l'est
 * (L-032) ; et un test qui simule la RLS ne teste pas la RLS.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

let commandeAlice = "";
let commandeBob = "";

async function creerCommande(u: UtilisateurDeTest, etiquette: string): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    `insert into public.orders (shop_id, customer_label) values ($1, $2) returning id`,
    [u.shopId, etiquette],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

async function ecrire(
  commande: string,
  type: string,
  charge: Record<string, unknown> = {},
): Promise<void> {
  await interroger(
    catalogue,
    `insert into public.order_events (order_id, type, payload, actor)
     values ($1, $2, $3::jsonb, 'vendeur')`,
    [commande, type, JSON.stringify(charge)],
  );
}

const lire = (u: UtilisateurDeTest, commande: string) =>
  lireHistorique(u.client as unknown as ClientHistorique, commande);

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("histo-alice");
  bob = await creerUtilisateur("histo-bob");

  commandeAlice = await creerCommande(alice, "commande d'Alice");
  commandeBob = await creerCommande(bob, "commande de Bob");

  await ecrire(commandeAlice, "commande_creee");
  await ecrire(commandeAlice, "commande_modifiee", { champ: "product_ref" });
  await ecrire(commandeAlice, "media_ajoute", { nombre: 3 });
  await ecrire(commandeBob, "commande_creee");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Isolation", () => {
  test("Alice lit SON historique", async () => {
    const lignes = await lire(alice, commandeAlice);
    expect(lignes.length, "un historique vide ne prouverait rien").toBe(3);
    expect(lignes.map((l) => l.type)).toContain("commande_modifiee");
  });

  test("Bob ne lit RIEN de l'historique d'Alice", async () => {
    /*
     * La policy remonte `order_events → orders → shops → profiles`. Une lecture
     * qui contournerait la RLS — ou une policy écrite un cran trop large —
     * rendrait ici les trois lignes d'Alice, et le contrôle serait le seul
     * endroit du produit à s'en apercevoir : l'écran de Bob afficherait un
     * historique plausible, portant les gestes de quelqu'un d'autre.
     */
    const lignes = await lire(bob, commandeAlice);
    expect(lignes, "l'historique d'Alice a fuité chez Bob").toEqual([]);
  });

  test("CONTRE-TEST : Bob lit bien LE SIEN", async () => {
    // Sans lui, une lecture qui ne rendrait JAMAIS rien passerait le contrôle
    // ci-dessus à cent pour cent.
    const lignes = await lire(bob, commandeBob);
    expect(lignes.length).toBe(1);
  });
});

describe("Ce que l'historique rend", () => {
  test("les entrées sont rendues de la PLUS RÉCENTE à la plus ancienne", async () => {
    const lignes = await lire(alice, commandeAlice);
    const dates = lignes.map((l) => new Date(l.quand).getTime());
    for (let i = 1; i < dates.length; i += 1) {
      expect(dates[i - 1] ?? 0, "l'ordre n'est pas décroissant").toBeGreaterThanOrEqual(
        dates[i] ?? 0,
      );
    }
  });

  test("le détail affiché vient de la charge, réduit aux clés admises", async () => {
    const lignes = await lire(alice, commandeAlice);
    const modif = lignes.find((l) => l.type === "commande_modifiee");
    expect(modif?.detail).toBe("product_ref");
  });

  test("une charge portant une clé NON ADMISE ne la rend pas", async () => {
    /*
     * LA SURFACE DE FUITE QUE CET ÉCRAN OUVRE. `payload` est un `jsonb` libre :
     * il suffirait qu'un futur appel y range une note interne — qui porte le
     * prix d'achat — ou le jeton public pour que la valeur s'affiche sans que
     * personne ait pris cette décision.
     *
     * La sentinelle est cherchée PAR SA VALEUR dans tout ce que la fonction
     * rend, jamais par le nom de sa clé : une valeur voyage sous n'importe quel
     * nom.
     */
    const SENTINELLE = "prix-achat-histo-4c81f2";
    await ecrire(commandeAlice, "commande_modifiee", {
      champ: "internal_notes",
      internal_notes: SENTINELLE,
    });

    const lignes = await lire(alice, commandeAlice);
    expect(JSON.stringify(lignes), "la sentinelle est sortie dans l'historique").not.toContain(
      SENTINELLE,
    );
    // ... et le contre-test : la clé ADMISE de la même entrée, elle, est rendue.
    expect(lignes.some((l) => l.detail === "internal_notes")).toBe(true);
  });

  test("la BASE refuse un type d'événement inconnu", async () => {
    /*
     * ÉTABLI PAR EXÉCUTION EN ÉCRIVANT CE FICHIER, et c'est mieux que ce qu'on
     * croyait : `order_events` porte une contrainte `order_events_type_connu`.
     * Un type inventé ne peut donc pas ENTRER, et le filtre applicatif de
     * `lireHistorique` est une seconde ligne, pas la première.
     *
     * On le vérifie plutôt que de le supposer : c'est une propriété de la BASE,
     * invisible à toute relecture du code applicatif.
     */
    await expect(ecrire(commandeAlice, "type_venu_du_futur")).rejects.toThrow(
      /order_events_type_connu/,
    );
  });

  test("tout type admis par la base porte un libellé traduisible", async () => {
    /*
     * L'INVENTAIRE À DEUX SENS, et c'est lui qui protège vraiment.
     *
     * Le jour où quelqu'un élargit la contrainte pour un nouvel événement sans
     * ajouter son libellé, l'écran rendrait sa CLÉ BRUTE — une chaîne en dur
     * déguisée, en anglais technique, au milieu d'une interface traduite. Et
     * l'inverse : un libellé pour un type que la base refuse est une promesse
     * que rien ne peut tenir.
     *
     * On interroge la contrainte plutôt que le fichier de migration : une
     * migration ultérieure peut l'avoir remplacée.
     */
    const lignes = await interroger<{ def: string }>(
      catalogue,
      `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = 'public.order_events'::regclass and conname = 'order_events_type_connu'`,
    );
    const definition = lignes[0]?.def ?? "";
    expect(definition.length, "la contrainte a disparu : n'importe quel type entre").toBeGreaterThan(
      0,
    );

    const admisEnBase = [...definition.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? "");
    expect(admisEnBase.length, "aucune valeur relue : le motif vise à côté").toBeGreaterThan(5);

    const connusDuCode = new Set<string>(TYPES_EVENEMENT);
    const sansLibelle = admisEnBase.filter((t) => !connusDuCode.has(t));
    expect(
      sansLibelle,
      `Types admis par la base et inconnus du code : ${sansLibelle.join(", ")}. ` +
        "L'écran rendrait leur clé brute.",
    ).toEqual([]);

    const sansContrainte = [...connusDuCode].filter((t) => !admisEnBase.includes(t));
    expect(
      sansContrainte,
      `Types déclarés dans le code et REFUSÉS par la base : ${sansContrainte.join(", ")}. ` +
        "Leur écriture ferait échouer la transaction, donc annulerait la mutation entière.",
    ).toEqual([]);
  });

  test("le plafond de lignes est TENU", async () => {
    /*
     * La sauvegarde automatique écrit une entrée par champ temporisé : une
     * commande beaucoup éditée en porte des centaines. Sans plafond, l'écran le
     * plus utilisé du produit rendrait une liste que personne ne déroule.
     */
    const commande = await creerCommande(alice, "commande très éditée");
    for (let i = 0; i < PLAFOND_HISTORIQUE + 5; i += 1) {
      await ecrire(commande, "commande_modifiee", { champ: "champ-" + i });
    }
    const lignes = await lire(alice, commande);
    expect(lignes.length).toBe(PLAFOND_HISTORIQUE);
  });
});
