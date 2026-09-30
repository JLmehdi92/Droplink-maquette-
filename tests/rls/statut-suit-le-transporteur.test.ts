import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LE STATUT DE LA COMMANDE SUIT LE TRANSPORTEUR.
 *
 * DÉFAUT RÉEL, ET IL COUPAIT LE PRODUIT EN DEUX. `appliquer_etat_colis`
 * n'écrivait que dans `tracked_parcels`. Le tableau de bord lit `orders.status`,
 * une colonne que seul le vendeur posait. Le transporteur annonçait « livré »,
 * la page du client l'affichait, l'écran Envois l'affichait — et la GESTION DE
 * COMMANDES restait sur « préparation ». À deux cents commandes par semaine,
 * cela veut dire repasser chaque ligne à la main, c'est-à-dire refaire
 * exactement le travail que le suivi automatique existe pour supprimer.
 *
 * Rien ne le signalait : les deux colonnes existent, les deux écrans répondent,
 * aucune requête n'échoue. Une divergence silencieuse entre deux sources de
 * vérité, qui grandit avec l'usage.
 *
 * CES CONTRÔLES PASSENT PAR LA CONNEXION DE CATALOGUE : la fonction est
 * `security definer` et révoquée à `anon` comme à `authenticated`. L'éprouver
 * sous le rôle d'un vendeur ne prouverait que la révocation — une ABSENCE — et
 * non ce qu'elle fait quand elle est légitimement appelée.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

let compteur = 0;
function numeroNeuf(): string {
  compteur += 1;
  return `STATUT-${Date.now()}-${compteur}`;
}

type Commande = {
  readonly id: string;
  readonly status: string;
  readonly updated_at: string;
  readonly parcel_last_movement_at: string | null;
  // `interroger` exige une signature d'index : une interface nommée ne la porte
  // pas implicitement, un alias de type objet si.
  readonly [clef: string]: unknown;
};

async function creerCommande(u: UtilisateurDeTest, numero: string): Promise<string> {
  const l = await interroger<{ id: string }>(
    catalogue,
    `insert into public.orders (shop_id, customer_label, tracking_number, status)
     values ($1, 'client', $2, 'preparation') returning id`,
    [u.shopId, numero],
  );
  const id = l[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

/** Attache un colis à une commande, comme le fait `attacher_colis`. */
async function attacher(u: UtilisateurDeTest, commande: string, numero: string): Promise<string> {
  const c = await interroger<{ id: string }>(
    catalogue,
    "insert into public.tracked_parcels (shop_id, tracking_number) values ($1,$2) returning id",
    [u.shopId, numero],
  );
  const id = c[0]?.id;
  if (id === undefined) throw new Error("colis non enregistré");
  await interroger(
    catalogue,
    "insert into public.order_parcels (order_id, parcel_id) values ($1,$2)",
    [commande, id],
  );
  return id;
}

async function lire(id: string): Promise<Commande> {
  const l = await interroger<Commande>(
    catalogue,
    "select id, status::text as status, updated_at, parcel_last_movement_at from public.orders where id = $1",
    [id],
  );
  const c = l[0];
  if (c === undefined) throw new Error("commande introuvable");
  return c;
}

/**
 * ⚠️ `select * from ...` ET NON `select f(...)`.
 *
 * Depuis la 092 la fonction rend une LIGNE à deux colonnes. Appelée dans la
 * liste de sélection, elle rendrait un enregistrement composite — soit la chaîne
 * `(1,t)` côté client — et `l[0].colis` vaudrait `undefined`. Le test ne
 * lèverait pas : il comparerait `undefined` et passerait à côté de tout.
 */
async function ingerer(
  numero: string,
  etape: string,
  points: readonly { instant: string; description: string }[],
): Promise<{ colis: number; premierScan: boolean }> {
  const l = await interroger<{ colis: number; premier_scan: boolean }>(
    catalogue,
    `select colis, premier_scan from public.appliquer_etat_colis(
       $1, $2::public.parcel_status, 'brut', '', $3::jsonb, '', '', '{}'::jsonb, ''
     )`,
    [numero, etape, JSON.stringify(points.map((p) => ({ ...p, lieu: "", etape: "" })))],
  );
  return { colis: l[0]?.colis ?? 0, premierScan: l[0]?.premier_scan === true };
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("statut-alice");
  bob = await creerUtilisateur("statut-bob");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; Alice en crée une dizaine, chacune avec son colis, et ce
  // test mesure la descente du statut depuis le transporteur, pas le quota.
  await passerEnPro(alice);
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("La descente du statut", () => {
  test("un état rapporté par le transporteur avance la commande", async () => {
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    const avant = await lire(commande);
    expect(avant.status, "la commande devrait partir de `preparation`").toBe("preparation");
    expect(avant.parcel_last_movement_at).toBeNull();

    await ingerer(numero, "en_transit", [
      { instant: "2026-08-20T10:00:00Z", description: "Départ du centre de tri" },
    ]);

    const apres = await lire(commande);
    expect(apres.status, "le statut du transporteur n'est pas descendu dans la commande").toBe(
      "en_transit",
    );
    expect(
      apres.parcel_last_movement_at,
      "la date du dernier mouvement n'est pas descendue",
    ).not.toBeNull();
  });

  test("LE STATUT NE RECULE JAMAIS, même si le fournisseur régresse", async () => {
    /*
     * Le cas n'est pas théorique : une notification rejouée, un point de
     * passage arrivé en retard, ou une régression chez le fournisseur suffisent.
     * Un statut qui recule chez le CLIENT est le défaut le plus visible que ce
     * produit puisse produire — « mon colis était livré, il est reparti ».
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    await ingerer(numero, "livre", [
      { instant: "2026-08-21T10:00:00Z", description: "Livré" },
    ]);
    expect((await lire(commande)).status).toBe("livre");

    await ingerer(numero, "preparation", [
      { instant: "2026-08-19T10:00:00Z", description: "En préparation" },
    ]);
    expect(
      (await lire(commande)).status,
      "le statut a RECULÉ — la règle `greatest` en base ne tient plus",
    ).toBe("livre");
  });

  test("une commande déjà marquée `livré` par le vendeur n'est pas rabaissée", async () => {
    // L'autre sens de la même règle, et il compte autant : le vendeur qui a
    // constaté la remise en main propre ne doit pas voir sa commande repasser
    // « en transit » parce que le transporteur est en retard d'un scan.
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);
    await interroger(catalogue, "update public.orders set status = 'livre' where id = $1", [
      commande,
    ]);

    await ingerer(numero, "en_transit", [
      { instant: "2026-08-20T11:00:00Z", description: "En transit" },
    ]);
    expect((await lire(commande)).status).toBe("livre");
  });
});

describe("`updated_at` reste la date du VENDEUR", () => {
  test("une mise à jour venue du transporteur ne touche pas `updated_at`", async () => {
    /*
     * LE PIÈGE QUI A FAILLI PASSER. `orders_toucher_updated_at` était un
     * `BEFORE UPDATE` inconditionnel : la descente du statut aurait fait
     * remonter `updated_at` à CHAQUE passage de cadence.
     *
     * À deux cents commandes par semaine, le vendeur verrait ses commandes se
     * réordonner toutes seules plusieurs fois par jour et lirait « modifiée il
     * y a deux minutes » partout. Le tri « modifiées » deviendrait du bruit, et
     * RIEN N'INDIQUERAIT POURQUOI — aucune erreur, aucune trace.
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);
    const avant = await lire(commande);

    // Une seconde franche : sans elle, deux `now()` de la même seconde
    // rendraient le contrôle incapable de distinguer « inchangé » de
    // « réécrit à l'identique ».
    await new Promise((r) => setTimeout(r, 1100));
    await ingerer(numero, "en_transit", [
      { instant: "2026-08-22T10:00:00Z", description: "En transit" },
    ]);

    const apres = await lire(commande);
    expect(apres.status, "le contrôle ne prouve rien si rien n'a changé").toBe("en_transit");
    expect(
      new Date(apres.updated_at).getTime(),
      "`updated_at` a bougé : le tri « modifiées » se réordonnera à chaque interrogation",
    ).toBe(new Date(avant.updated_at).getTime());
  });

  test("CONTRE-TEST POSITIF : une écriture du VENDEUR fait bien bouger `updated_at`", async () => {
    /*
     * Sans lui, un déclencheur qui ne daterait PLUS RIEN passerait le contrôle
     * ci-dessus à cent pour cent. C'est exactement la suite où tout est refusé
     * et qui ne prouve rien.
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    const avant = await lire(commande);

    await new Promise((r) => setTimeout(r, 1100));
    await interroger(catalogue, "update public.orders set product_ref = 'ref-2' where id = $1", [
      commande,
    ]);

    const apres = await lire(commande);
    expect(
      new Date(apres.updated_at).getTime(),
      "`updated_at` ne bouge plus du tout : le tri « modifiées » ne mesure plus rien",
    ).toBeGreaterThan(new Date(avant.updated_at).getTime());
  });

  test("le marqueur ne survit pas à la transaction", async () => {
    /*
     * Le marqueur est posé `local` — il retombe au `commit`. S'il ne l'était
     * pas, la connexion resterait marquée dans le pool, et les écritures
     * SUIVANTES d'un vendeur quelconque cesseraient silencieusement de dater.
     * Le défaut serait intermittent, dépendrait de la connexion tirée, et
     * n'apparaîtrait qu'après le premier passage de cadence de la journée.
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);
    await ingerer(numero, "en_transit", [
      { instant: "2026-08-23T10:00:00Z", description: "En transit" },
    ]);

    const avant = await lire(commande);
    await new Promise((r) => setTimeout(r, 1100));
    await interroger(catalogue, "update public.orders set product_ref = 'apres' where id = $1", [
      commande,
    ]);

    expect(
      new Date((await lire(commande)).updated_at).getTime(),
      "le marqueur a survécu à l'ingestion : cette connexion ne date plus les modifications",
    ).toBeGreaterThan(new Date(avant.updated_at).getTime());
  });
});

describe("Isolation entre vendeurs", () => {
  test("le colis d'un vendeur ne touche QUE ses commandes", async () => {
    /*
     * LE CONTRÔLE LE PLUS IMPORTANT DE CE FICHIER.
     *
     * `appliquer_etat_colis` boucle sur TOUS les colis portant le numéro, tous
     * vendeurs confondus — et c'est voulu : deux vendeurs peuvent expédier sous
     * le même numéro, et chacun doit voir avancer SON colis. La descente dans
     * les commandes passe par `order_parcels`, donc par le colis de chaque
     * vendeur pris séparément.
     *
     * Une jointure écrite un cran trop large — sur le NUMÉRO plutôt que sur
     * l'identifiant du colis — écrirait dans les commandes du voisin. Rien ne
     * le signalerait : les deux vendeurs suivent le même colis, donc les deux
     * statuts avanceraient « correctement ». Le défaut n'apparaîtrait que le
     * jour où l'un des deux a marqué sa commande autrement.
     */
    const numero = numeroNeuf();

    const chezAlice = await creerCommande(alice, numero);
    await attacher(alice, chezAlice, numero);

    const chezBob = await creerCommande(bob, numero);
    // Bob a le même numéro mais SON colis n'est pas attaché à sa commande.
    await interroger(
      catalogue,
      "insert into public.tracked_parcels (shop_id, tracking_number) values ($1,$2)",
      [bob.shopId, numero],
    );

    await ingerer(numero, "livre", [
      { instant: "2026-08-24T10:00:00Z", description: "Livré" },
    ]);

    expect((await lire(chezAlice)).status, "la commande d'Alice n'a pas suivi").toBe("livre");
    expect(
      (await lire(chezBob)).status,
      "LA COMMANDE DE BOB A ÉTÉ ÉCRITE par le colis d'Alice : la descente vise " +
        "le numéro et non le colis.",
    ).toBe("preparation");
  });

  test("CONTRE-TEST : le colis de Bob, lui, met bien SA commande à jour", async () => {
    // Sans ce sens-là, une descente qui n'écrirait JAMAIS rien passerait le
    // contrôle d'isolation ci-dessus sans rien prouver.
    const numero = numeroNeuf();
    const chezBob = await creerCommande(bob, numero);
    await attacher(bob, chezBob, numero);

    await ingerer(numero, "expedie", [
      { instant: "2026-08-25T10:00:00Z", description: "Pris en charge" },
    ]);
    expect((await lire(chezBob)).status).toBe("expedie");
  });
});

/**
 * LE PREMIER SCAN EST UNE TRANSITION, PAS UN ÉTAT.
 *
 * C'est la distinction qui a fait débrancher cet événement pendant plusieurs
 * mois. « Ce colis a bougé » est un état — vrai à chaque interrogation d'un
 * colis en route. « Ce colis vient de bouger pour la première fois » est un
 * franchissement, vrai UNE FOIS dans sa vie, et seule la base peut le voir :
 * elle seule connaît l'état d'avant, dans l'instruction même qui l'écrase.
 *
 * Avant d'être débranché il était pire qu'absent : il était choisi quand
 * l'étape valait « livré », donc il comptait des LIVRAISONS sous le nom de
 * premiers scans. Une métrique légèrement faussée est pire qu'une métrique
 * cassée, parce qu'elle reste crédible.
 */
describe("Le premier scan", () => {
  test("il est signalé au tout premier mouvement", async () => {
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    const premier = await ingerer(numero, "expedie", [
      { instant: "2026-08-20T10:00:00Z", description: "Pris en charge" },
    ]);
    expect(premier.colis, "aucun colis touché : rien n'est éprouvé").toBe(1);
    expect(premier.premierScan, "le premier mouvement n'a pas été signalé").toBe(true);
  });

  test("il n'est PAS resignalé aux mouvements suivants", async () => {
    /*
     * LE CONTRÔLE QUI COMPTE. L'ingestion est appelée à chaque passage de
     * cadence et à chaque notification poussée — un colis long en produit des
     * dizaines. Un événement émis à chaque fois ferait compter les
     * INTERROGATIONS sous le nom des départs, exactement le défaut que ce
     * produit a déjà attrapé sur « colis pris en charge ».
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    await ingerer(numero, "expedie", [
      { instant: "2026-08-20T10:00:00Z", description: "Pris en charge" },
    ]);
    const deuxieme = await ingerer(numero, "en_transit", [
      { instant: "2026-08-21T10:00:00Z", description: "Départ du centre de tri" },
    ]);
    expect(deuxieme.colis, "le second passage n'a rien touché").toBe(1);
    expect(deuxieme.premierScan, "le premier scan a été signalé DEUX fois").toBe(false);

    // Et une troisième fois, sans aucun point nouveau : c'est la forme la plus
    // fréquente — un colis bloqué que la cadence réinterroge chaque jour.
    const troisieme = await ingerer(numero, "en_transit", []);
    expect(troisieme.premierScan).toBe(false);
  });

  test("un colis qui n'a encore RIEN à raconter ne déclenche pas de premier scan", async () => {
    /*
     * HORS DU CAS MOTIVANT. Un numéro fraîchement collé n'est souvent pas encore
     * scanné : le fournisseur répond, l'état est appliqué, et pourtant aucun
     * mouvement n'existe. Signaler un départ ici ferait compter comme partis des
     * colis encore sur l'établi du vendeur — et ce cas-là est le plus fréquent
     * de tous, puisqu'il précède tous les autres.
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    const vide = await ingerer(numero, "preparation", []);
    expect(vide.colis, "le colis n'a pas été touché : rien n'est éprouvé").toBe(1);
    expect(vide.premierScan, "un départ a été signalé pour un colis jamais scanné").toBe(false);
  });

  test("un point ARRIVÉ EN RETARD ne rejoue pas le premier scan", async () => {
    /*
     * SECONDE FALSIFICATION, hors du cas motivant elle aussi. Les transporteurs
     * rendent l'historique complet et pas toujours dans l'ordre : un point plus
     * ANCIEN que tous les autres arrive après coup, et il fait bel et bien
     * reculer `first_movement_at` — c'est voulu, `least()` le veut.
     *
     * Ce qu'il ne doit pas faire, c'est ressembler à un départ. La transition
     * observée est NULL → valeur, jamais « la date a changé » : confondre les
     * deux ferait émettre un second départ des semaines après le vrai.
     */
    const numero = numeroNeuf();
    const commande = await creerCommande(alice, numero);
    await attacher(alice, commande, numero);

    await ingerer(numero, "en_transit", [
      { instant: "2026-08-20T10:00:00Z", description: "Départ du centre de tri" },
    ]);
    const retard = await ingerer(numero, "en_transit", [
      { instant: "2026-08-18T08:00:00Z", description: "Étiquette créée" },
    ]);
    expect(retard.premierScan, "un point arrivé en retard a rejoué le premier scan").toBe(false);
  });
});
