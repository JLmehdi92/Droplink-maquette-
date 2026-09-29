import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { eleverEnDoubleFacteur } from "../aide/admin";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * L'ADMINISTRATION EXIGE LA DOUBLE AUTHENTIFICATION — EN BASE (migration 186).
 *
 * Décision de Wassim du 23/09/2026. Un mot de passe administrateur volé ouvrait
 * TOUTES les données de TOUS les vendeurs, et la suspension de n'importe quel
 * compte. La règle vit en base, pas à l'écran : une page ou une action oubliée ne
 * peut pas la contourner.
 *
 * Deux points de passage suffisent, et c'est pourquoi la migration est courte :
 * `est_admin()` — que 31 fonctions d'administration appellent — et
 * `journaliser_admin()`, que les SEPT fonctions qui vérifient le rôle en ligne
 * appellent toutes dans leur transaction. Refusé là, un geste est annulé entier.
 */

let simple: UtilisateurDeTest; // administrateur, session à UN facteur
let double: UtilisateurDeTest; // administrateur, session aal2
let vendeur: UtilisateurDeTest;
let cible: UtilisateurDeTest;
let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  simple = await creerUtilisateur("dfa-admin-simple");
  double = await creerUtilisateur("dfa-admin-double");
  vendeur = await creerUtilisateur("dfa-vendeur");
  cible = await creerUtilisateur("dfa-cible");
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = any($1)", [
    [simple.profilId, double.profilId],
  ]);
  await eleverEnDoubleFacteur(double);
}, 120_000);

afterAll(async () => {
  for (const u of [simple, double, vendeur, cible]) await supprimerUtilisateur(u);
  await catalogue.end();
}, 60_000);

describe("L'administration sans double authentification", () => {
  test("CONTRE-TEST : l'administrateur en aal2 EST administrateur", async () => {
    const { data, error } = await double.client.rpc("est_admin");
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  test("⚠️ UN ADMINISTRATEUR À UN SEUL FACTEUR N'EST PAS ADMINISTRATEUR", async () => {
    const { data } = await simple.client.rpc("est_admin");
    expect(data, "un mot de passe seul ouvre l'administration").toBe(false);
  });

  test("⚠️ SUSPENDRE UN COMPTE À UN SEUL FACTEUR EST REFUSÉ, ET RIEN N'EST ÉCRIT", async () => {
    // `suspendre_compte` vérifie le rôle EN LIGNE, sans passer par `est_admin` :
    // c'est `journaliser_admin`, appelé dans sa transaction, qui doit l'arrêter.
    const { error } = await simple.client.rpc("suspendre_compte", {
      p_profil: cible.profilId,
      p_motif: "essai à un seul facteur",
      p_ip_hash: "",
    });
    expect(error, "la suspension est passée à un seul facteur").not.toBeNull();
    const lignes = await interroger<{ status: string }>(
      catalogue,
      "select status from public.profiles where id = $1",
      [cible.profilId],
    );
    expect(lignes[0]?.status).toBe("active");
    const traces = await interroger<{ n: string }>(
      catalogue,
      "select count(*)::text as n from public.admin_audit_log where target_profile_id = $1",
      [cible.profilId],
    );
    expect(traces[0]?.n, "une trace a été écrite pour un geste refusé").toBe("0");
  });

  test("CONTRE-TEST : la même suspension en aal2 passe", async () => {
    const { error } = await double.client.rpc("suspendre_compte", {
      p_profil: cible.profilId,
      p_motif: "essai en double facteur",
      p_ip_hash: "",
    });
    expect(error, error?.message).toBeNull();
    await interroger(catalogue, "update public.profiles set status = 'active' where id = $1", [cible.profilId]);
  });

  test("⚠️ ÉCRIRE AU JOURNAL D'AUDIT À UN SEUL FACTEUR EST REFUSÉ", async () => {
    const { error } = await simple.client.rpc("journaliser_admin", {
      p_action: "essai",
      p_resource_type: "profiles",
      p_resource_id: "",
      p_cible: null,
      p_ip_hash: "",
      p_payload: {},
    });
    expect(error).not.toBeNull();
  });
});

/*
 * ⚠️ L'ORDRE DE L'EXIGENCE, PAR INVENTAIRE — audit ECC du 30/09/2026.
 *
 * Les fonctions qui vérifient le rôle EN LIGNE (`role = 'admin'`) n'exigent la
 * double authentification que parce qu'elles appellent `journaliser_admin` AVANT
 * d'écrire. C'est une discipline, pas une structure (L-029) : une future fonction
 * qui écrirait d'abord, ou oublierait le journal, ouvrirait un geste d'administration
 * à un mot de passe seul — et le test ci-dessus, qui n'essaie que la suspension,
 * ne le verrait pas.
 *
 * On INVENTORIE donc le catalogue : toute fonction `security definer` qui mentionne
 * le rôle admin et écrit ailleurs que dans le journal doit appeler une garde de
 * double facteur AVANT sa première écriture. Lu sur le CODE, commentaires retirés
 * (L-031) — sinon un commentaire qui décrit la garde la satisferait.
 */
describe("Toute écriture d'administration exige la double authentification AVANT d'écrire", () => {
  const GARDES = /\b(est_admin|journaliser_admin|session_double_facteur)\s*\(/i;
  const ECRITURE = /\b(insert\s+into\s+(?!public\.admin_audit_log\b)[\w.]+|update\s+(?!public\.admin_audit_log\b)[\w.]+\s+(?:\w+\s+)?set|delete\s+from\s+(?!public\.admin_audit_log\b)[\w.]+)/i;
  const sansCommentaires = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

  test("chaque fonction d'écriture d'administration appelle sa garde avant sa première écriture", async () => {
    const fonctions = await interroger<{ nom: string; src: string }>(
      catalogue,
      `select p.proname as nom, p.prosrc as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute')`,
    );
    const inspectees: string[] = [];
    const fautives: string[] = [];
    for (const f of fonctions) {
      const code = sansCommentaires(f.src);
      // Le rôle vérifié EN LIGNE, ou par l'une des gardes (`ecrire_parametre` ne
      // passe que par `est_admin`) : filtrer sur le seul texte du rôle l'oubliait.
      if (!/role\s*=\s*'admin'/i.test(code) && !GARDES.test(code)) continue;
      const ecriture = ECRITURE.exec(code);
      if (ecriture === null) continue;
      inspectees.push(f.nom);
      const garde = GARDES.exec(code);
      if (garde === null || garde.index > ecriture.index) fautives.push(`${f.nom} (écrit « ${ecriture[0]} » avant toute garde)`);
    }
    // UN ENSEMBLE VIDE PASSE TOUT : les sept écritures connues doivent être inspectées
    // (suspendre, réactiver, plan, bloquer, débloquer, refuser une contestation, paramètre).
    expect(inspectees.length, `fonctions inspectées : ${inspectees.join(", ")}`).toBeGreaterThanOrEqual(7);
    expect(fautives, "écriture d'administration possible à un seul facteur").toEqual([]);
  });
});

describe("Ce que l'écran peut dire à l'administrateur", () => {
  test("un administrateur à un seul facteur est reconnu comme tel — pour être envoyé activer la 2FA", async () => {
    expect((await simple.client.rpc("admin_sans_double_facteur")).data).toBe(true);
  });

  test("⚠️ UN VENDEUR N'APPREND RIEN : même réponse qu'un administrateur en règle", async () => {
    // Sinon la fonction dirait à n'importe qui « l'administration existe ».
    expect((await vendeur.client.rpc("admin_sans_double_facteur")).data).toBe(false);
    expect((await double.client.rpc("admin_sans_double_facteur")).data).toBe(false);
  });
});
