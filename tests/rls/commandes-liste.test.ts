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
  motifRecherche,
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
/** Une seule commande, ARCHIVÉE : le compte dont la liste est vide sans filtre. */
let carla: UtilisateurDeTest;
/** Aucune commande du tout : le compte réellement neuf. */
let dylan: UtilisateurDeTest;
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
  carla = await creerUtilisateur("liste-carla");
  dylan = await creerUtilisateur("liste-dylan");

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

  // Carla reproduit le compte de Wassim au 27/08/2026 : des commandes existent,
  // TOUTES archivées. Dylan n'en a aucune. Sans ces deux comptes, les trois
  // diagnostics d'écran vide ne seraient jamais tous exercés, et deux d'entre
  // eux pourraient rendre n'importe quoi sans qu'une suite verte le signale.
  const { error: erreurCarla } = await carla.client
    .from("orders")
    .insert({ shop_id: carla.shopId, customer_label: "Rangée", product_ref: "CARLA-1" });
  expect(erreurCarla, `insertion impossible pour Carla : ${erreurCarla?.message}`).toBeNull();

  await carla.client
    .from("orders")
    .update({ archived_at: new Date().toISOString() })
    .eq("customer_label", "Rangée");
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await supprimerUtilisateur(carla);
  await supprimerUtilisateur(dylan);
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
      ["first_content_at", "sert à l'instrumentation, pas à l'affichage"],
      ["created_event_at", "trace d'émission de order_created : une mesure, pas une donnée d'écran"],
      [
        "qc_decide_par",
        "QUI a arbitré le contrôle qualité — le client par sa page, ou le vendeur " +
          "qui reporte une réponse reçue en message privé. La liste n'affiche que " +
          "le statut : l'auteur sert à ne pas écrire « VOUS avez validé » à un " +
          "client qui n'a rien validé, et à ne pas mélanger les deux dans les " +
          "compteurs. Une colonne de plus sur cet écran serait du bruit.",
      ],
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
    expect(page.diagnostic).toBe("filtre-trop-etroit");
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

/**
 * LES TROIS RAISONS D'UNE LISTE VIDE, chacune éprouvée sur un compte qui la
 * produit réellement.
 *
 * La troisième — tout archivé — manquait au produit, et son absence a été
 * trouvée en pilotant l'écran, pas en le relisant : l'interface annonçait
 * « aucune ne passe les filtres en cours » sans qu'aucun filtre soit posé, et
 * offrait « Tout effacer » vers l'adresse déjà ouverte. Un bouton qui ne fait
 * rien enseigne que le produit ne répond pas.
 *
 * Les trois valeurs sont exercées ici, et le sont par des comptes DISTINCTS :
 * une suite qui n'en produirait qu'une passerait au vert en ne prouvant que
 * celle-là.
 */
describe("Les trois états vides", () => {
  test("un filtre stérile sur un compte qui a des commandes actives", async () => {
    // Bob n'a qu'une commande : filtrée sur un statut absent, la page est vide
    // SANS que le compte le soit.
    const filtre = await lire(bob, defauts({ statut: "livre" }));
    expect(filtre.lignes).toEqual([]);
    expect(filtre.diagnostic).toBe("filtre-trop-etroit");
  });

  test("un compte dont TOUT est archivé se dit archivé, pas filtré", async () => {
    const page = await lire(carla);
    expect(page.lignes).toEqual([]);
    expect(page.diagnostic).toBe("tout-archive");
  });

  test("contre-test : la commande de Carla EXISTE, et les archives la montrent", async () => {
    // Sans ce contre-test, « tout-archive » serait indiscernable d'un compte que
    // la RLS empêcherait simplement de lire quoi que ce soit.
    const archives = await lire(carla, defauts({ archivees: true }));
    expect(archives.lignes.map((l) => l.client)).toEqual(["Rangée"]);
    expect(archives.diagnostic).toBeNull();
  });

  test("un compte neuf se dit vide, et n'est pas confondu avec un archivage", async () => {
    const page = await lire(dylan);
    expect(page.lignes).toEqual([]);
    expect(page.diagnostic).toBe("aucune-commande");
  });

  test("une page qui contient des lignes ne porte AUCUN diagnostic", async () => {
    // Le diagnostic répond à « pourquoi est-ce vide ». Sur une page pleine, la
    // question ne se pose pas — un booléen y aurait répondu quand même.
    const page = await lire(alice);
    expect(page.lignes.length).toBeGreaterThan(0);
    expect(page.diagnostic).toBeNull();
  });
});

/**
 * LE FILTRE DE PÉRIODE, ÉPROUVÉ SUR LA BASE — pas sur une copie de la requête.
 *
 * LE PIÈGE QUE LE BRIEF NOMME : `au=<aujourd'hui>` vaut MINUIT. Comparé tel
 * quel, il exclut TOUTE la journée en cours. Le vendeur qui demande « jusqu'à
 * aujourd'hui » ne voit donc rien de ce qu'il vient de créer — c'est-à-dire
 * exactement ce qu'il cherchait. Et le défaut est silencieux : la liste n'est
 * pas vide, elle est INCOMPLÈTE.
 *
 * Les commandes d'Alice sont créées à l'instant par ce fichier : elles portent
 * donc la date du jour, ce qui rend ce cas éprouvable sans figer d'horloge.
 */
describe("La période", () => {
  const jour = (decalage: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + decalage);
    return d.toISOString().slice(0, 10);
  };

  test("« jusqu'à aujourd'hui » inclut ce qui a été créé aujourd'hui", async () => {
    const page = await lire(alice, defauts({ au: jour(0) }));
    expect(
      page.lignes.length,
      "la journée en cours est exclue : c'est le piège de la borne haute",
    ).toBeGreaterThan(0);
  });

  test("contre-test : une borne haute d'HIER n'en rend aucune", async () => {
    // Sans lui, le test précédent passerait avec un filtre qui ne filtre rien.
    const page = await lire(alice, defauts({ au: jour(-1) }));
    expect(page.lignes).toEqual([]);
  });

  test("la borne basse du jour laisse tout passer, celle de demain rien", async () => {
    const aujourdhui = await lire(alice, defauts({ du: jour(0) }));
    expect(aujourdhui.lignes.length).toBeGreaterThan(0);

    const demain = await lire(alice, defauts({ du: jour(1) }));
    expect(demain.lignes).toEqual([]);
  });

  test("les deux bornes ensemble encadrent la journée", async () => {
    const page = await lire(alice, defauts({ du: jour(0), au: jour(0) }));
    expect(page.lignes.length).toBeGreaterThan(0);
  });

  test("une période hors sujet le dit comme un filtre, pas comme un compte vide", async () => {
    const page = await lire(alice, defauts({ du: "2020-01-01", au: "2020-01-31" }));
    expect(page.lignes).toEqual([]);
    expect(page.diagnostic).toBe("filtre-trop-etroit");
  });
});

describe("Pagination", () => {

  test("sans page suivante, aucun curseur n'est proposé", async () => {
    const page = await lire(bob);
    expect(page.suivant).toBeNull();
  });
});

describe("Le tri « bloqué en transit »", () => {
  /**
   * LE TRI QUI FAIT GAGNER DU TEMPS. Il répond à « quels colis dois-je
   * relancer » — la seule question de cet écran dont la réponse n'est pas
   * visible en parcourant la liste.
   *
   * Il s'appuie sur `parcel_last_movement_at`, écrit UNIQUEMENT par
   * l'ingestion de suivi. Ces contrôles posent donc la colonne par le chemin
   * qui l'écrit réellement en production — jamais à la main : une valeur posée
   * directement prouverait que le tri sait trier, pas que le produit sait la
   * renseigner.
   */
  const NUMERO_ANCIEN = "BLOQ-ANCIEN-8821";
  const NUMERO_RECENT = "BLOQ-RECENT-8822";
  const NUMERO_JAMAIS = "BLOQ-JAMAIS-8823";

  let ancienne = "";
  let recente = "";
  let jamaisPartie = "";

  beforeAll(async () => {
    const creer = async (numero: string): Promise<string> => {
      const l = await interroger<{ id: string }>(
        catalogue,
        `insert into public.orders (shop_id, customer_label, tracking_number, status)
         values ($1, $2, $3, 'preparation') returning id`,
        [alice.shopId, "bloq-" + numero, numero],
      );
      const id = l[0]?.id ?? "";
      const c = await interroger<{ id: string }>(
        catalogue,
        "insert into public.tracked_parcels (shop_id, tracking_number) values ($1,$2) returning id",
        [alice.shopId, numero],
      );
      await interroger(
        catalogue,
        "insert into public.order_parcels (order_id, parcel_id) values ($1,$2)",
        [id, c[0]?.id],
      );
      return id;
    };

    ancienne = await creer(NUMERO_ANCIEN);
    recente = await creer(NUMERO_RECENT);
    jamaisPartie = await creer(NUMERO_JAMAIS);

    const ingerer = (numero: string, instant: string) =>
      interroger(
        catalogue,
        `select colis from public.appliquer_etat_colis(
           $1, 'en_transit'::public.parcel_status, 'brut', '', $2::jsonb, '', '', '{}'::jsonb, ''
         )`,
        [numero, JSON.stringify([{ instant, description: "Scan", lieu: "", etape: "" }])],
      );

    await ingerer(NUMERO_ANCIEN, "2026-06-01T10:00:00Z");
    await ingerer(NUMERO_RECENT, "2026-08-20T10:00:00Z");

    // `jamaisPartie` reçoit un état SANS aucun point de passage : le colis est
    // pris en charge mais rien n'a encore bougé. C'est le cas que le tri doit
    // ÉCARTER, et il n'est pas rare — c'est l'état de toute commande fraîchement
    // expédiée.
    await interroger(
      catalogue,
      `select colis from public.appliquer_etat_colis(
         $1, 'en_transit'::public.parcel_status, 'brut', '', '[]'::jsonb, '', '', '{}'::jsonb, ''
       )`,
      [NUMERO_JAMAIS],
    );
  }, 60_000);

  test("le colis le plus immobile vient EN TÊTE", async () => {
    const page = await lire(alice, defauts({ tri: "bloquees" }));

    const ids = page.lignes.map((l) => l.id);
    expect(ids.length, "le tri ne rend rien : il ne prouve alors aucun ordre").toBeGreaterThan(1);
    expect(
      ids.indexOf(ancienne),
      "la commande dont le colis n'a pas bougé depuis juin devrait être en tête",
    ).toBeLessThan(ids.indexOf(recente));
  });

  test("un colis qui n'a JAMAIS bougé n'est pas « bloqué »", async () => {
    /*
     * Ce n'est pas une commodité technique. Un colis sans mouvement n'est pas
     * bloqué, il n'est pas encore parti — et à deux cents commandes par
     * semaine, les mélanger noierait les vrais blocages sous les expéditions du
     * jour, c'est-à-dire supprimerait l'information que ce tri existe pour
     * donner.
     */
    const page = await lire(alice, defauts({ tri: "bloquees" }));
    expect(page.lignes.map((l) => l.id)).not.toContain(jamaisPartie);
  });

  test("le tri RESTREINT aux commandes en transit", async () => {
    const page = await lire(alice, defauts({ tri: "bloquees" }));
    expect(page.lignes.length, "un ensemble vide passerait tout").toBeGreaterThan(0);
    for (const ligne of page.lignes) {
      expect(ligne.statut, `${ligne.client} n'est pas en transit`).toBe("en_transit");
    }
  });

  test("CONTRE-TEST : sans ce tri, les mêmes commandes ne sont pas ordonnées ainsi", async () => {
    /*
     * Sans lui, un tri qui rendrait n'importe quel ordre passerait le premier
     * contrôle une fois sur deux — et « une fois sur deux » est exactement ce
     * qu'on ne veut pas d'une suite bloquante.
     *
     * Le tri par défaut est la date de CRÉATION : les trois commandes ont été
     * créées dans l'ordre ancien, récent, jamais-partie, donc `recentes` les
     * rend dans l'ordre INVERSE de `bloquees`.
     */
    const page = await lire(alice, defauts({ tri: "recentes" }));
    const ids = page.lignes.map((l) => l.id);
    expect(ids.indexOf(ancienne)).toBeGreaterThan(ids.indexOf(recente));
  });

  test("l'isolation tient sur ce tri comme sur les autres", async () => {
    const page = await lire(bob, defauts({ tri: "bloquees" }));
    for (const ligne of page.lignes) {
      expect(ligne.id, "une commande d'Alice est apparue chez Bob").not.toBe(ancienne);
      expect(ligne.id).not.toBe(recente);
    }
  });
});

/**
 * LES DEUX REPLIS D'ACCENTS DOIVENT COÏNCIDER — ET C'EST LA BASE QUI ARBITRE.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. La colonne indexée contient
 * `sans_accents(lower(col))` ; la saisie, elle, passait par `normalize("NFD")`.
 * NFD isole les diacritiques COMBINANTS — d'où « creme » → « Crème », qui
 * marchait — mais `ø`, `æ`, `œ`, `ß`, `ł`, `ð`, `þ`, `ı` n'en portent aucun :
 * ce sont des lettres à part entière, que NFD laisse intactes et qu'`unaccent`
 * replie.
 *
 * Taper « Søren » ne trouvait donc PAS la commande de Søren, alors que taper
 * « soren » la trouvait. Le sens de l'erreur est celui qui se voit le moins :
 * la liste n'est pas vide, elle est incomplète.
 *
 * CE TEST NE RECOPIE AUCUNE TABLE. Il demande à Postgres ce qu'`unaccent`
 * replie, et compare. Une divergence future — une mise à jour du dictionnaire,
 * une règle qu'on aurait devinée — se verra ici au lieu de se deviner.
 *
 * LES TESTS UNITAIRES EXISTANTS N'ÉPROUVAIENT QUE « Crème » et « ÉTÉ » : les
 * deux seuls cas où NFD et unaccent coïncident par construction. Le garde
 * regardait là où il ne pouvait rien trouver.
 */
describe("Le repli d'accents de la saisie est celui de la base", () => {
  const MOTS = [
    "Crème",
    "ÉTÉ",
    "Søren",
    "Cœur",
    "Æther",
    "Straße",
    "Łódź",
    "Ðja",
    "Þor",
    "ıst",
    "Ñandú",
    "Çà et là",
  ];

  test("chaque mot se replie de la même façon des deux côtés", async () => {
    const lignes = await interroger<{ saisie: string; base: string }>(
      catalogue,
      `select m as saisie, public.sans_accents(lower(m)) as base
         from unnest($1::text[]) as m`,
      [MOTS],
    );

    // UN ENSEMBLE VIDE PASSE TOUT : si la requête rendait zéro ligne, la boucle
    // ci-dessous ne comparerait rien et le test serait vert et muet.
    expect(lignes.length, "la sonde ne compare rien").toBe(MOTS.length);

    const ecarts = lignes
      .filter((l) => motifRecherche(l.saisie) !== l.base)
      .map((l) => `« ${l.saisie} » → application « ${motifRecherche(l.saisie)} » vs base « ${l.base} »`);

    expect(
      ecarts,
      "les deux replis divergent : taper le mot exact ne trouverait pas la commande",
    ).toEqual([]);
  });

  test("contre-test : la sonde SAIT reconnaître une divergence", () => {
    // Sans lui, une comparaison toujours vraie — deux chaînes vides, par
    // exemple — passerait à 100 % sans rien prouver.
    expect(motifRecherche("Søren")).not.toBe("søren");
    expect(motifRecherche("Søren")).toBe("soren");
  });
});
