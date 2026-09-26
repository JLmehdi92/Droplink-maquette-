import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { promouvoirAdmin } from "../aide/admin";
import {
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT as QUINZE } from "@/lib/audit/panneau";
import { lireCompte } from "@/lib/audit/comptes";

/**
 * LE PRO REPART DE ZÉRO, LE GRATUIT COMPTE TOUT — migration 200.
 *
 * Décision de Wassim du 27/09/2026 : « le compte gratuit a 15/15, et s'il paye ça
 * débloque 300 commandes par mois ; pareil pour quelqu'un qui n'a jamais rien
 * utilisé : s'il paye le Pro, il a 300/300 ».
 *
 * ⚠️ CE QUE LA 198 FAISAIT : le plafond Pro comptait TOUT le mois, commandes
 * gratuites comprises. Un gratuit à 15/15 qui payait n'avait que « plafond − 15 »
 * ce mois-là. Le plafond Pro est réglé ici à 15 pour que la différence se voie à
 * la PREMIÈRE commande : 15 gratuites comptées → refus immédiat sous la 198.
 *
 * ET LE SENS INVERSE, qui compte autant : un Pro qui repasse en gratuit ne
 * retrouve PAS quinze commandes — son total à vie inclut ce qu'il a créé en Pro.
 */

const service = clientService();
let catalogue: Client;
let plafondAvant: unknown = null;
const comptes: UtilisateurDeTest[] = [];
const PLAFOND_PRO = QUINZE;

async function nouveau(etiquette: string): Promise<UtilisateurDeTest> {
  const u = await creerUtilisateur(etiquette);
  comptes.push(u);
  return u;
}

async function creerCommandes(u: UtilisateurDeTest, combien: number): Promise<string | null> {
  const { error } = await u.client.from("orders").insert(Array.from({ length: combien }, () => ({ shop_id: u.shopId })));
  return error?.code ?? null;
}

async function attacherColis(u: UtilisateurDeTest, combien: number, prefixe: string): Promise<string | null> {
  const lignes = Array.from({ length: combien }, (_, i) => ({
    shop_id: u.shopId,
    tracking_number: `${prefixe}-${i}`,
    carrier_code: 6051,
  }));
  const { error } = await service.from("tracked_parcels").insert(lignes);
  return error?.code ?? null;
}

async function repasserEnGratuit(u: UtilisateurDeTest): Promise<void> {
  const { error } = await service.from("profiles").update({ plan: "gratuit" }).eq("id", u.profilId);
  expect(error).toBeNull();
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  const lu = await interroger<{ value: unknown }>(
    catalogue,
    "select value from public.system_settings where key = 'plafond_commandes_mensuel'",
  );
  plafondAvant = lu[0]?.value ?? null;
  await interroger(
    catalogue,
    `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb($1::int))
       on conflict (key) do update set value = excluded.value`,
    [PLAFOND_PRO],
  );
});

afterAll(async () => {
  // LE RÉGLAGE GLOBAL EST RENDU tel qu'il était : d'autres suites le lisent.
  if (plafondAvant === null) {
    await interroger(catalogue, "delete from public.system_settings where key = 'plafond_commandes_mensuel'");
  } else {
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', $1::jsonb)
         on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(plafondAvant)],
    );
  }
  for (const u of comptes) await supprimerUtilisateur(u);
  await catalogue.end();
});

describe("Le Pro repart de zéro, le gratuit compte tout", () => {
  test("un gratuit à 15/15 qui passe Pro a TOUT son plafond du mois", async () => {
    const u = await nouveau("gratuit-puis-pro");
    expect(await creerCommandes(u, QUINZE)).toBeNull();
    expect(await creerCommandes(u, 1), "le quota à vie ne tient plus").toBe("DL067");

    await passerEnPro(u);

    expect(await creerCommandes(u, PLAFOND_PRO), "les commandes gratuites mangent le plafond Pro").toBeNull();
    // CONTRE-TEST : le Pro reste borné, à son plafond et pas au-delà.
    expect(await creerCommandes(u, 1)).toBe("DL035");
  });

  test("un Pro qui n'a jamais rien créé a son plafond entier, et pas une de plus", async () => {
    const u = await nouveau("pro-neuf");
    await passerEnPro(u);
    expect(await creerCommandes(u, PLAFOND_PRO)).toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL035");
  });

  test("un Pro qui repasse en gratuit ne retrouve PAS quinze commandes", async () => {
    // Sinon, cesser de payer rendrait quinze commandes gratuites à chaque fois.
    const u = await nouveau("pro-puis-gratuit");
    expect(await creerCommandes(u, 5)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, QUINZE - 5)).toBeNull();
    await repasserEnGratuit(u);
    expect(await creerCommandes(u, 1), "le total à vie a oublié les commandes Pro").toBe("DL067");
  });

  test("CONTRE-TEST : un gratuit sous le quota qui repasse de Pro garde sa marge exacte", async () => {
    const u = await nouveau("marge-exacte");
    expect(await creerCommandes(u, 3)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, 2)).toBeNull();
    await repasserEnGratuit(u);
    // 5 au total : il en reste 10, ni plus ni moins.
    expect(await creerCommandes(u, QUINZE - 5)).toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL067");
  });

  test("un prélèvement échoué puis régularisé dans le MÊME mois ne double pas le plafond", async () => {
    // Pro → gratuit (past_due, 193) → Pro le lendemain : c'est le même mois payé.
    // Remettre le compteur Pro à zéro donnerait deux plafonds — 600 pour 300.
    const u = await nouveau("double-bascule");
    await passerEnPro(u);
    expect(await creerCommandes(u, PLAFOND_PRO - 2)).toBeNull();
    await repasserEnGratuit(u);
    await passerEnPro(u);
    expect(await creerCommandes(u, 2)).toBeNull();
    expect(await creerCommandes(u, 1), "la seconde bascule a rendu un plafond neuf").toBe("DL035");
  });

  test("COLIS (hors du cas motivant) : les 15 colis gratuits ne mangent pas le plafond Pro", async () => {
    const u = await nouveau("colis-gratuit-puis-pro");
    expect(await attacherColis(u, QUINZE, "GRATUIT")).toBeNull();
    expect(await attacherColis(u, 1, "TROP")).toBe("DL070");
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBe("gratuit");

    await passerEnPro(u);
    expect((await u.client.rpc("mon_quota_colis_atteint")).data, "le suivi resterait dit bloqué après paiement").toBeNull();
    expect(await attacherColis(u, PLAFOND_PRO, "PRO")).toBeNull();
    expect(await attacherColis(u, 1, "PRO-TROP")).toBe("DL051");
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBe("mensuel");
  });
});

describe("La fiche d'administration dit la règle du plan", () => {
  let admin: UtilisateurDeTest;

  beforeAll(async () => {
    admin = await nouveau("admin-quota");
    await promouvoirAdmin(catalogue, admin);
  });

  test("gratuit : le quota À VIE, tout compris — 15 sur 15 même le mois suivant", async () => {
    const u = await nouveau("fiche-gratuit");
    // Une commande antidatée du mois dernier : un compteur « du mois » dirait 14.
    const moisDernier = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await service.from("orders").insert({ shop_id: u.shopId, created_at: moisDernier });
    expect(error).toBeNull();
    expect(await creerCommandes(u, QUINZE - 1)).toBeNull();

    const fiche = await lireCompte(admin.client, u.profilId, "ip-test");
    expect(fiche?.plan).toBe("gratuit");
    expect(fiche?.quotaCommandes).toEqual({ utilise: QUINZE, plafond: QUINZE });
  });

  test("Pro : ce mois-ci, EN PRO seulement — le gratuit consommé n'y est pas", async () => {
    const u = await nouveau("fiche-pro");
    expect(await creerCommandes(u, 4)).toBeNull();
    await passerEnPro(u);
    expect(await creerCommandes(u, 2)).toBeNull();

    const fiche = await lireCompte(admin.client, u.profilId, "ip-test");
    expect(fiche?.plan).toBe("pro");
    expect(fiche?.quotaCommandes).toEqual({ utilise: 2, plafond: PLAFOND_PRO });
  });
});
