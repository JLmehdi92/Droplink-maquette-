import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  passerEnPro,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT } from "@/lib/audit/panneau";
import { appliquerChamp, type ClientEcriture } from "@/lib/commandes/ecriture";

/**
 * LE QUOTA CONSOMMÉ NE SE REND PAS — migration 198.
 *
 * ⚠️ DÉFAUT PROUVÉ EN BASE LE 26/09/2026, en cliquant tout le SaaS. Les quotas
 * comptaient les lignes EXISTANTES, et « Supprimer mes données » efface commandes et
 * colis : un compte gratuit à 15/15 en recréait 15 — refus DL067, suppression, puis
 * quinze créations acceptées. Le quota « À VIE » se rechargeait à la demande, les 30
 * colis gratuits aussi (chacun est une prise en charge payante sur un palier commun),
 * et le plafond mensuel du Pro cédait de même dans le mois.
 *
 * Chaque cas va jusqu'au refus avec une VRAIE session, supprime ses données par la
 * VRAIE fonction de l'écran, puis retente. Et les contre-tests disent que le compteur
 * mesure bien ce qu'il prétend : un refus ne consomme rien, une commande antidatée
 * consomme son propre mois, un vendeur ne lit jamais la consommation d'un autre.
 */

const service = clientService();
let catalogue: Client;
let plafondMensuelAvant: unknown = null;
const comptes: UtilisateurDeTest[] = [];

async function nouveau(etiquette: string): Promise<UtilisateurDeTest> {
  const u = await creerUtilisateur(etiquette);
  comptes.push(u);
  return u;
}

/** Le code SQLSTATE d'une création de commande par le vendeur lui-même, ou `null`. */
async function creerCommandes(u: UtilisateurDeTest, combien: number, boutique = u.shopId): Promise<string | null> {
  const lignes = Array.from({ length: combien }, () => ({ shop_id: boutique }));
  const { error } = await u.client.from("orders").insert(lignes);
  return error?.code ?? null;
}

/** La suppression de l'écran « Paramètres », confirmée par l'adresse du compte. */
async function supprimerMesDonnees(u: UtilisateurDeTest): Promise<void> {
  const { error } = await u.client.rpc("supprimer_mes_donnees", { p_confirmation: u.email });
  expect(error, `suppression refusée : ${error?.message ?? ""}`).toBeNull();
  const { count } = await service.from("orders").select("id", { count: "exact", head: true }).eq("shop_id", u.shopId);
  expect(count, "la suppression n'a pas effacé les commandes").toBe(0);
}

async function consommation(u: UtilisateurDeTest): Promise<{ commandes: number; colis: number }> {
  const { data, error } = await service.from("quotas_consommes").select("commandes, colis").eq("shop_id", u.shopId);
  expect(error).toBeNull();
  return (data ?? []).reduce(
    (acc, l) => ({ commandes: acc.commandes + l.commandes, colis: acc.colis + l.colis }),
    { commandes: 0, colis: 0 },
  );
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  const lu = await interroger<{ value: unknown }>(
    catalogue,
    "select value from public.system_settings where key = 'plafond_commandes_mensuel'",
  );
  plafondMensuelAvant = lu[0]?.value ?? null;
});

afterAll(async () => {
  // LE RÉGLAGE GLOBAL EST RENDU tel qu'il était : d'autres suites le lisent.
  if (plafondMensuelAvant === null) {
    await interroger(catalogue, "delete from public.system_settings where key = 'plafond_commandes_mensuel'");
  } else {
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', $1::jsonb)
         on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(plafondMensuelAvant)],
    );
  }
  for (const u of comptes) await supprimerUtilisateur(u);
  await catalogue.end();
});

describe("Le quota consommé ne se rend pas", () => {
  test("GRATUIT, commandes : supprimer ses données ne rend pas les quinze commandes à vie", async () => {
    const u = await nouveau("quota-survit");
    expect(await creerCommandes(u, PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT), "refus avant le quota").toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL067");
    // CONTRE-TEST : le refus n'a rien consommé — sinon le compteur mesurerait des tentatives.
    expect((await consommation(u)).commandes).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);

    await supprimerMesDonnees(u);

    expect(await creerCommandes(u, 1), "la suppression a rendu le quota à vie").toBe("DL067");
    expect((await consommation(u)).commandes).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);
  });

  test("GRATUIT, colis (hors du cas motivant) : les quinze prises en charge ne reviennent pas", async () => {
    const u = await nouveau("colis-survit");
    const plafond = PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT;
    const colis = (n: number, prefixe: string) =>
      Array.from({ length: n }, (_, i) => ({ shop_id: u.shopId, tracking_number: `${prefixe}-${i}`, carrier_code: 6051 }));

    expect((await service.from("tracked_parcels").insert(colis(plafond, "AVANT"))).error).toBeNull();
    expect((await service.from("tracked_parcels").insert(colis(1, "TROP"))).error?.code).toBe("DL070");

    await supprimerMesDonnees(u);
    const { count } = await service.from("tracked_parcels").select("id", { count: "exact", head: true }).eq("shop_id", u.shopId);
    expect(count, "la suppression n'a pas effacé les colis").toBe(0);

    expect(
      (await service.from("tracked_parcels").insert(colis(1, "APRES"))).error?.code,
      "la suppression a rendu les colis gratuits — des prises en charge payantes",
    ).toBe("DL070");
  });

  test("PRO : le plafond du mois ne se recharge pas en supprimant ses données", async () => {
    const u = await nouveau("mensuel-survit");
    await passerEnPro(u);
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb(2))
         on conflict (key) do update set value = excluded.value`,
    );
    expect(await creerCommandes(u, 2)).toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL035");

    await supprimerMesDonnees(u);

    expect(await creerCommandes(u, 1), "la suppression a rendu le plafond du mois").toBe("DL035");
  });

  test("CONTRE-TEST : une commande ANTIDATÉE consomme son propre mois, pas le mois courant", async () => {
    // Le banc de mesure sème treize mois de commandes : compter l'instant d'insertion
    // plutôt que le mois déclaré le ferait buter sur le plafond du mois courant.
    const u = await nouveau("mois-declare");
    await passerEnPro(u);
    const ilYaDeuxMois = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000);
    const { error } = await service.from("orders").insert({ shop_id: u.shopId, created_at: ilYaDeuxMois.toISOString() });
    expect(error).toBeNull();
    const { data } = await service.from("quotas_consommes").select("mois, commandes").eq("shop_id", u.shopId);
    const moisAttendu = new Date(Date.UTC(ilYaDeuxMois.getUTCFullYear(), ilYaDeuxMois.getUTCMonth(), 1)).toISOString().slice(0, 10);
    expect(data).toEqual([{ mois: moisAttendu, commandes: 1 }]);
  });

  test("un vendeur qui vise la boutique d'un AUTRE reçoit le refus de la RLS, jamais celui du quota de l'autre", async () => {
    // Le déclencheur est privilégié depuis la 198 : sans sa garde, il répondrait
    // « quota atteint : 15 commandes sur 15 » — la consommation d'autrui en oracle.
    const plein = await nouveau("oracle-plein");
    const intrus = await nouveau("oracle-intrus");
    expect(await creerCommandes(plein, PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT)).toBeNull();
    // CONTRE-TEST : le quota de `plein` est bien atteint à cet instant.
    expect(await creerCommandes(plein, 1)).toBe("DL067");

    const code = await creerCommandes(intrus, 1, plein.shopId);
    expect(code, "l'intrus a reçu le refus du quota d'un autre").not.toBe("DL067");
    expect(code).toBe("42501");
    // Et rien n'a été consommé chez l'un ni chez l'autre.
    expect((await consommation(plein)).commandes).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);
    expect((await consommation(intrus)).commandes).toBe(0);
  });

  test("un vendeur ne lit ni n'écrit sa consommation (sinon il la remettrait à zéro)", async () => {
    const u = await nouveau("compteur-ferme");
    expect(await creerCommandes(u, 2)).toBeNull();
    // CONTRE-TEST : il y a bien une ligne à lire — un ensemble vide passerait tout.
    expect((await consommation(u)).commandes).toBe(2);

    const lu = await u.client.from("quotas_consommes").select("*");
    expect(lu.data ?? [], "un vendeur lit la table des consommations").toEqual([]);
    const ecrit = await u.client.from("quotas_consommes").update({ commandes: 0 }).eq("shop_id", u.shopId).select();
    expect(ecrit.data ?? []).toEqual([]);
    expect((await consommation(u)).commandes, "un vendeur a remis son compteur à zéro").toBe(2);
  });
});

/**
 * LE SUIVI BLOQUÉ PAR LE QUOTA DE COLIS SE DIT — migration 199 et `appliquerChamp`.
 *
 * ⚠️ TROUVÉ À LA RELECTURE DU 26/09/2026. Au quota de colis, l'attache était refusée
 * (`DL070`, `DL051`), le numéro restait enregistré, et la sauvegarde rendait un « ok »
 * nu : l'éditeur disait « enregistré » et la frise « en attente », pour toujours.
 * Numéros FACTICES : la prise en charge part par `after()`, qui n'existe pas hors
 * d'une requête — aucun appel au fournisseur de suivi ne peut partir d'ici.
 */
describe("Le suivi bloqué par le quota de colis se dit", () => {
  const saisirNumero = async (u: UtilisateurDeTest, numero: string) => {
    const { data, error } = await u.client.from("orders").insert({ shop_id: u.shopId }).select("id").single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    const resultat = await appliquerChamp(u.client as unknown as ClientEcriture, u.profilId, id, "tracking_number", numero);
    return { id, resultat };
  };

  test("GRATUIT : la sauvegarde du numéro dit que le suivi n'a pas démarré, et la base le redit", async () => {
    const u = await nouveau("suivi-bloque");
    const plafond = PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT;
    const colis = Array.from({ length: plafond }, (_, i) => ({ shop_id: u.shopId, tracking_number: `DEMOPLEIN${i}`, carrier_code: 6051 }));
    expect((await service.from("tracked_parcels").insert(colis)).error).toBeNull();

    const { id, resultat } = await saisirNumero(u, "DEMOQUOTA000001");
    expect(resultat).toMatchObject({ statut: "ok", suiviBloque: "gratuit" });
    // Le numéro est bien gardé — c'est le SUIVI qui manque, pas la saisie.
    const { data } = await u.client.from("orders").select("tracking_number").eq("id", id).single();
    expect(data?.tracking_number).toBe("DEMOQUOTA000001");

    const lu = await u.client.rpc("mon_quota_colis_atteint");
    expect(lu.error).toBeNull();
    expect(lu.data).toBe("gratuit");
  });

  test("CONTRE-TEST : sous le quota, le suivi démarre et rien n'est signalé", async () => {
    const u = await nouveau("suivi-libre");
    const { resultat } = await saisirNumero(u, "DEMOQUOTA000002");
    expect(resultat.statut).toBe("ok");
    expect(resultat).not.toHaveProperty("suiviBloque");
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBeNull();
  });

  test("PRO : au plafond du mois, la base répond « mensuel »", async () => {
    const u = await nouveau("suivi-mensuel");
    await passerEnPro(u);
    await interroger(
      catalogue,
      `insert into public.system_settings (key, value) values ('plafond_commandes_mensuel', to_jsonb(2))
         on conflict (key) do update set value = excluded.value`,
    );
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBeNull();
    const colis = [0, 1].map((i) => ({ shop_id: u.shopId, tracking_number: `DEMOMOIS${i}`, carrier_code: 6051 }));
    expect((await service.from("tracked_parcels").insert(colis)).error).toBeNull();
    expect((await u.client.rpc("mon_quota_colis_atteint")).data).toBe("mensuel");
  });

  test("anon ne peut pas poser la question", async () => {
    const { error } = await clientAnonyme().rpc("mon_quota_colis_atteint");
    expect(error).not.toBeNull();
  });
});
