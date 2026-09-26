import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  creerUtilisateur,
  passerEnPro,
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
): Promise<{ parcelId: string | null; cree: boolean; aInscrire: boolean; erreur: string | null }> {
  const { data, error } = await u.client.rpc("attacher_colis", {
    p_order_id: orderId,
    p_numero: numero,
    p_transporteur: transporteur,
  });
  if (error !== null) {
    return { parcelId: null, cree: false, aInscrire: false, erreur: error.code ?? "erreur" };
  }
  const ligne = Array.isArray(data) ? data[0] : null;
  return {
    parcelId: ligne?.parcel_id ?? null,
    cree: ligne?.cree === true,
    aInscrire: ligne?.a_inscrire === true,
    erreur: null,
  };
}

/** Pose l'état qu'un refus du fournisseur laisse derrière lui : abandonné, jamais pris en charge. */
async function refuserALaPriseEnCharge(parcelId: string): Promise<void> {
  await interroger(
    catalogue,
    "update public.tracked_parcels set abandoned_at = now(), registered_at = null where id = $1",
    [parcelId],
  );
}

async function etatDuColis(
  parcelId: string,
): Promise<{ abandonne: boolean; transporteur: number | null }> {
  const lignes = await interroger<{ abandonne: boolean; carrier_code: number | null }>(
    catalogue,
    "select abandoned_at is not null as abandonne, carrier_code from public.tracked_parcels where id = $1",
    [parcelId],
  );
  expect(lignes.length, "colis introuvable : la sonde n'inspecte rien").toBe(1);
  return { abandonne: lignes[0]?.abandonne === true, transporteur: lignes[0]?.carrier_code ?? null };
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
  // ⚠️ VENDEURS PRO DEPUIS LA 201 (27/09/2026) : un compte gratuit ne suit plus que
  // 15 colis à vie, et ces épreuves du SUIVI en créent davantage. Un vendeur qui
  // suit autant de colis est un vendeur qui paye — ce n'est pas un contournement,
  // les refus de quota ont leurs propres suites (quota-gratuit, quota-*).
  await Promise.all([passerEnPro(alice), passerEnPro(bob)]);
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
    //
    // ON LE RECRÉE D'ABORD : le contrôle précédent a effacé le numéro, et depuis la
    // migration 172 un colis jamais pris en charge que plus rien ne porte est supprimé —
    // c'était une saisie abandonnée, il n'a plus de boutique à vérifier.
    await attacher(alice, commandeA, AUTRE);
    const lignes = await interroger<{ shop_id: string }>(
      catalogue,
      "select shop_id from public.tracked_parcels where tracking_number = $1",
      [AUTRE],
    );
    expect(lignes.length).toBe(1);
    expect(lignes[0]?.shop_id).toBe(alice.shopId);
  });
});

/**
 * PRÉCISER LE TRANSPORTEUR RELANCE UN SUIVI QUE SON ABSENCE AVAIT ARRÊTÉ.
 *
 * Quand le fournisseur ne reconnaît pas le transporteur d'un numéro, le colis
 * est abandonné sur-le-champ, jamais pris en charge. Le seul geste utile du
 * vendeur est alors de choisir le transporteur — et ce geste ne relançait
 * rien (migration 164). Chaque contrôle ci-dessous ferme aussi une DÉPENSE :
 * une relance à tort est une prise en charge payée pour rien.
 */
describe("Préciser le transporteur", () => {
  const REFUSE = "LX-REFUSE-0001";
  let commande: string;
  let colis: string;

  beforeAll(async () => {
    commande = await creerCommande(alice);
    const r = await attacher(alice, commande, REFUSE);
    expect(r.cree).toBe(true);
    expect(r.aInscrire, "un colis neuf doit partir en prise en charge").toBe(true);
    colis = r.parcelId ?? "";
    await refuserALaPriseEnCharge(colis);
  }, 60_000);

  test("un transporteur NOUVEAU relance un colis refusé à la prise en charge", async () => {
    const r = await attacher(alice, commande, REFUSE, "100001");
    expect(r.erreur).toBeNull();
    expect(r.cree, "la ligne existait : rien n'est né").toBe(false);
    expect(r.aInscrire, "le transporteur choisi ne relance pas la prise en charge").toBe(true);
    expect(await etatDuColis(colis)).toEqual({ abandonne: false, transporteur: 100001 });
  });

  test("le MÊME transporteur rejoué ne relance rien", async () => {
    // Le double clic, la sauvegarde qui repart : sans cette borne, chaque
    // rejeu relancerait une prise en charge.
    await refuserALaPriseEnCharge(colis);
    const r = await attacher(alice, commande, REFUSE, "100001");
    expect(r.aInscrire, "un rejeu a relancé la prise en charge").toBe(false);
    expect((await etatDuColis(colis)).abandonne, "un rejeu a levé l'abandon").toBe(true);
  });

  test("un colis DÉJÀ pris en charge ne se relance jamais, même abandonné", async () => {
    // Abandonné APRÈS une prise en charge réussie : le fournisseur le suivait,
    // il s'est tu. Le relancer paierait une seconde fois le même colis.
    await interroger(
      catalogue,
      "update public.tracked_parcels set registered_at = now(), abandoned_at = now() where id = $1",
      [colis],
    );
    const r = await attacher(alice, commande, REFUSE, "100003");
    expect(r.aInscrire, "un colis déjà payé a été relancé").toBe(false);
    expect((await etatDuColis(colis)).abandonne).toBe(true);
  });

  test("un code non numérique vaut détection automatique, et l'attache aboutit", async () => {
    // L'ancien champ était un texte libre (« Ex : DHL ») : `::integer` levait
    // 22P02 à chaque enregistrement du numéro, et aucun colis n'était suivi.
    const autre = await creerCommande(alice);
    const r = await attacher(alice, autre, "LX-TEXTE-0001", "DHL");
    expect(r.erreur, "un transporteur en texte libre fait échouer l'attache").toBeNull();
    expect(r.cree).toBe(true);
    expect((await etatDuColis(r.parcelId ?? "")).transporteur).toBeNull();
  });

  test("la relance est BORNÉE : alterner deux transporteurs ne rappelle pas le fournisseur sans fin", async () => {
    // Revue de sécurité du 18/09/2026. Tant que le fournisseur refuse, une
    // relance ne coûte rien — mais chacune est un appel réel, sur un compte
    // partagé par tout le produit, et la fonction est appelable hors de
    // l'application. `query_count` compte chaque refus : au-delà de cinq,
    // plus de relance.
    const numero = "LX-ALTERNE-0001";
    const autre = await creerCommande(alice);
    const r0 = await attacher(alice, autre, numero);
    const id = r0.parcelId ?? "";
    await interroger(
      catalogue,
      "update public.tracked_parcels set abandoned_at = now(), registered_at = null, query_count = 5 where id = $1",
      [id],
    );
    const r = await attacher(alice, autre, numero, "100002");
    expect(r.aInscrire, "une sixième tentative a relancé le fournisseur").toBe(false);
    expect((await etatDuColis(id)).abandonne).toBe(true);

    // CONTRE-TEST : sous la borne, la relance part toujours.
    await interroger(catalogue, "update public.tracked_parcels set query_count = 4 where id = $1", [id]);
    expect((await attacher(alice, autre, numero, "100003")).aInscrire).toBe(true);
  });

  test("un colis DÉJÀ pris en charge garde son transporteur, même si une commande groupée en choisit un autre", async () => {
    // Revue de sécurité du 18/09/2026. Le colis est partagé par toutes les
    // commandes du vendeur qui portent ce numéro ; le fournisseur le suit
    // sous le transporteur de sa prise en charge. Réécrire ce code enverrait
    // les interrogations suivantes au mauvais transporteur, et la page du
    // client de l'AUTRE commande se viderait sans rien dire.
    const numero = "LX-GROUPE-0001";
    const premiere = await creerCommande(alice);
    const seconde = await creerCommande(alice);
    const r0 = await attacher(alice, premiere, numero, "6051");
    const id = r0.parcelId ?? "";
    await interroger(catalogue, "update public.tracked_parcels set registered_at = now() where id = $1", [id]);

    await attacher(alice, seconde, numero, "100001");
    expect((await etatDuColis(id)).transporteur, "le transporteur d'un colis suivi a été réécrit").toBe(6051);

    // CONTRE-TEST : avant la prise en charge, le choix du vendeur s'applique.
    const r1 = await attacher(alice, premiere, "LX-GROUPE-0002", "6051");
    await attacher(alice, seconde, "LX-GROUPE-0002", "100001");
    expect((await etatDuColis(r1.parcelId ?? "")).transporteur).toBe(100001);
  });
});
