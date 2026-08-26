import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { cleVignette } from "@/lib/storage/cles";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LA CLÉ D'UN MÉDIA DÉSIGNE UN OBJET DU VENDEUR, ET LA BASE L'EXIGE.
 *
 * DÉFAUT QUI A MOTIVÉ CES CONTRÔLES, trouvé par interrogation du catalogue et
 * non par relecture : `grant insert` avait été posé sur la TABLE `order_media`,
 * et un droit d'insertion de table couvre TOUTES ses colonnes. `cle` et
 * `cle_vignette` étaient donc fournies par le client.
 *
 * LA FUITE : le vendeur B insère une ligne rattachée à SA commande — la policy
 * passe, elle lui appartient bien — mais dont la clé désigne l'objet du vendeur
 * A. Sa page publique sert alors le média de A, avec une URL signée depuis SA
 * ligne : au-delà de l'expiration de l'URL d'origine, au-delà d'une révocation
 * de jeton, et au-delà d'une SUSPENSION du compte A, puisque c'est le profil de
 * B qui est lu.
 *
 * Les clés ne sont pas devinables, mais elles ne sont pas secrètes : le chemin
 * de l'objet est en clair dans chaque URL présignée servie sur la page publique.
 * Il suffit d'avoir reçu un lien.
 *
 * ON TESTE L'ÉCRITURE DIRECTE, PAS NOTRE MODULE. Personne d'hostile n'appelle
 * `confirmerDepot` : on appelle PostgREST avec sa propre session, comme le
 * ferait une requête forgée qui n'a jamais affiché l'écran.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;

let commandeAlice: string;
let commandeBob: string;
let cleAlice: string;
let cleBob: string;

/** Crée une commande et rend son identifiant. */
async function creerCommande(u: UtilisateurDeTest): Promise<string> {
  const lignes = await interroger<{ id: string }>(
    catalogue,
    "insert into public.orders (shop_id) values ($1) returning id",
    [u.shopId],
  );
  const id = lignes[0]?.id;
  if (id === undefined) throw new Error("commande non créée");
  return id;
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("cles-alice");
  bob = await creerUtilisateur("cles-bob");

  commandeAlice = await creerCommande(alice);
  commandeBob = await creerCommande(bob);

  cleAlice = `medias/${alice.shopId}/${commandeAlice}/11111111-1111-1111-1111-111111111111.jpg`;
  cleBob = `medias/${bob.shopId}/${commandeBob}/22222222-2222-2222-2222-222222222222.jpg`;
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("La clé du média est contrôlée PAR VALEUR", () => {
  test("contre-test positif : Bob insère sa PROPRE clé, et ça passe", async () => {
    // Il vient EN PREMIER. Une suite où tout est refusé passe à 100 % sans rien
    // prouver : il faut d'abord établir que le chemin légitime fonctionne.
    const { error } = await bob.client.from("order_media").insert({
      order_id: commandeBob,
      type: "photo",
      cle: cleBob,
      taille_octets: 1024,
      position: 0,
    });
    expect(error, "le chemin légitime est refusé : le contrôle est trop strict").toBeNull();
  });

  test("Bob NE PEUT PAS faire pointer sa ligne vers l'objet d'Alice", async () => {
    const { error } = await bob.client.from("order_media").insert({
      order_id: commandeBob,
      type: "photo",
      cle: cleAlice,
      taille_octets: 1024,
      position: 1,
    });

    expect(
      error,
      "un vendeur a inséré une ligne désignant le média d'un autre : sa page publique servirait le média d'Alice, y compris après suspension du compte d'Alice",
    ).not.toBeNull();
    expect(error?.code).toBe("DL039");
  });

  test("il ne peut pas non plus l'atteindre en modifiant une ligne existante", async () => {
    // FALSIFICATION HORS DU CAS MOTIVANT. Le défaut d'origine portait sur
    // l'INSERT ; un garde qui ne couvrirait que l'insertion regarderait là où le
    // défaut n'est plus.
    const { error } = await bob.client
      .from("order_media")
      .update({ cle: cleAlice })
      .eq("order_id", commandeBob);

    expect(error, "la clé est modifiable après coup").not.toBeNull();
  });

  test("la VIGNETTE non plus : elle doit être dérivée de la clé du média", async () => {
    // Le même chemin, par une autre colonne. `cle_vignette` est écrite en
    // différé — quand la vignette arrive — donc elle est restée modifiable
    // longtemps après l'insertion.
    const { error } = await bob.client
      .from("order_media")
      .update({ cle_vignette: cleVignette(cleAlice) })
      .eq("order_id", commandeBob);

    expect(error, "la vignette peut désigner l'objet d'un autre vendeur").not.toBeNull();
    expect(error?.code).toBe("DL040");
  });

  test("contre-test positif : la vignette dérivée, elle, est acceptée", async () => {
    /*
     * `cleVignette()` ET NON UNE RECOPIE DE LA RÈGLE. Ce test écrivait
     * `${cle}.vignette.webp` à la main — la formule de la migration, recopiée.
     * Il éprouvait donc la base contre une copie d'elle-même, et deux sources
     * qui se citent l'une l'autre ne se contredisent jamais.
     *
     * Pendant ce temps, le vrai `cleVignette()` RETIRE l'extension du média
     * avant d'ajouter la sienne. Les deux dérivations différaient d'un point, la
     * base refusait toutes les vignettes du produit, et le vendeur lisait
     * « Enregistrement impossible » sur chacune de ses photos — sans qu'aucune
     * suite ne bronche.
     */
    const { error } = await bob.client
      .from("order_media")
      .update({ cle_vignette: cleVignette(cleBob) })
      .eq("order_id", commandeBob);

    expect(error, "la vignette légitime est refusée").toBeNull();
  });

  test("une clé d'une AUTRE commande du MÊME vendeur est refusée", async () => {
    // Deuxième falsification hors du cas motivant : le contrôle porte sur la
    // commande, pas seulement sur le vendeur. Sans cela, un lien révoqué
    // resterait atteignable en rattachant son média à une autre commande du
    // même compte — et le jeton révoqué a précisément vocation à mourir.
    const autre = await creerCommande(bob);
    const cleAutre = `medias/${bob.shopId}/${autre}/33333333-3333-3333-3333-333333333333.jpg`;

    const { error } = await bob.client.from("order_media").insert({
      order_id: commandeBob,
      type: "photo",
      cle: cleAutre,
      taille_octets: 1024,
      position: 2,
    });

    expect(error, "une clé d'une autre commande du même vendeur est acceptée").not.toBeNull();
    expect(error?.code).toBe("DL039");
  });
});

describe("Les colonnes que le serveur établit ne sont plus fournies par le client", () => {
  test("Bob ne peut pas insérer une commande en se fabriquant des compteurs", async () => {
    // `first_content_at` déclenche `orders_compter_commande_reelle`, donc le
    // « signal roi » du produit. `views_count` est la seconde métrique de
    // verdict. Les deux étaient insérables.
    // Le typage généré décrit le SCHÉMA, pas les privilèges : ces colonnes
    // existent, donc TypeScript les accepte. C'est précisément pourquoi le
    // contrôle doit vivre en base — un type ne dit rien d'un droit.
    const { error } = await bob.client.from("orders").insert({
      shop_id: bob.shopId,
      first_content_at: new Date().toISOString(),
      views_count: 9_999,
    });

    expect(
      error,
      "un vendeur peut fabriquer les métriques de verdict de la phase de validation",
    ).not.toBeNull();
  });

  test("contre-test positif : la création normale d'une commande fonctionne", async () => {
    const { error } = await bob.client.from("orders").insert({ shop_id: bob.shopId });
    expect(error, "la création de commande est cassée").toBeNull();
  });
});
