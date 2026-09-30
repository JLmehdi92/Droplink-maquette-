import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { creerUtilisateur, passerEnPro, supprimerUtilisateur, type UtilisateurDeTest } from "../aide/utilisateurs";
import {
  compterEnvois,
  decoderCurseur,
  encoderCurseur,
  lireEnvois,
  ParametresEnvois,
} from "@/lib/envois/liste";
import { SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";

/**
 * L'ÉCRAN DES ENVOIS.
 *
 * Il lit les colis, pas les commandes, et c'est toute la raison de son
 * existence : un numéro de suivi porte souvent PLUSIEURS commandes, et une liste
 * de commandes le répéterait autant de fois — le vendeur relancerait alors le
 * transporteur trois fois pour un colis unique.
 *
 * Deux propriétés portent le reste :
 *
 *  1. L'ISOLATION EST FAITE PAR LA RLS, pas par un `where` applicatif. Le module
 *     n'écrit AUCUN filtre sur `shop_id` : si la RLS tombait, ce test le verrait.
 *  2. LE SEUIL DE SILENCE EST UNIQUE. La liste filtrée et le compteur doivent
 *     rendre le MÊME nombre — un écran qui annonce douze colis silencieux et en
 *     liste neuf fait douter de tout le reste.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

const DEFAUTS = ParametresEnvois.parse({});

/*
 * UNE SEULE HORLOGE, PRISE À L'EXÉCUTION — ET C'EST LA CORRECTION.
 *
 * ⚠️ CETTE CONSTANTE ÉTAIT UNE DATE LITTÉRALE (`2026-08-21T12:00:00Z`), et les
 * colis étaient semés à des dates littérales elles aussi. Le test est donc parti
 * en rouge le 30/08/2026, sans qu'aucune ligne de code ait bougé : le colis
 * « qui a bougé hier » avait été écrit au 20/08, et il a franchi le seuil de dix
 * jours ce jour-là.
 *
 * Le rouge était JUSTE, et il désignait le bon endroit. La liste reçoit son
 * instant en argument — on pouvait donc le geler —, tandis que le compteur lit
 * `now()` DANS POSTGRES, où rien ne se gèle. Les deux horloges avaient neuf
 * jours d'écart, et la liste a continué de répondre selon le calendrier de son
 * auteur pendant que le compteur répondait selon le vrai. Le compteur voyait
 * trois colis silencieux, la liste un seul.
 *
 * ⚠️ LE PRODUIT, LUI, EST CORRECT : `compter_envois` et `lireEnvois` expriment
 * la MÊME règle (ni livré, ni abandonné, immobile depuis plus de
 * `SEUIL_SILENCE_JOURS`), et l'écran passe `new Date()` à la seconde près de
 * `now()`. C'était le test qui portait deux calendriers.
 *
 * Toute date de ce fichier est désormais DÉRIVÉE de cet instant. Un jeu dont le
 * sens dépend du jour où on le lit ne décrit plus ce qu'il prétend décrire.
 */
const MAINTENANT = new Date();

/** Un instant daté depuis l'horloge du test, jamais depuis le calendrier. */
function ilYa(jours: number): string {
  return new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();
}

/** Pose un colis chez `qui`, avec un dernier mouvement daté. */
async function poserColis(
  qui: UtilisateurDeTest,
  numero: string,
  options: {
    etat?: "preparation" | "expedie" | "en_transit" | "livre";
    dernierMouvement?: string | null;
    abandonne?: boolean;
  } = {},
): Promise<string> {
  const { data } = await qui.client
    .from("orders")
    .insert({ shop_id: qui.shopId, customer_label: "Client " + numero })
    .select("id")
    .single();

  const commande = (data as { id: string }).id;
  const attache = await qui.client.rpc("attacher_colis", {
    p_order_id: commande,
    p_numero: numero,
    p_transporteur: "3011",
  });

  const ligne = Array.isArray(attache.data) ? attache.data[0] : null;
  const parcelId = (ligne as { parcel_id: string } | null)?.parcel_id ?? "";
  expect(parcelId, "aucun colis attaché : la sonde n'inspecte rien").not.toBe("");

  // On écrit l'état par le catalogue : c'est la tâche de fond qui le fait en
  // production, et passer par elle ici exigerait un réseau.
  await interroger(
    catalogue,
    `update public.tracked_parcels
       set normalized_status = $2::public.parcel_status,
           last_movement_at = $3::timestamptz,
           abandoned_at = case when $4 then now() else null end
     where id = $1`,
    [parcelId, options.etat ?? "en_transit", options.dernierMouvement ?? null, options.abandonne ?? false],
  );

  return parcelId;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("envois-alice");
  bob = await creerUtilisateur("envois-bob");
  // PRO : depuis la 210 un compte gratuit ne crée que 5 commandes et ne fait suivre
  // que 5 colis à vie ; Alice en pose 9, et ce test mesure la liste des envois
  // (isolation, tri, seuil de silence, pagination), pas le quota.
  await passerEnPro(alice);

  // Trois colis chez Alice : un qui avance, un silencieux, un livré immobile.
  // Les écarts sont pris LOIN du seuil — un jour contre soixante — pour que la
  // seconde qui sépare l'horloge du test de celle de Postgres ne puisse jamais
  // faire basculer un colis d'un côté à l'autre.
  await poserColis(alice, "AL-EN-ROUTE-01", { etat: "en_transit", dernierMouvement: ilYa(1) });
  await poserColis(alice, "AL-SILENCE-02", { etat: "en_transit", dernierMouvement: ilYa(60) });
  await poserColis(alice, "AL-LIVRE-03", { etat: "livre", dernierMouvement: ilYa(90) });

  // Un colis chez Bob, volontairement le plus immobile de tous : s'il
  // apparaissait chez Alice, il serait EN TÊTE de son tri par défaut.
  await poserColis(bob, "BOB-TRES-VIEUX-01", {
    etat: "en_transit",
    dernierMouvement: ilYa(2_000),
  });
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

describe("Ce que le vendeur voit", () => {
  test("ses colis, et uniquement les siens", async () => {
    const page = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const numeros = page.lignes.map((l) => l.numero);

    expect(numeros.length, "la sonde n'inspecte aucun envoi").toBeGreaterThan(0);
    expect(numeros).toContain("AL-SILENCE-02");
    expect(numeros, "le colis de Bob a fuité chez Alice").not.toContain("BOB-TRES-VIEUX-01");
  });

  test("contre-test positif : Bob voit le sien", async () => {
    // Sans lui, une lecture qui ne rendrait JAMAIS rien passerait le test
    // précédent à 100 % sans rien prouver.
    const page = await lireEnvois(bob.client, DEFAUTS, MAINTENANT);
    expect(page.lignes.map((l) => l.numero)).toContain("BOB-TRES-VIEUX-01");
  });

  test("le tri par défaut fait remonter ce qui ne bouge plus", async () => {
    const page = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const numeros = page.lignes.map((l) => l.numero);

    // Le livré du 1er juin est plus ancien que le silencieux du 1er juillet :
    // l'ordre attendu est donc livré, silencieux, en route.
    expect(numeros.indexOf("AL-LIVRE-03")).toBeLessThan(numeros.indexOf("AL-SILENCE-02"));
    expect(numeros.indexOf("AL-SILENCE-02")).toBeLessThan(numeros.indexOf("AL-EN-ROUTE-01"));
  });

  test("un colis porte le nombre de commandes rattachées ET leurs destinataires", async () => {
    const page = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const ligne = page.lignes.find((l) => l.numero === "AL-SILENCE-02");
    expect(ligne?.commandes).toBe(1);
    // ⚠️ CE TEST DISAIT L'INVERSE, et il avait raison au moment où il a été
    // écrit. Les deux planches `Envois` et `EnvoisMobile` nomment la colonne
    // « Commandes liées » et y montrent « @yanis », « @lea.store, @nadia » : un
    // chiffre ne dit pas de QUI il s'agit, et c'est exactement ce que le vendeur
    // cherche en regardant un colis groupé. Le poids reste borné par la réalité
    // physique — un colis transporte ce qui tient dans un carton.
    expect(ligne?.clients).toEqual(["Client AL-SILENCE-02"]);
  });

  test("un destinataire vide n'ajoute pas un nom vide, et le compte le garde", async () => {
    // `customer_label` est un texte LIBRE et facultatif. Une commande sans
    // destinataire nommé existe : elle compte, elle ne se nomme pas.
    const { data } = await alice.client
      .from("orders")
      .insert({ shop_id: alice.shopId, customer_label: null })
      .select("id")
      .single();
    await alice.client.rpc("attacher_colis", {
      p_order_id: (data as { id: string }).id,
      p_numero: "AL-SILENCE-02",
      p_transporteur: "3011",
    });

    const page = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const ligne = page.lignes.find((l) => l.numero === "AL-SILENCE-02");
    expect(ligne?.commandes).toBe(2);
    expect(ligne?.clients).toEqual(["Client AL-SILENCE-02"]);
  });
});

/**
 * LE DERNIER POINT DE PASSAGE (migration 104).
 *
 * La colonne est tenue par un DÉCLENCHEUR, et c'est tout l'objet de ces
 * contrôles : aucun chemin applicatif ne l'écrit, donc rien dans le code ne
 * prouve qu'elle est juste. Seule l'exécution le montre.
 *
 * LE PIÈGE QU'ILS VISENT : le déclencheur RECALCULE au lieu de comparer. Une
 * version qui aurait testé « ce point est-il plus récent que le dernier
 * mouvement ? » aurait laissé passer plusieurs points d'une même rafale, et
 * c'est alors le DERNIER INSÉRÉ qui l'emporte — pas le plus récent. Le
 * fournisseur ne garantit aucun ordre dans son tableau, donc le test insère
 * DÉLIBÉRÉMENT dans le désordre.
 */
describe("Le dernier point de passage", () => {
  let colis: string;

  beforeAll(async () => {
    colis = await poserColis(alice, "AL-POINTS-04", {
      etat: "en_transit",
      dernierMouvement: ilYa(1),
    });
  }, 60_000);

  test("il est vide tant qu'aucun point n'est arrivé", async () => {
    const lignes = await interroger<{ dernier_point: string | null }>(
      catalogue,
      "select dernier_point from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(lignes[0]?.dernier_point).toBeNull();
  });

  test("le PLUS RÉCENT gagne, même inséré en premier", async () => {
    await interroger(
      catalogue,
      `insert into public.parcel_checkpoints (parcel_id, occurred_at, description)
       values ($1, '2026-08-20T10:00:00Z', 'Départ du centre de tri'),
              ($1, '2026-08-10T10:00:00Z', 'Pris en charge par le transporteur')`,
      [colis],
    );

    const lignes = await interroger<{ dernier_point: string | null }>(
      catalogue,
      "select dernier_point from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(lignes[0]?.dernier_point).toBe("Départ du centre de tri");
  });

  test("un point plus ancien arrivé APRÈS ne le remplace pas", async () => {
    await interroger(
      catalogue,
      `insert into public.parcel_checkpoints (parcel_id, occurred_at, description)
       values ($1, '2026-08-01T10:00:00Z', 'Colis préparé')`,
      [colis],
    );

    const lignes = await interroger<{ dernier_point: string | null }>(
      catalogue,
      "select dernier_point from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(lignes[0]?.dernier_point).toBe("Départ du centre de tri");
  });

  test("la suppression du dernier point rend la main au précédent", async () => {
    // La purge des points de passage existe. Sans le déclencheur sur `delete`,
    // la colonne garderait le nom d'un passage effacé — un écran qui affirme ce
    // que la base n'a plus.
    await interroger(
      catalogue,
      `delete from public.parcel_checkpoints
        where parcel_id = $1 and description = 'Départ du centre de tri'`,
      [colis],
    );

    const lignes = await interroger<{ dernier_point: string | null }>(
      catalogue,
      "select dernier_point from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(lignes[0]?.dernier_point).toBe("Pris en charge par le transporteur");
  });

  test("la liste rend la colonne, elle ne la recalcule pas", async () => {
    const page = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const ligne = page.lignes.find((l) => l.numero === "AL-POINTS-04");
    expect(ligne?.dernierPoint).toBe("Pris en charge par le transporteur");
  });

  test("le vendeur ne peut PAS écrire cette colonne", async () => {
    // Une valeur tenue par un déclencheur qu'un vendeur pourrait réécrire ne
    // serait plus un fait sur le colis, mais une affirmation de sa part.
    const { error } = await alice.client
      .from("tracked_parcels")
      .update({ dernier_point: "inventé" })
      .eq("id", colis);
    expect(error, "l'écriture a été acceptée : la colonne est ouverte").not.toBeNull();

    const lignes = await interroger<{ dernier_point: string | null }>(
      catalogue,
      "select dernier_point from public.tracked_parcels where id = $1",
      [colis],
    );
    expect(lignes[0]?.dernier_point).toBe("Pris en charge par le transporteur");
  });
});

describe("Le silence : la liste et le compteur disent la même chose", () => {
  test("le filtre ne garde que ce qui est encore en route et vraiment immobile", async () => {
    const page = await lireEnvois(
      alice.client,
      ParametresEnvois.parse({ silencieux: "oui" }),
      MAINTENANT,
    );
    const numeros = page.lignes.map((l) => l.numero);

    expect(numeros).toContain("AL-SILENCE-02");
    // UN COLIS LIVRÉ NE BOUGE PLUS PAR DÉFINITION. Le compter comme silencieux
    // ferait grossir l'alerte avec les livraisons réussies — donc avec le
    // succès — et une alerte qui se déclenche quand tout va bien est une alerte
    // qu'on apprend à ignorer.
    expect(numeros, "un colis LIVRÉ est compté comme silencieux").not.toContain("AL-LIVRE-03");
    expect(numeros, "un colis qui a bougé hier est compté comme silencieux").not.toContain(
      "AL-EN-ROUTE-01",
    );
  });

  test("le compteur rend EXACTEMENT le même nombre que la liste", async () => {
    // C'est la propriété qui compte : deux définitions du seuil divergeraient au
    // premier ajustement, et l'écran annoncerait un chiffre qu'aucune liste ne
    // confirme.
    const compteurs = await lisible(compterEnvois(alice.client), "compterEnvois");
    const page = await lireEnvois(
      alice.client,
      ParametresEnvois.parse({ silencieux: "oui" }),
      MAINTENANT,
    );

    // ⚠️ CONTRE-TEST : DEUX ZÉROS SONT ÉGAUX. Sans cette ligne, un jeu qui ne
    // contient plus aucun colis silencieux — un semis raté, un seuil réécrit —
    // ferait passer l'égalité sans rien prouver, exactement l'état que ce test
    // existe pour empêcher.
    expect(
      page.lignes.map((l) => l.numero),
      "aucun colis silencieux dans le jeu : l'égalité ne prouverait rien",
    ).toContain("AL-SILENCE-02");

    expect(compteurs.silencieux).toBe(page.lignes.length);
  });

  test("le seuil est bien celui du produit, pas une valeur réécrite en base", async () => {
    // Un colis posé JUSTE en deçà du seuil ne doit pas être silencieux, et un
    // colis juste au-delà doit l'être. Sans ces deux bornes, un seuil de 30
    // jours écrit par erreur dans la migration passerait inaperçu.
    await poserColis(alice, "AL-BORNE-DEDANS", {
      etat: "en_transit",
      dernierMouvement: ilYa(SEUIL_SILENCE_JOURS - 1),
    });
    await poserColis(alice, "AL-BORNE-DEHORS", {
      etat: "en_transit",
      dernierMouvement: ilYa(SEUIL_SILENCE_JOURS + 1),
    });

    const page = await lireEnvois(
      alice.client,
      ParametresEnvois.parse({ silencieux: "oui" }),
      MAINTENANT,
    );
    const numeros = page.lignes.map((l) => l.numero);
    expect(numeros).toContain("AL-BORNE-DEHORS");
    expect(numeros).not.toContain("AL-BORNE-DEDANS");
  });
});

describe("Les compteurs", () => {
  test("ils comptent la boutique de l'appelant, pas la base entière", async () => {
    const chezAlice = await lisible(compterEnvois(alice.client), "compterEnvois");
    const chezBob = await lisible(compterEnvois(bob.client), "compterEnvois");

    expect(chezBob.total, "Bob compte les colis d'Alice").toBe(1);
    expect(chezAlice.total).toBeGreaterThan(1);
  });

  test("un colis abandonné est compté comme tel", async () => {
    await poserColis(alice, "AL-ABANDONNE", { etat: "en_transit", abandonne: true });
    const compteurs = await lisible(compterEnvois(alice.client), "compterEnvois");
    expect(compteurs.abandonnes).toBeGreaterThan(0);

    // ET IL N'EST PAS COMPTÉ COMME SILENCIEUX : on a cessé de l'interroger, donc
    // son immobilité ne dit plus rien sur le colis, seulement sur nous.
    const page = await lireEnvois(
      alice.client,
      ParametresEnvois.parse({ silencieux: "oui" }),
      MAINTENANT,
    );
    expect(page.lignes.map((l) => l.numero)).not.toContain("AL-ABANDONNE");
  });
});

describe("Les paramètres d'URL", () => {
  test("la forme qui arrive RÉELLEMENT de l'URL active le filtre", () => {
    // CE TEST EXISTE PARCE QUE LE DÉFAUT A EU LIEU. Un `z.boolean()` suivi d'un
    // `catch` acceptait le booléen et rejetait silencieusement la chaîne « oui »,
    // celle que porte le lien de l'écran. Le filtre disparaissait sans bruit :
    // l'en-tête annonçait « 12 sans mouvement » au-dessus d'une liste qui les
    // contenait tous. Rien n'échouait, rien n'était journalisé.
    expect(ParametresEnvois.parse({ silencieux: "oui" }).silencieux).toBe(true);
    expect(ParametresEnvois.parse({ abandonnes: "oui" }).abandonnes).toBe(true);
    expect(ParametresEnvois.parse({ abandonnes: "non" }).abandonnes).toBe(false);
  });

  test("contre-test positif : l'absence de paramètre ne filtre rien", () => {
    // Sans lui, un schéma qui rendrait TOUJOURS `true` passerait le test
    // précédent sans rien prouver.
    expect(ParametresEnvois.parse({}).silencieux).toBe(false);
    expect(ParametresEnvois.parse({}).abandonnes).toBeNull();
    expect(ParametresEnvois.parse({ abandonnes: "n'importe quoi" }).abandonnes).toBeNull();
  });

  test("un tri inventé retombe sur le tri par défaut au lieu de casser l'écran", () => {
    expect(ParametresEnvois.parse({ tri: "par-couleur" }).tri).toBe("immobiles");
    expect(ParametresEnvois.parse({ etat: "perdu" }).etat).toBeNull();
  });
});

describe("Le curseur", () => {
  test("il refuse ce qui pourrait prolonger l'expression de filtre", () => {
    // Ces deux valeurs retournent dans une expression `or=` en syntaxe
    // PostgREST, dont la grammaire emploie la virgule, le point et les
    // parenthèses. La RLS resterait la dernière ligne — mais une protection qui
    // tient à ce qu'une AUTRE couche rattrape est un sursis, pas une protection.
    for (const forge of [
      "2026-08-21T00:00:00Z,id.gt.0|" + "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "Dec 31, 2025 (UTC)|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "2026-08-21T00:00:00Z|pas-un-uuid",
      "2026-08-21T00:00:00Z|aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,shop_id.neq.0",
    ]) {
      const encode = Buffer.from(forge, "utf8").toString("base64url");
      expect(decoderCurseur(encode), `curseur forgé accepté : ${forge}`).toBeNull();
    }
  });

  test("contre-test positif : un curseur légitime est accepté, décalage `+00` compris", () => {
    // Une suite où tout est refusé passe à 100 % sans rien prouver. Et `+00` est
    // la forme que PostgREST rend RÉELLEMENT : l'oublier renverrait le vendeur à
    // la première page à chaque « page suivante ».
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    for (const valeur of [
      "2026-08-21T12:00:00Z",
      "2026-08-21 12:00:00+00",
      "2026-08-21 12:00:00.123456+00:00",
    ]) {
      expect(decoderCurseur(encoderCurseur(valeur, id)), `refusé : ${valeur}`).toEqual({
        valeur,
        id,
      });
    }
  });

  test("la page suivante ne saute ni ne répète de ligne", async () => {
    // LE CAS QUI MOTIVE LA COLONNE GÉNÉRÉE. Trier sur `last_movement_at`, qui est
    // NULL tant que rien n'a été scanné, ferait rendre NULL à la comparaison de
    // couple — et des colis disparaîtraient de la liste sans que rien n'échoue.
    await poserColis(alice, "AL-JAMAIS-SCANNE", { etat: "preparation", dernierMouvement: null });

    const tout = await lireEnvois(alice.client, DEFAUTS, MAINTENANT);
    const numeros = tout.lignes.map((l) => l.numero);
    expect(numeros, "un colis jamais scanné est absent de la liste").toContain(
      "AL-JAMAIS-SCANNE",
    );
    expect(new Set(numeros).size, "une ligne apparaît deux fois").toBe(numeros.length);
  });
});
