import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import {
  COLONNES,
  analyserParametres,
  lireCommandes,
  type ClientLecture,
  type ParametresListe,
} from "@/lib/commandes/liste";

/**
 * LA LISTE DU TABLEAU DE BORD, éprouvée sur LA fonction que l'écran appelle.
 *
 * Rejouer ici une requête équivalente prouverait que la copie est correcte, pas
 * que le produit l'est (L-032). `lireCommandes` accepte donc un client injecté,
 * et ces tests lui passent celui d'un utilisateur RÉELLEMENT authentifié : un
 * test qui simule la RLS ne teste pas la RLS.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

/** Sentinelle : une valeur unique, cherchée ensuite PAR SA VALEUR, pas par son nom. */
const NOTE_SECRETE = "prix-achat-sentinelle-9f3c1a77";

const defauts = (modification: Partial<ParametresListe> = {}): ParametresListe => ({
  ...analyserParametres({}),
  ...modification,
});

const lire = (u: UtilisateurDeTest, p: ParametresListe = defauts()) =>
  lireCommandes(p, u.client as unknown as ClientLecture);

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("liste-alice");
  bob = await creerUtilisateur("liste-bob");

  // Alice : de quoi éprouver les filtres, la recherche et la pagination.
  const lignes = [
    { customer_label: "Crème du Marché", product_ref: "REF-Été-01", status: "en_transit" },
    { customer_label: "Zoé Martin", product_ref: "REF-002", status: "livre" },
    { customer_label: "100% coton", product_ref: "REF-003", status: "preparation" },
    { customer_label: "Archivée", product_ref: "REF-004", status: "livre" },
  ] as const;

  for (const l of lignes) {
    const { error } = await alice.client
      .from("orders")
      .insert({ ...l, shop_id: alice.shopId, internal_notes: NOTE_SECRETE });
    expect(error, `insertion impossible : ${error?.message}`).toBeNull();
  }

  await alice.client
    .from("orders")
    .update({ archived_at: new Date().toISOString() })
    .eq("customer_label", "Archivée");

  const { error } = await bob.client
    .from("orders")
    .insert({ shop_id: bob.shopId, customer_label: "Commande de Bob", product_ref: "BOB-1" });
  expect(error, `insertion impossible pour Bob : ${error?.message}`).toBeNull();
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("Isolation", () => {
  test("la sonde inspecte réellement quelque chose", async () => {
    // Un ensemble vide passe tout : sans cette assertion, « Alice ne voit pas
    // Bob » serait vrai parce qu'Alice ne voit RIEN.
    const page = await lire(alice);
    expect(page.lignes.length).toBeGreaterThan(0);
  });

  test("Alice ne voit aucune commande de Bob, et réciproquement", async () => {
    const chezAlice = await lire(alice);
    const chezBob = await lire(bob);

    expect(chezAlice.lignes.map((l) => l.client)).not.toContain("Commande de Bob");
    expect(chezBob.lignes.map((l) => l.client)).toEqual(["Commande de Bob"]);

    // Aucun identifiant commun : la comparaison par libellé seule laisserait
    // passer une fuite portant le même nom.
    const idsAlice = new Set(chezAlice.lignes.map((l) => l.id));
    for (const l of chezBob.lignes) expect(idsAlice.has(l.id)).toBe(false);
  });

  test("un curseur forgé sur une commande de Bob ne fait rien traverser", async () => {
    const chezBob = await lire(bob);
    const cible = chezBob.lignes[0];
    expect(cible).toBeDefined();
    if (cible === undefined) return;

    const curseur = Buffer.from(cible.creeeLe + "|" + cible.id, "utf8").toString("base64url");
    const page = await lire(alice, defauts({ curseur }));

    for (const l of page.lignes) expect(l.id).not.toBe(cible.id);
  });
});

describe("Ce que la liste rend", () => {
  /**
   * CONTRÔLE PAR VALEUR, PAS PAR NOM. Une valeur voyage sous n'importe quel
   * nom : `internal_notes` republié sous `meta`, `debug` ou `diagnostic`
   * survivrait intégralement à une vérification du nom de la colonne. On cherche
   * donc la VALEUR, dans la sérialisation complète de ce que la fonction rend —
   * c'est-à-dire exactement ce qui partira dans la charge d'hydratation.
   */
  test("les notes internes ne sortent JAMAIS, quel que soit le nom qu'elles prendraient", async () => {
    const page = await lire(alice);
    expect(JSON.stringify(page)).not.toContain(NOTE_SECRETE);
  });

  test("contre-test positif : la sentinelle EST bien en base", async () => {
    // Sans lui, « la note ne fuit pas » resterait vrai si l'insertion avait
    // silencieusement échoué — et le test ne prouverait rien.
    const { data } = await alice.client
      .from("orders")
      .select("internal_notes")
      .eq("product_ref", "REF-002")
      .single();
    expect((data as { internal_notes: string } | null)?.internal_notes).toBe(NOTE_SECRETE);
  });

  test("le jeton public est rendu — l'écran doit pouvoir proposer le lien", async () => {
    const page = await lire(alice);
    for (const l of page.lignes) expect(l.jetonPublic.length).toBeGreaterThanOrEqual(16);
  });

  /**
   * INVENTORIER PLUTÔT QUE SÉLECTIONNER.
   *
   * La sentinelle ci-dessus a été falsifiée : ajouter `internal_notes` aux
   * colonnes demandées l'a laissée VERTE, parce que le mappage laissait tomber
   * la valeur. Elle prouvait que la sortie est propre, pas que la note reste en
   * base — et un mappage qui étalerait la ligne (`...l`) rouvrirait le trou sans
   * qu'aucun test ne bouge.
   *
   * Le contrôle ne dépend donc plus de ce que son auteur a pensé à inspecter :
   * il part du catalogue, énumère TOUTES les colonnes de la table, et exige que
   * chacune soit soit demandée, soit exclue AVEC SA RAISON.
   *
   * Il échoue dans les DEUX SENS : une colonne ajoutée à la table sans décision
   * fait rougir, et une exclusion devenue fausse — la colonne est demandée alors
   * qu'elle est déclarée exclue — aussi.
   */
  test("chaque colonne de la table est soit demandée, soit exclue avec sa raison", async () => {
    const EXCLUES = new Map<string, string>([
      ["internal_notes", "porte le prix d'achat : absente de la vue publique ET de l'export"],
      ["unsubscribe_token", "un jeton, un pouvoir — il n'ouvre pas la page"],
      ["notify_email", "donnée de contact, inutile à la liste"],
      ["shop_id", "posé par la RLS, jamais lu ni réécrit par l'écran"],
      ["cover_media_id", "les médias n'existent pas encore ; à demander quand la vignette arrivera"],
      ["carrier_code", "la liste affiche le numéro de suivi, pas le transporteur"],
      ["first_content_at", "sert à l'instrumentation, pas à l'affichage"],
      ["created_event_at", "trace d'émission de order_created : une mesure, pas une donnée d'écran"],
      ["recherche", "colonne générée, filtrée en base : la rendre serait la dupliquer"],
    ]);

    const colonnes = await interroger<{ column_name: string }>(
      catalogue,
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'orders'`,
    );

    // Un ensemble vide passe tout : sans cette borne, une requête qui ne
    // ramènerait rien validerait n'importe quelle sélection.
    expect(colonnes.length).toBeGreaterThan(10);

    const demandees = new Set(COLONNES.split(",").map((c) => c.trim()));

    const sansDecision = colonnes
      .map((c) => c.column_name)
      .filter((nom) => !demandees.has(nom) && !EXCLUES.has(nom));

    expect(
      sansDecision,
      "Colonnes de `orders` que la liste ne demande pas et qui ne sont pas " +
        "déclarées exclues : " +
        sansDecision.join(", ") +
        ". Chacune doit faire l'objet d'une décision explicite, avec sa raison.",
    ).toEqual([]);

    const exclusionsContredites = [...EXCLUES.keys()].filter((nom) => demandees.has(nom));
    expect(
      exclusionsContredites,
      "Colonnes déclarées exclues mais RÉELLEMENT demandées : " +
        exclusionsContredites.join(", "),
    ).toEqual([]);

    const exclusionsFantomes = [...EXCLUES.keys()].filter(
      (nom) => !colonnes.some((c) => c.column_name === nom),
    );
    expect(
      exclusionsFantomes,
      "Exclusions portant sur des colonnes qui n'existent plus : " + exclusionsFantomes.join(", "),
    ).toEqual([]);
  });
});

describe("Filtres et recherche", () => {
  test("les archivées sont exclues par défaut et visibles sur demande", async () => {
    const actives = await lire(alice);
    expect(actives.lignes.map((l) => l.client)).not.toContain("Archivée");

    const archivees = await lire(alice, defauts({ archivees: true }));
    expect(archivees.lignes.map((l) => l.client)).toEqual(["Archivée"]);
  });

  test("le filtre de statut restreint sans rien perdre", async () => {
    const livrees = await lire(alice, defauts({ statut: "livre" }));
    expect(livrees.lignes.length).toBeGreaterThan(0);
    for (const l of livrees.lignes) expect(l.statut).toBe("livre");
  });

  /**
   * LA RECHERCHE DOIT REPLIER LES ACCENTS DES DEUX CÔTÉS. Interroger l'EFFET, et
   * pas la présence d'une déclaration : « la recherche plein texte est en
   * place » restait vrai pendant que l'index ne repliait pas les accents.
   */
  test("« creme » trouve « Crème », et « Crème » se trouve lui-même", async () => {
    for (const saisie of ["creme", "Crème", "CRÈME", "crEme"]) {
      const page = await lire(alice, defauts({ q: saisie }));
      expect(
        page.lignes.map((l) => l.client),
        `la saisie « ${saisie} » n'a rien trouvé`,
      ).toContain("Crème du Marché");
    }
  });

  test("contre-test : une recherche sans correspondance rend une liste vide", async () => {
    const page = await lire(alice, defauts({ q: "zzzz-introuvable" }));
    expect(page.lignes).toEqual([]);
    // ET le compte n'est PAS déclaré vide : c'est le filtre qui ne rend rien.
    expect(page.compteVide).toBe(false);
  });

  /**
   * Le `%` saisi par un utilisateur ne doit pas devenir un joker. Ce test
   * interroge l'effet réel à travers PostgREST : l'échappement par contre-oblique
   * est une hypothèse sur le comportement du serveur, pas une certitude tirée
   * d'une documentation.
   */
  test("un « % » saisi est cherché comme un caractère, pas comme un joker", async () => {
    const litteral = await lire(alice, defauts({ q: "100% coton" }));
    expect(litteral.lignes.map((l) => l.client)).toContain("100% coton");

    // « 100%coton » sans espace ne doit RIEN trouver : si le `%` était un joker,
    // il comblerait l'espace manquant et la ligne remonterait.
    const joker = await lire(alice, defauts({ q: "100%coton" }));
    expect(
      joker.lignes.map((l) => l.client),
      "le % a été interprété comme un joker",
    ).not.toContain("100% coton");
  });
});

describe("Pagination", () => {
  test("l'état vide distingue le compte vide du filtre stérile", async () => {
    // Bob n'a qu'une commande : filtrée sur un statut absent, la page est vide
    // SANS que le compte le soit.
    const filtre = await lire(bob, defauts({ statut: "livre" }));
    expect(filtre.lignes).toEqual([]);
    expect(filtre.compteVide).toBe(false);
  });

  test("sans page suivante, aucun curseur n'est proposé", async () => {
    const page = await lire(bob);
    expect(page.suivant).toBeNull();
  });
});
