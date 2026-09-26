import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import { eleverEnDoubleFacteur } from "../aide/admin";
import {
  clientAnonyme,
  clientService,
  creerUtilisateur,
  malgreLAlea,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * L'APPAREIL FIABLE — migration 203, décision de Wassim du 27/09/2026.
 *
 * Un appareil marqué fiable saute la 2FA pour l'ESPACE VENDEUR pendant 30 jours,
 * mais l'ADMINISTRATION garde toujours le code (la 186 n'est pas touchée).
 *
 * On éprouve le mécanisme entier avec de VRAIES sessions : un facteur TOTP réel
 * (aal2) émet la preuve ; une session neuve (aal1, comme une reconnexion) est
 * bloquée par la garde 156, puis la preuve la débloque — pour le vendeur, jamais
 * pour l'admin. La confirmation à aal1 prouve aussi que l'exemption de garde par
 * `request.path` fonctionne : sans elle, la fonction serait refusée avant de
 * rien faire.
 */

const service = clientService();
let catalogue: Client;
const comptes: UtilisateurDeTest[] = [];

async function nouveau(etiquette: string): Promise<UtilisateurDeTest> {
  const u = await creerUtilisateur(etiquette);
  comptes.push(u);
  return u;
}

/**
 * Une session NEUVE du même compte : un vrai `signInWithPassword`, donc aal1.
 *
 * ⚠️ ENVELOPPÉE DANS `malgreLAlea` : ce fichier ouvre BEAUCOUP de sessions
 * réelles, et l'API d'auth limite par adresse (429). Sous la suite complète, un
 * `signInWithPassword` brut échouait par intermittence — un aléa d'infra, pas un
 * défaut. L'enrobage patiente sur le quota et le réseau, et sur eux seuls.
 */
async function sessionNeuve(u: UtilisateurDeTest): Promise<SupabaseClient> {
  const c = clientAnonyme();
  await malgreLAlea(`connexion neuve ${u.email}`, async () => {
    const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.motDePasse });
    return { erreur: error, valeur: null };
  });
  return c;
}

/** La garde laisse-t-elle cette session lire l'espace vendeur ? */
async function peutLire(c: SupabaseClient): Promise<boolean> {
  const { error } = await c.from("profiles").select("id").limit(1);
  if (error === null) return true;
  expect(error.code, `refus inattendu : ${error.message}`).toBe("42501");
  return false;
}

const AGENT_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const AGENT_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function preuve(u: UtilisateurDeTest, agent = AGENT_WINDOWS) {
  const { data, error } = await u.client.rpc("emettre_preuve_appareil", { p_agent: agent });
  return { data: data as { charge: string; signature: string } | null, error };
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  for (const u of comptes) await supprimerUtilisateur(u);
  await catalogue.end();
});

void service;

describe("L'appareil fiable", () => {
  test("une session neuve avec un facteur est BLOQUÉE, la preuve la débloque pour le vendeur", async () => {
    const u = await nouveau("fiable-coeur");
    await eleverEnDoubleFacteur(u); // u.client est maintenant aal2, le compte a un facteur vérifié.

    const p = await preuve(u);
    expect(p.error, `émission impossible : ${p.error?.message ?? ""}`).toBeNull();
    expect(p.data?.charge).toBeTypeOf("string");

    const neuve = await sessionNeuve(u);
    // CONTRE-TEST : sans preuve, la garde 156 bloque tout (comportement de base).
    expect(await peutLire(neuve), "une session neuve à un facteur devrait être bloquée").toBe(false);

    const conf = await neuve.rpc("confirmer_appareil_fiable", {
      p_charge: p.data!.charge,
      p_signature: p.data!.signature,
    });
    expect(conf.error, `confirmation refusée par la garde (exemption ?) : ${conf.error?.message ?? ""}`).toBeNull();
    expect(conf.data, "la preuve valide n'a pas été acceptée").toBe(true);

    expect(await peutLire(neuve), "l'appareil fiable n'ouvre pas l'espace vendeur").toBe(true);
  });

  test("l'ADMINISTRATION garde le code : un appareil fiable reste aal1, est_admin() est faux", async () => {
    const u = await nouveau("fiable-admin");
    await eleverEnDoubleFacteur(u);
    await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [u.profilId]);

    const p = await preuve(u);
    const neuve = await sessionNeuve(u);
    expect((await neuve.rpc("confirmer_appareil_fiable", { p_charge: p.data!.charge, p_signature: p.data!.signature })).data).toBe(true);
    expect(await peutLire(neuve), "l'espace vendeur doit s'ouvrir").toBe(true);

    // Mais l'admin, non : est_admin() lit session_double_facteur (aal2), qu'un
    // appareil fiable ne satisfait pas.
    const estAdmin = await neuve.rpc("est_admin");
    expect(estAdmin.data === true, "un appareil fiable a ouvert l'administration — la 186 est cassée").toBe(false);
    // La fonction admin REFUSE, sans rendre aucune donnée : est_admin() faux (aal1)
    // la fait lever « introuvable » (DL031). L'appareil fiable ne satisfait pas la 186.
    const fiche = await neuve.rpc("lire_compte_admin", { p_profil: u.profilId, p_ip_hash: "ip" });
    expect(fiche.error, "une fonction admin a répondu à un appareil fiable").not.toBeNull();
    expect(fiche.data ?? null, "une fonction admin a rendu des données à un appareil fiable").toBeNull();
    expect(fiche.error?.code).toBe("DL031");
  });

  test("CONTRE-TESTS de la preuve : signature fausse, autre compte, appareil révoqué", async () => {
    const u = await nouveau("fiable-preuve");
    await eleverEnDoubleFacteur(u);
    const p = await preuve(u);

    // (a) Signature fausse → refus, session toujours bloquée.
    const s1 = await sessionNeuve(u);
    expect((await s1.rpc("confirmer_appareil_fiable", { p_charge: p.data!.charge, p_signature: "00".repeat(32) })).data).toBe(false);
    expect(await peutLire(s1), "une signature fausse a débloqué la session").toBe(false);

    // (b) Preuve d'un AUTRE compte, présentée par u → refus (liée au porteur).
    const autre = await nouveau("fiable-autre");
    await eleverEnDoubleFacteur(autre);
    const pAutre = await preuve(autre);
    const s2 = await sessionNeuve(u);
    expect(
      (await s2.rpc("confirmer_appareil_fiable", { p_charge: pAutre.data!.charge, p_signature: pAutre.data!.signature })).data,
      "la preuve d'un autre compte a été acceptée",
    ).toBe(false);
    expect(await peutLire(s2)).toBe(false);

    // (c) Appareil révoqué → la preuve ne vaut plus rien.
    const idAppareil = p.data!.charge.split("|")[0];
    await u.client.rpc("revoquer_appareil_fiable", { p_id: idAppareil });
    const s3 = await sessionNeuve(u);
    expect((await s3.rpc("confirmer_appareil_fiable", { p_charge: p.data!.charge, p_signature: p.data!.signature })).data).toBe(false);
    expect(await peutLire(s3)).toBe(false);
  });

  test("révoquer un appareil coupe AUSSITÔT une session déjà fiable", async () => {
    const u = await nouveau("fiable-revoc");
    await eleverEnDoubleFacteur(u);
    const p = await preuve(u);
    const neuve = await sessionNeuve(u);
    await neuve.rpc("confirmer_appareil_fiable", { p_charge: p.data!.charge, p_signature: p.data!.signature });
    expect(await peutLire(neuve), "la session devrait être fiable").toBe(true);

    await u.client.rpc("revoquer_appareil_fiable", { p_id: p.data!.charge.split("|")[0] });
    expect(await peutLire(neuve), "révoquer n'a pas coupé la session fiable").toBe(false);
  });

  test("révoquer TOUS les appareils coupe toutes les sessions fiables (remédiation d'un vol de facteur)", async () => {
    const u = await nouveau("fiable-revoc-tous");
    await eleverEnDoubleFacteur(u);
    // Deux appareils fiables, deux sessions fiables.
    const p1 = await preuve(u, AGENT_WINDOWS);
    const s1 = await sessionNeuve(u);
    await s1.rpc("confirmer_appareil_fiable", { p_charge: p1.data!.charge, p_signature: p1.data!.signature });
    const p2 = await preuve(u, AGENT_IPHONE);
    const s2 = await sessionNeuve(u);
    await s2.rpc("confirmer_appareil_fiable", { p_charge: p2.data!.charge, p_signature: p2.data!.signature });
    expect(await peutLire(s1), "s1 devrait être fiable").toBe(true);
    expect(await peutLire(s2), "s2 devrait être fiable").toBe(true);

    // Le geste de remédiation : tout révoquer d'un coup.
    await u.client.rpc("revoquer_tous_les_appareils_fiables");
    expect(await peutLire(s1), "révocation globale : s1 passe encore").toBe(false);
    expect(await peutLire(s2), "révocation globale : s2 passe encore").toBe(false);
    // Plus aucun appareil actif côté vendeur.
    const restants = await u.client
      .from("appareils_fiables")
      .select("id")
      .is("revoque_le", null);
    expect(restants.data ?? [], "un appareil fiable a survécu à la révocation globale").toEqual([]);
  });

  test("une session fiable EXPIRÉE est de nouveau bloquée", async () => {
    const u = await nouveau("fiable-expire");
    await eleverEnDoubleFacteur(u);
    const p = await preuve(u);
    const neuve = await sessionNeuve(u);
    await neuve.rpc("confirmer_appareil_fiable", { p_charge: p.data!.charge, p_signature: p.data!.signature });
    expect(await peutLire(neuve)).toBe(true);

    // On antidate l'expiration de la session fiable (chemin de service, hors surface).
    await interroger(catalogue, "update public.sessions_fiables set expire_le = now() - interval '1 hour' where user_id = $1", [u.userId]);
    expect(await peutLire(neuve), "une session fiable expirée passe encore").toBe(false);
  });

  test("émettre une preuve exige aal2 : une session neuve (aal1) ne le peut pas", async () => {
    const u = await nouveau("fiable-aal1");
    await eleverEnDoubleFacteur(u);
    const neuve = await sessionNeuve(u); // aal1, avec un facteur
    const { data, error } = await neuve.rpc("emettre_preuve_appareil", { p_agent: "x" });
    // La garde 156 refuse déjà l'appel (chemin non exempté) ; dans tous les cas, pas de preuve.
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  test("un vendeur ne lit que SES appareils, jamais la table des sessions fiables", async () => {
    const u = await nouveau("fiable-lecture");
    await eleverEnDoubleFacteur(u);
    await preuve(u, AGENT_WINDOWS);
    const autre = await nouveau("fiable-voisin");
    await eleverEnDoubleFacteur(autre);
    await preuve(autre, AGENT_IPHONE);

    const lu = await u.client.from("appareils_fiables").select("agent, user_id");
    expect(lu.error).toBeNull();
    expect((lu.data ?? []).every((a) => a.user_id === u.userId), "un appareil d'un autre est visible").toBe(true);
    expect((lu.data ?? []).map((a) => a.agent).join(" "), "l.agent brut du vendeur n.est pas stocke").toContain("Windows");

    // La table des sessions fiables n'est lisible par aucun vendeur.
    const sf = await u.client.from("sessions_fiables").select("session_id");
    expect(sf.data ?? [], "un vendeur lit sessions_fiables").toEqual([]);
  });
});
