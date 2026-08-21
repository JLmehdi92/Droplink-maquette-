import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * L'ATTACHE D'UN COLIS — ET LE SEUL BOOLÉEN DU PRODUIT QUI COÛTE DE L'ARGENT.
 *
 * Le fournisseur facture à la PRISE EN CHARGE d'un numéro, pas à
 * l'interrogation. `attacher_colis` rend `cree`, et l'application n'appelle le
 * fournisseur que si ce booléen est vrai. Tout ce qui suit éprouve donc une
 * seule chose sous plusieurs angles : **on ne paie qu'une fois**.
 *
 * Le défaut visé n'est pas une fuite mais une DÉPENSE silencieuse. Un « lire
 * puis écrire » côté application paraîtrait juste en séquentiel et paierait deux
 * fois sur un double clic — c'est-à-dire exactement dans le cas où un vendeur
 * pressé colle un numéro, doute, et recolle.
 */

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
let catalogue: Client;
let commandeA: string;
let commandeA2: string;
let commandeB: string;

const NUMERO = "LX-ATTACHE-0001";
const AUTRE = "LX-ATTACHE-0002";

async function creerCommande(u: UtilisateurDeTest): Promise<string> {
  const { data, error } = await u.client
    .from("orders")
    .insert({ shop_id: u.shopId, customer_label: "client" })
    .select("id")
    .single();
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  return (data as { id: string }).id;
}

async function attacher(
  u: UtilisateurDeTest,
  orderId: string,
  numero: string,
  transporteur = "",
): Promise<{ parcelId: string | null; cree: boolean; erreur: string | null }> {
  const { data, error } = await u.client.rpc("attacher_colis", {
    p_order_id: orderId,
    p_numero: numero,
    p_transporteur: transporteur,
  });
  if (error !== null) return { parcelId: null, cree: false, erreur: error.code ?? "erreur" };
  const ligne = Array.isArray(data) ? data[0] : null;
  return {
    parcelId: ligne?.parcel_id ?? null,
    cree: ligne?.cree === true,
    erreur: null,
  };
}

async function liens(orderId: string): Promise<string[]> {
  const lignes = await interroger<{ parcel_id: string }>(
    catalogue,
    "select parcel_id from public.order_parcels where order_id = $1",
    [orderId],
  );
  return lignes.map((l) => l.parcel_id);
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  alice = await creerUtilisateur("attache-alice");
  bob = await creerUtilisateur("attache-bob");
  commandeA = await creerCommande(alice);
  commandeA2 = await creerCommande(alice);
  commandeB = await creerCommande(bob);
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
  await catalogue.end();
});

describe("On ne paie qu'une fois", () => {
  test("la PREMIÈRE attache crée le colis, et le dit", async () => {
    const r = await attacher(alice, commandeA, NUMERO);
    expect(r.erreur).toBeNull();
    expect(r.parcelId, "aucun colis créé : la sonde n'inspecte rien").not.toBeNull();
    expect(r.cree, "la création n'a pas été signalée — la prise en charge ne partirait pas").toBe(
      true,
    );
  });

  test("la SECONDE attache du même numéro ne crée rien", async () => {
    // Le double clic, la reconnexion qui rejoue la requête, la sauvegarde
    // automatique qui repart : chacun de ces cas paierait une prise en charge de
    // plus si ce booléen se trompait.
    const r = await attacher(alice, commandeA, NUMERO);
    expect(r.cree, "une seconde prise en charge aurait été payée").toBe(false);
  });

  test("une AUTRE commande du même vendeur réutilise le même colis, sans payer", async () => {
    // C'est le GROUPAGE : un fournisseur met plusieurs achats d'un client dans
    // un colis. Créer une seconde ligne paierait deux fois le même colis, ce que
    // l'unicité (shop_id, tracking_number) rend structurellement impossible.
    const premier = await liens(commandeA);
    const r = await attacher(alice, commandeA2, NUMERO);

    expect(r.cree, "le groupage a payé une seconde prise en charge").toBe(false);
    expect(r.parcelId).toBe(premier[0]);
  });

  test("un AUTRE vendeur avec le même numéro paie, LUI", async () => {
    // Contre-test de la règle précédente, et cas réel : un revendeur et son
    // fournisseur suivent le même colis. Chacun a sa ligne, chacun sa prise en
    // charge — c'est la frontière du vendeur qui borne l'unicité, pas le numéro.
    const r = await attacher(bob, commandeB, NUMERO);
    expect(r.cree, "le second vendeur n'a pas obtenu son propre colis").toBe(true);

    const aAlice = await liens(commandeA);
    expect(r.parcelId).not.toBe(aAlice[0]);
  });
});

describe("Changer de numéro", () => {
  test("l'ancien lien part, le nouveau arrive", async () => {
    const avant = await liens(commandeA);
    expect(avant.length, "la commande n'était liée à rien").toBe(1);

    const r = await attacher(alice, commandeA, AUTRE);
    expect(r.cree).toBe(true);

    const apres = await liens(commandeA);
    // UN SEUL lien : corriger une faute de frappe ne doit pas laisser la
    // commande liée aux DEUX numéros — la page publique afficherait le suivi
    // d'un colis qui n'est plus le sien.
    expect(apres.length, "la commande porte deux colis").toBe(1);
    expect(apres[0]).toBe(r.parcelId);
    expect(apres[0]).not.toBe(avant[0]);
  });

  test("l'ancien COLIS survit, avec ses points de passage", async () => {
    // Il n'est pas supprimé : une autre commande peut le porter, et effacer
    // l'historique d'un colis parce qu'un vendeur a corrigé une faute de frappe
    // est une perte sèche. Ici `commandeA2` le porte toujours.
    const restants = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.tracked_parcels where shop_id = $1 and tracking_number = $2",
      [alice.shopId, NUMERO],
    );
    expect(Number(restants[0]?.n)).toBe(1);
    expect((await liens(commandeA2)).length, "le groupage a été cassé").toBe(1);
  });

  test("effacer le numéro détache sans rien créer", async () => {
    const r = await attacher(alice, commandeA, "");
    expect(r.parcelId).toBeNull();
    expect(r.cree).toBe(false);
    expect(await liens(commandeA)).toEqual([]);
  });

  test("des espaces autour du numéro ne créent pas un second colis", async () => {
    // Un numéro collé depuis une conversation traîne presque toujours un espace.
    // Sans `btrim`, « LX1 » et « LX1 » seraient deux colis — donc deux prises en
    // charge payées pour le même envoi.
    await attacher(alice, commandeA, NUMERO);
    const r = await attacher(alice, commandeA, "  " + NUMERO + "  ");
    expect(r.cree, "un espace a fait payer une seconde prise en charge").toBe(false);
  });
});

describe("Ce que l'attache refuse", () => {
  test("Bob ne peut pas attacher un colis à la commande d'Alice", async () => {
    const r = await attacher(bob, commandeA, "LX-VOLE-0001");
    expect(r.erreur, "un vendeur a attaché un colis chez un autre").not.toBeNull();

    const cree = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.tracked_parcels where tracking_number = $1",
      ["LX-VOLE-0001"],
    );
    expect(Number(cree[0]?.n), "un colis a tout de même été créé").toBe(0);
  });

  test("`anon` ne peut pas l'exécuter", async () => {
    const { error } = await clientAnonyme().rpc("attacher_colis", {
      p_order_id: commandeA,
      p_numero: "LX-ANON-0001",
      p_transporteur: "",
    });
    expect(error, "anon a pu attacher un colis").not.toBeNull();
  });

  test("le colis créé appartient bien à la boutique de l'appelant", async () => {
    // `security definer` a mis la RLS de côté : si le `shop_id` était pris
    // ailleurs que dans `mon_shop_id()`, le colis naîtrait chez quelqu'un
    // d'autre — et son propriétaire ne le verrait jamais.
    const lignes = await interroger<{ shop_id: string }>(
      catalogue,
      "select shop_id from public.tracked_parcels where tracking_number = $1",
      [AUTRE],
    );
    expect(lignes.length).toBe(1);
    expect(lignes[0]?.shop_id).toBe(alice.shopId);
  });
});
