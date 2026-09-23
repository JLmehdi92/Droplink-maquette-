import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * L'EXPORT DES ENVOIS, APPELÉ POUR DE VRAI — 23/09/2026.
 *
 * Son exception de couverture disait « la fumée le télécharge et l'inspecte » :
 * vrai, mais pour UN vendeur, sans voisin, et sans pseudo piégé. Ce fichier pose
 * les trois questions qui comptent pour un fichier qui QUITTE l'application :
 * n'y a-t-il que mes colis ? un pseudo de client peut-il y devenir une formule ?
 * la sélection est-elle respectée ?
 *
 * La base et la session sont réelles ; seule la lecture du cookie est
 * substituée, faute de requête.
 */

let session: SupabaseClient | null = null;
vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => {
    if (session === null) throw new Error("aucune session posée par le test");
    return session;
  },
}));

const { exporterEnvois } = await import("@/lib/envois/export-csv");

let alice: UtilisateurDeTest;
let bob: UtilisateurDeTest;
const suffixe = randomUUID().slice(0, 8).toUpperCase();
const NUMERO_ALICE_1 = "EXA1" + suffixe;
const NUMERO_ALICE_2 = "EXA2" + suffixe;
const NUMERO_BOB = "EXB1" + suffixe;
const PSEUDO_PIEGE = '=HYPERLINK("https://exemple.test","clic")';
const PSEUDO_VIRGULE = 'Dupont, Jean "le grand"';
let colisAlice1 = "";
let colisBob = "";

async function poser(qui: UtilisateurDeTest, numero: string, pseudo: string): Promise<string> {
  const { data, error } = await qui.client
    .from("orders")
    .insert({ shop_id: qui.shopId, customer_label: pseudo })
    .select("id")
    .single();
  expect(error, `commande impossible : ${error?.message}`).toBeNull();
  const attache = await qui.client.rpc("attacher_colis", {
    p_order_id: (data as { id: string }).id,
    p_numero: numero,
    p_transporteur: "3011",
  });
  expect(attache.error, `attache impossible : ${attache.error?.message}`).toBeNull();
  const ligne = Array.isArray(attache.data) ? attache.data[0] : null;
  const id = (ligne as { parcel_id: string } | null)?.parcel_id ?? "";
  expect(id, "aucun colis attaché : la sonde n'inspecterait rien").not.toBe("");
  return id;
}

beforeAll(async () => {
  alice = await creerUtilisateur("export-envois-alice");
  bob = await creerUtilisateur("export-envois-bob");
  colisAlice1 = await poser(alice, NUMERO_ALICE_1, PSEUDO_PIEGE);
  await poser(alice, NUMERO_ALICE_2, PSEUDO_VIRGULE);
  colisBob = await poser(bob, NUMERO_BOB, "Client de Bob");
}, 90_000);

afterAll(async () => {
  await supprimerUtilisateur(alice);
  await supprimerUtilisateur(bob);
}, 60_000);

describe("L'export des envois", () => {
  test("CONTRE-TEST : le vendeur obtient SES colis, en-tête et BOM compris", async () => {
    session = alice.client;
    const r = await exporterEnvois([]);
    expect(r.lignes).toBe(2);
    expect(r.tronque).toBe(false);
    expect(r.csv.startsWith("﻿numero_de_suivi,transporteur,")).toBe(true);
    expect(r.csv).toContain(NUMERO_ALICE_1);
    expect(r.csv).toContain(NUMERO_ALICE_2);
  });

  test("⚠️ AUCUN COLIS D'UN AUTRE VENDEUR N'Y FIGURE — MÊME DEMANDÉ PAR SON IDENTIFIANT", async () => {
    session = alice.client;
    expect((await exporterEnvois([])).csv).not.toContain(NUMERO_BOB);
    const vise = await exporterEnvois([colisBob]);
    expect(vise.lignes, "la sélection a ouvert le colis d'un autre vendeur").toBe(0);
    expect(vise.csv).not.toContain(NUMERO_BOB);
  });

  test("⚠️ UN PSEUDO DE CLIENT NE DEVIENT JAMAIS UNE FORMULE DANS LE TABLEUR", async () => {
    /*
     * Le pseudo est saisi librement. Ouvert dans un tableur, `=HYPERLINK(…)`
     * s'exécuterait chez le vendeur — l'injection de formule, OWASP la nomme.
     * Aucune cellule ne doit COMMENCER par = + - @.
     */
    session = alice.client;
    const cellules = (await exporterEnvois([])).csv
      .split("\r\n")
      .flatMap((ligne) => ligne.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
      .map((c) => c.replace(/^"|"$/g, ""));
    expect(cellules.some((c) => c.includes("HYPERLINK")), "le pseudo piégé n'est pas dans le fichier").toBe(true);
    expect(cellules.filter((c) => /^[=+\-@]/.test(c))).toEqual([]);
  });

  test("une virgule ou un guillemet dans un pseudo ne décale aucune colonne", async () => {
    session = alice.client;
    const ligne = (await exporterEnvois([])).csv.split("\r\n").find((l) => l.includes(NUMERO_ALICE_2)) ?? "";
    expect(ligne).toContain('"Dupont, Jean ""le grand"""');
  });

  test("la sélection est respectée", async () => {
    session = alice.client;
    const r = await exporterEnvois([colisAlice1]);
    expect(r.lignes).toBe(1);
    expect(r.csv).toContain(NUMERO_ALICE_1);
    expect(r.csv).not.toContain(NUMERO_ALICE_2);
  });
});
