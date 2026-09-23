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
