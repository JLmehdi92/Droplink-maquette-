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
  test("GRATUIT, commandes : supprimer ses données ne rend pas les commandes à vie", async () => {
    const u = await nouveau("quota-survit");
    expect(await creerCommandes(u, PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT), "refus avant le quota").toBeNull();
    expect(await creerCommandes(u, 1)).toBe("DL067");
    // CONTRE-TEST : le refus n'a rien consommé — sinon le compteur mesurerait des tentatives.
    expect((await consommation(u)).commandes).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);

    await supprimerMesDonnees(u);

    expect(await creerCommandes(u, 1), "la suppression a rendu le quota à vie").toBe("DL067");
    expect((await consommation(u)).commandes).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);
  });

  test("GRATUIT, colis (hors du cas motivant) : les prises en charge consommées ne reviennent pas", async () => {
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

/**
 * LE QUOTA COMPTE DES COLIS, PAS DES TENTATIVES — migration 202.
 *
 * ⚠️ DÉFAUT TROUVÉ PAR LA RELECTURE ECC DU 27/09/2026, dans la 198. Le compteur de
 * colis était un déclencheur BEFORE INSERT ; or `attacher_colis` écrit par
 * `insert … on conflict do update`, à CHAQUE sauvegarde du numéro ou du transporteur.
 * Postgres exécute un BEFORE INSERT pour chaque ligne proposée, même quand elle
 * finit en mise à jour. Mesuré : UN colis réel, TROIS consommés après deux
 * changements de transporteur — et, à 15/15, préciser le transporteur d'un colis
 * EXISTANT était refusé, alors que c'est le seul geste qui relance un numéro non
 * reconnu. Numéros FACTICES : aucune prise en charge ne part d'ici (`after()`).
 */
describe("Le quota compte des colis, pas des tentatives", () => {
  const colisConsommes = async (u: UtilisateurDeTest) =>
    ((await service.from("quotas_consommes").select("colis").eq("shop_id", u.shopId)).data ?? []).reduce(
      (a, l) => a + l.colis,
      0,
    );
  const nouvelleCommande = async (u: UtilisateurDeTest) => {
    const { data, error } = await u.client.from("orders").insert({ shop_id: u.shopId }).select("id").single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };
  const ecrire = (u: UtilisateurDeTest, id: string, champ: string, valeur: string) =>
    appliquerChamp(u.client as unknown as ClientEcriture, u.profilId, id, champ, valeur);

  test("préciser le transporteur d'un colis déjà suivi ne consomme rien", async () => {
    const u = await nouveau("tentatives");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOTENTATIVE01")).statut).toBe("ok");
    expect(await ecrire(u, id, "carrier_code", "100003")).toEqual(expect.objectContaining({ statut: "ok" }));
    expect(await ecrire(u, id, "carrier_code", "100001")).toEqual(expect.objectContaining({ statut: "ok" }));
    const { count } = await service.from("tracked_parcels").select("id", { count: "exact", head: true }).eq("shop_id", u.shopId);
    expect(count, "un seul colis existe").toBe(1);
    expect(await colisConsommes(u), "le quota compte les tentatives, pas les colis").toBe(1);
  });

  test("Quota plein, le transporteur d'un colis EXISTANT se précise encore — un NOUVEAU numéro est refusé", async () => {
    const u = await nouveau("tentatives-plein");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOPLEIN-A")).statut).toBe("ok");
    const autres = Array.from({ length: PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT - 1 }, (_, i) => ({
      shop_id: u.shopId,
      tracking_number: `DEMOREMPLI${i}`,
      carrier_code: 6051,
    }));
    expect((await service.from("tracked_parcels").insert(autres)).error).toBeNull();
    expect(await colisConsommes(u)).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);

    const precise = await ecrire(u, id, "carrier_code", "100003");
    expect(precise, "le suivi d'un colis existant serait dit bloqué").toEqual({ statut: "ok", modifieeLe: expect.any(String) });
    const { data: colis } = await service
      .from("tracked_parcels")
      .select("carrier_code")
      .eq("shop_id", u.shopId)
      .eq("tracking_number", "DEMOPLEIN-A")
      .single();
    expect(colis?.carrier_code, "le transporteur précisé n'est pas arrivé sur le colis").toBe(100003);
    expect(await colisConsommes(u)).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);

    // CONTRE-TEST : un numéro NEUF reste refusé — le quota tient toujours.
    const id2 = await nouvelleCommande(u).catch(() => null);
    if (id2 !== null) {
      const neuf = await ecrire(u, id2, "tracking_number", "DEMOPLEIN-NEUF");
      expect(neuf).toEqual(expect.objectContaining({ statut: "ok", suiviBloque: "gratuit" }));
    }
    expect((await service.from("tracked_parcels").insert({ shop_id: u.shopId, tracking_number: "DEMOPLEIN-SERVICE" })).error?.code).toBe("DL070");
  });

  /*
   * ⚠️ UNE SAISIE EN COURS NE CONSOMME PAS LE QUOTA (211, audit ECC du 30/09/2026).
   * Le champ s'enregistre 800 ms après la dernière frappe : « DEMOBROUILLON », une
   * pause, puis le numéro complet, et la 172 supprime le brouillon — mais la 198 ne
   * rendait jamais ce qu'il avait consommé. Deux colis comptés pour un seul, et à
   * 4 sur 5 le vendeur ne pouvait plus TERMINER son cinquième numéro. Un brouillon
   * jamais pris en charge n'a rien coûté au fournisseur : sa place est rendue.
   */
  test("un numéro saisi en deux fois ne consomme qu'UN colis", async () => {
    const u = await nouveau("brouillon");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOBROUILLON")).statut).toBe("ok");
    expect((await ecrire(u, id, "tracking_number", "DEMOBROUILLON42")).statut).toBe("ok");
    const { count } = await service.from("tracked_parcels").select("id", { count: "exact", head: true }).eq("shop_id", u.shopId);
    expect(count, "le brouillon n'a pas été supprimé").toBe(1);
    expect(await colisConsommes(u), "le brouillon a consommé une place du quota").toBe(1);
  });

  test("à une place du quota, le dernier numéro se TERMINE — sans « suivi bloqué »", async () => {
    const u = await nouveau("brouillon-dernier");
    const remplis = Array.from({ length: PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT - 1 }, (_, i) => ({
      shop_id: u.shopId,
      tracking_number: `DEMOAVANT${i}`,
      carrier_code: 6051,
    }));
    expect((await service.from("tracked_parcels").insert(remplis)).error).toBeNull();
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMODERNIER")).statut).toBe("ok");
    const fini = await ecrire(u, id, "tracking_number", "DEMODERNIER99");
    expect(fini, "le brouillon a pris la dernière place").toEqual({ statut: "ok", modifieeLe: expect.any(String) });
    expect(await colisConsommes(u)).toBe(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT);
  });

  test("PRO (hors du cas motivant) : le brouillon rend aussi sa part du plafond MENSUEL", async () => {
    // UN COLIS GRATUIT D'ABORD : sans lui, `colis_pro` vaut `colis` et la borne
    // `least()` rendrait la part Pro à elle seule — falsifié, le test restait vert.
    const u = await nouveau("brouillon-pro");
    const gratuit = await nouvelleCommande(u);
    expect((await ecrire(u, gratuit, "tracking_number", "DEMOAVANTPRO")).statut).toBe("ok");
    await passerEnPro(u);
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOPROBROUILLON")).statut).toBe("ok");
    expect((await ecrire(u, id, "tracking_number", "DEMOPROBROUILLON7")).statut).toBe("ok");
    const { data } = await service.from("quotas_consommes").select("colis, colis_pro").eq("shop_id", u.shopId);
    const somme = (data ?? []).reduce((a, l) => ({ colis: a.colis + l.colis, pro: a.pro + l.colis_pro }), { colis: 0, pro: 0 });
    expect(somme, "le plafond mensuel du Pro compte encore le brouillon").toEqual({ colis: 2, pro: 1 });
  });

  /*
   * ⚠️ FAILLE CRITIQUE DE LA 211, TROUVÉE PAR L'AUDIT ECC DU 30/09/2026 (212).
   * Entre l'appel PAYANT au fournisseur et `marquer_prise_en_charge`, un colis a
   * `registered_at` nulle : la 211 le prenait pour un brouillon. Remplacer le
   * numéro pendant cette fenêtre — ou après un paiement accepté dont la réponse
   * s'est perdue — supprimait le colis ET rendait sa place : un compte gratuit
   * pouvait faire payer des prises en charge sans fin, son compteur restant à 1.
   *
   * La place n'est plus rendue qu'à un colis de MOINS DE 20 SECONDES. Aucun
   * paiement ne part avant 30 secondes de stabilité (`colis_a_inscrire`, 172) :
   * un colis rendu n'a donc jamais pu être payé.
   */
  const colisDe = async (u: UtilisateurDeTest, numero: string): Promise<string> => {
    const { data, error } = await service
      .from("tracked_parcels")
      .select("id")
      .eq("shop_id", u.shopId)
      .eq("tracking_number", numero)
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  };
  const vieillir = async (id: string, secondes: number) => {
    const { error } = await service
      .from("tracked_parcels")
      .update({ created_at: new Date(Date.now() - secondes * 1000).toISOString() })
      .eq("id", id);
    expect(error).toBeNull();
  };

  test("⚠️ UN COLIS QUI A PU ÊTRE PAYÉ N'EST JAMAIS RENDU, même sans `registered_at`", async () => {
    const u = await nouveau("paiement-en-vol");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOENVOL")).statut).toBe("ok");
    // 31 s : il a passé le seuil de stabilité, l'appel payant a pu partir.
    await vieillir(await colisDe(u, "DEMOENVOL"), 31);
    expect((await ecrire(u, id, "tracking_number", "DEMOENVOL-B")).statut).toBe("ok");
    expect(await colisConsommes(u), "une prise en charge en vol a été rendue au quota").toBe(2);
  });

  test("⚠️ LA FENÊTRE DE RESTITUTION RESTE SOUS LE SEUIL DE STABILITÉ", async () => {
    // Les deux délais vivent dans deux fonctions : si l'un bouge sans l'autre, la
    // faille rouvre. À 19 s, le colis n'est PAS payable ET il est rendu ; à 21 s,
    // il n'est plus rendu.
    const u = await nouveau("fenetre");
    const a = await nouvelleCommande(u);
    expect((await ecrire(u, a, "tracking_number", "DEMOFEN19")).statut).toBe("ok");
    const id19 = await colisDe(u, "DEMOFEN19");
    await vieillir(id19, 19);
    const payable = await interroger<{ ok: boolean }>(catalogue, "select public.colis_a_inscrire($1) as ok", [id19]);
    expect(payable[0]?.ok, "un colis encore rendable serait payable").toBe(false);
    expect((await ecrire(u, a, "tracking_number", "DEMOFEN19-B")).statut).toBe("ok");
    expect(await colisConsommes(u), "le brouillon de 19 s n'a pas été rendu").toBe(1);

    const b = await nouvelleCommande(u);
    expect((await ecrire(u, b, "tracking_number", "DEMOFEN21")).statut).toBe("ok");
    await vieillir(await colisDe(u, "DEMOFEN21"), 21);
    expect((await ecrire(u, b, "tracking_number", "DEMOFEN21-B")).statut).toBe("ok");
    expect(await colisConsommes(u), "un colis de 21 s a été rendu").toBe(3);
  });

  test("trois saisies successives ne consomment qu'UN colis", async () => {
    const u = await nouveau("trois-saisies");
    const id = await nouvelleCommande(u);
    for (const n of ["DEMOA", "DEMOAB", "DEMOABC"]) {
      expect((await ecrire(u, id, "tracking_number", n)).statut).toBe("ok");
    }
    expect(await colisConsommes(u)).toBe(1);
  });

  test("EFFACER le numéro d'un brouillon rend sa place", async () => {
    const u = await nouveau("numero-efface");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOVIDE")).statut).toBe("ok");
    expect((await ecrire(u, id, "tracking_number", "")).statut).toBe("ok");
    const { count } = await service.from("tracked_parcels").select("id", { count: "exact", head: true }).eq("shop_id", u.shopId);
    expect(count).toBe(0);
    expect(await colisConsommes(u)).toBe(0);
  });

  test("GROUPAGE : un colis encore porté par une AUTRE commande n'est ni supprimé ni rendu", async () => {
    const u = await nouveau("groupage");
    const a = await nouvelleCommande(u);
    const b = await nouvelleCommande(u);
    expect((await ecrire(u, a, "tracking_number", "DEMOGRP")).statut).toBe("ok");
    expect((await ecrire(u, b, "tracking_number", "DEMOGRP")).statut).toBe("ok");
    expect(await colisConsommes(u)).toBe(1);

    expect((await ecrire(u, a, "tracking_number", "DEMOGRP2")).statut).toBe("ok");
    const { count } = await service
      .from("tracked_parcels")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", u.shopId)
      .eq("tracking_number", "DEMOGRP");
    expect(count, "le colis porté par B a été supprimé").toBe(1);
    expect(await colisConsommes(u), "un colis encore porté a été rendu").toBe(2);
  });

  test("CONTRE-TEST : un colis PRIS EN CHARGE puis remplacé reste compté — il a été payé", async () => {
    const u = await nouveau("paye-remplace");
    const id = await nouvelleCommande(u);
    expect((await ecrire(u, id, "tracking_number", "DEMOPAYE")).statut).toBe("ok");
    const { error } = await service
      .from("tracked_parcels")
      .update({ registered_at: new Date().toISOString() })
      .eq("shop_id", u.shopId)
      .eq("tracking_number", "DEMOPAYE");
    expect(error).toBeNull();
    expect((await ecrire(u, id, "tracking_number", "DEMOPAYE-CORRIGE")).statut).toBe("ok");
    expect(await colisConsommes(u), "une prise en charge payée a été rendue au quota").toBe(2);
  });
});
