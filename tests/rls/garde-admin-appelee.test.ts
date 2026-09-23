import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";
import {
  creerUtilisateur,
  supprimerUtilisateur,
  type UtilisateurDeTest,
} from "../aide/utilisateurs";

/**
 * LA GARDE DE L'ADMINISTRATION, APPELÉE POUR DE VRAI — 23/09/2026.
 *
 * `exigerAdmin()` protège les neuf écrans d'administration. Son exception de
 * couverture disait « éprouvée par la fumée : 404 sans session ». C'est UN cas
 * sur cinq : la fumée n'a jamais présenté la session d'un VENDEUR connecté à
 * cette garde, ni un quota épuisé, ni une panne de la base.
 *
 * Le rôle est lu EN BASE, par la vraie fonction `est_admin`, sous la vraie
 * session : aucun rôle n'est simulé. Seuls le cookie, le quota et `notFound`
 * (qui n'existe que dans le rendu de Next) sont substitués.
 */

class Introuvable extends Error {}

let session: SupabaseClient | null = null;
let profil: { profilId: string; email: string } | null = null;
let quotaAutorise = true;
let panne = false;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Introuvable("404");
  },
}));
vi.mock("@/lib/limitation/quota", () => ({
  verifierQuotaAdmin: async () => ({ autorise: quotaAutorise }),
}));
vi.mock("@/lib/comptes/profil", () => ({ lireProfilVendeur: async () => profil }));
vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => {
    if (session === null) throw new Error("aucune session posée");
    if (!panne) return session;
    return { rpc: async () => ({ data: null, error: { message: "panne" } }) };
  },
}));

const { exigerAdmin } = await import("@/lib/audit/garde");

let vendeur: UtilisateurDeTest;
let admin: UtilisateurDeTest;
let catalogue: Client;

function comme(u: UtilisateurDeTest): void {
  session = u.client;
  profil = { profilId: u.profilId, email: u.email };
}

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  vendeur = await creerUtilisateur("garde-vendeur");
  admin = await creerUtilisateur("garde-admin");
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [admin.profilId]);
}, 90_000);

afterAll(async () => {
  await interroger(catalogue, "update public.profiles set role = 'user' where id = $1", [admin.profilId]);
  await supprimerUtilisateur(vendeur);
  await supprimerUtilisateur(admin);
  await catalogue.end();
}, 60_000);

beforeEach(() => {
  quotaAutorise = true;
  panne = false;
});

describe("La garde de l'administration", () => {
  test("CONTRE-TEST : un administrateur EN BASE passe, et la garde rend son identité", async () => {
    comme(admin);
    expect(await exigerAdmin()).toEqual({ profilId: admin.profilId, email: admin.email });
  });

  test("⚠️ UN VENDEUR CONNECTÉ REÇOIT UN 404 — jamais un 403", async () => {
    // Un 403 confirmerait que la surface existe. La session est valide, le
    // profil aussi : seul le rôle, lu en base, fait la différence.
    comme(vendeur);
    await expect(exigerAdmin()).rejects.toBeInstanceOf(Introuvable);
  });

  test("sans profil, 404", async () => {
    comme(admin);
    profil = null;
    await expect(exigerAdmin()).rejects.toBeInstanceOf(Introuvable);
  });

  test("⚠️ UNE PANNE DE LA BASE REFUSE — l'administration ne s'ouvre jamais par défaut", async () => {
    comme(admin);
    panne = true;
    await expect(exigerAdmin()).rejects.toBeInstanceOf(Introuvable);
  });

  test("un quota épuisé refuse, même à un administrateur", async () => {
    comme(admin);
    quotaAutorise = false;
    await expect(exigerAdmin()).rejects.toBeInstanceOf(Introuvable);
  });
});
