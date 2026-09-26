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
import { prendreEnCharge } from "@/lib/tracking/prise-en-charge";

/**
 * UN NUMÉRO SE PAIE QUAND IL EST STABLE — audit du 20/09/2026.
 *
 * Le champ de suivi s'enregistre 800 ms après la dernière frappe, et chaque
 * enregistrement attachait un colis NEUF, aussitôt pris en charge chez le
 * fournisseur. Taper « LX12 », hésiter, finir le numéro : deux colis, dont un
 * FAUX, et une prise en charge payée sur les 200 à VIE du palier gratuit si le
 * fournisseur en reconnaît la forme. Les colis intermédiaires restaient aussi en
 * base, détachés : ils gonflaient le plafond mensuel et la liste des envois.
 *
 * Trois règles, toutes tenues en BASE :
 *   1. un colis jamais pris en charge et que plus aucune commande ne porte est
 *      SUPPRIMÉ quand on le détache (il n'a rien coûté, il n'est plus rien) ;
 *   2. `colis_a_inscrire` ne dit « oui » qu'à un colis ATTACHÉ, jamais pris en
 *      charge, non abandonné, et créé depuis au moins 30 secondes ;
 *   3. la cadence ne sélectionne un colis jamais pris en charge que s'il est
 *      attaché et stable.
 */

let catalogue: Client;
let vendeur: UtilisateurDeTest;
let commandeA: string;
let commandeB: string;
const S = Date.now().toString(36).toUpperCase();

async function creerCommande(): Promise<string> {
  const { data, error } = await vendeur.client
    .from("orders")
    .insert({ shop_id: vendeur.shopId, customer_label: "client du numero stable" })
    .select("id")
    .single();
  expect(error, `création impossible : ${error?.message}`).toBeNull();
  return (data as { id: string }).id;
}

async function attacher(orderId: string, numero: string): Promise<string | null> {
  const { data, error } = await vendeur.client.rpc("attacher_colis", {
    p_order_id: orderId,
    p_numero: numero,
    p_transporteur: "",
  });
  expect(error, `attache impossible : ${error?.message}`).toBeNull();
  const ligne = Array.isArray(data) ? (data[0] as { parcel_id: string | null } | undefined) : undefined;
  return ligne?.parcel_id ?? null;
}

async function existe(parcelId: string): Promise<boolean> {
  const r = await interroger<{ n: string }>(
    catalogue,
    "select count(*)::text as n from public.tracked_parcels where id = $1",
    [parcelId],
  );
  return r[0]?.n === "1";
}

async function aInscrire(parcelId: string): Promise<boolean> {
  const r = await interroger<{ ok: boolean }>(catalogue, "select public.colis_a_inscrire($1) as ok", [parcelId]);
  return r[0]?.ok === true;
}

async function vieillir(parcelId: string): Promise<void> {
  await interroger(
    catalogue,
    "update public.tracked_parcels set created_at = now() - interval '5 minutes' where id = $1",
    [parcelId],
  );
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("numero-stable");
  // ⚠️ VENDEURS PRO DEPUIS LA 201 (27/09/2026) : un compte gratuit ne suit plus que
  // 15 colis à vie, et ces épreuves du SUIVI en créent davantage. Un vendeur qui
  // suit autant de colis est un vendeur qui paye — ce n'est pas un contournement,
  // les refus de quota ont leurs propres suites (quota-gratuit, quota-*).
  await passerEnPro(vendeur);
  commandeA = await creerCommande();
  commandeB = await creerCommande();
}, 120_000);

afterAll(async () => {
  await supprimerUtilisateur(vendeur);
  await catalogue.end();
});

describe("Une saisie en cours ne laisse rien derrière elle", () => {
  test("le numéro partiel remplacé est SUPPRIMÉ : il n'a rien coûté et plus rien ne le porte", async () => {
    const partiel = await attacher(commandeA, `LX${S}`);
    const complet = await attacher(commandeA, `LX${S}123FR`);
    expect(partiel).not.toBeNull();
    expect(complet).not.toBeNull();
    expect(complet).not.toBe(partiel);
    expect(await existe(partiel ?? ""), "le colis de la saisie partielle est resté en base").toBe(false);
    expect(await existe(complet ?? "")).toBe(true);
  });

  test("CONTRE-TEST : un colis déjà PRIS EN CHARGE survit à son détachement (il a été payé, il a un historique)", async () => {
    const paye = await attacher(commandeA, `LY${S}001FR`);
    await interroger(catalogue, "update public.tracked_parcels set registered_at = now() where id = $1", [paye]);
    await attacher(commandeA, `LY${S}002FR`);
    expect(await existe(paye ?? ""), "un colis payé a été effacé").toBe(true);
  });

  test("CONTRE-TEST : un colis que porte encore une AUTRE commande survit (groupage)", async () => {
    const groupe = await attacher(commandeA, `LZ${S}777FR`);
    await attacher(commandeB, `LZ${S}777FR`);
    await attacher(commandeA, `LZ${S}778FR`);
    expect(await existe(groupe ?? ""), "le groupage a été cassé").toBe(true);
  });

  test("effacer le numéro supprime aussi le colis jamais pris en charge", async () => {
    const seul = await attacher(commandeA, `LW${S}555FR`);
    await attacher(commandeA, "");
    expect(await existe(seul ?? "")).toBe(false);
  });
});

describe("colis_a_inscrire : on ne paie qu'un numéro stable et porté", () => {
  test("un colis tout juste attaché n'est PAS encore à inscrire — le vendeur tape peut-être encore", async () => {
    const neuf = await attacher(commandeA, `LV${S}900FR`);
    expect(await aInscrire(neuf ?? "")).toBe(false);
  });

  test("CONTRE-TEST POSITIF : attaché, jamais pris en charge, créé depuis plus de 30 s → à inscrire", async () => {
    const stable = await attacher(commandeA, `LU${S}901FR`);
    await vieillir(stable ?? "");
    expect(await aInscrire(stable ?? "")).toBe(true);
  });

  test("déjà pris en charge, abandonné, ou inconnu → jamais", async () => {
    const pris = await attacher(commandeA, `LT${S}902FR`);
    await vieillir(pris ?? "");
    await interroger(catalogue, "update public.tracked_parcels set registered_at = now() where id = $1", [pris]);
    expect(await aInscrire(pris ?? "")).toBe(false);

    const abandonne = await attacher(commandeA, `LS${S}903FR`);
    await vieillir(abandonne ?? "");
    await interroger(catalogue, "update public.tracked_parcels set abandoned_at = now() where id = $1", [abandonne]);
    expect(await aInscrire(abandonne ?? "")).toBe(false);

    expect(await aInscrire("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  test("un colis stable que plus aucune commande ne porte → jamais", async () => {
    const porte = await attacher(commandeA, `LR${S}904FR`);
    await attacher(commandeB, `LR${S}904FR`);
    await vieillir(porte ?? "");
    // On retire les deux attaches à la main (sans passer par attacher_colis, qui supprimerait le colis).
    await interroger(catalogue, "delete from public.order_parcels where parcel_id = $1", [porte]);
    expect(await existe(porte ?? "")).toBe(true);
    expect(await aInscrire(porte ?? "")).toBe(false);
  });

  test("ni un vendeur ni un anonyme ne peuvent l'appeler", async () => {
    for (const client of [vendeur.client, clientAnonyme()]) {
      const { error } = await client.rpc("colis_a_inscrire", { p_parcel_id: commandeA });
      expect(error).not.toBeNull();
    }
  });
});

describe("La prise en charge et la cadence obéissent à la même règle", () => {
  test("prendreEnCharge écarte un numéro instable SANS appeler le fournisseur", async () => {
    const instable = await attacher(commandeA, `LQ${S}905FR`);
    // Le transport des suites refuse le fournisseur : un appel parti rendrait « indisponible ».
    const r = await prendreEnCharge(instable ?? "", `LQ${S}905FR`, null);
    expect(r.statut).toBe("ecarte");
  });

  test("la cadence ne sélectionne ni un colis instable ni un orphelin jamais pris en charge", async () => {
    const instable = await attacher(commandeA, `LP${S}906FR`);
    const orphelin = await attacher(commandeB, `LO${S}907FR`);
    await vieillir(orphelin ?? "");
    await interroger(catalogue, "delete from public.order_parcels where parcel_id = $1", [orphelin]);
    const stable = await attacher(commandeB, `LN${S}908FR`);
    await vieillir(stable ?? "");

    await interroger(catalogue, "begin");
    try {
      const rendus = await interroger<{ id: string }>(catalogue, "select id from public.colis_a_interroger(200)");
      const ids = new Set(rendus.map((r) => r.id));
      expect(ids.has(stable ?? ""), "CONTRE-TEST : le colis stable et porté n'a pas été sélectionné").toBe(true);
      expect(ids.has(instable ?? ""), "la cadence a pris un numéro en cours de saisie").toBe(false);
      expect(ids.has(orphelin ?? ""), "la cadence a pris un colis que plus rien ne porte").toBe(false);
    } finally {
      await interroger(catalogue, "rollback");
    }
  });
});
