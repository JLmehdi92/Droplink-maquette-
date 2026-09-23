import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * CHAQUE SERVER ACTION REFUSE SANS SESSION — PAR L'EFFET, PAS PAR LE MOT.
 *
 * `actions-gardees.test.ts` exige que le TEXTE de chaque action appelle
 * `lireProfilVendeur()` ou `exigerAdmin()`. C'est L-020 : un contrôle qui cherche
 * un mot. Une garde appelée puis ignorée, ou appelée APRÈS l'écriture, passe ce
 * contrôle-là.
 *
 * Celui-ci APPELLE chaque export de chaque module `"use server"` — ce sont des
 * points d'entrée publics, n'importe quel navigateur peut les invoquer — sans
 * session, puis avec un compte suspendu (vendeur) ou non administrateur (admin),
 * et exige qu'AUCUN client de base de données n'ait été créé. L'inventaire des
 * exports est fait à l'exécution : une action ajoutée demain y entre d'office.
 *
 * Les modules d'ACCÈS (connexion, vérification, nouveau mot de passe) n'y sont
 * pas : ils s'appellent précisément sans session, et ont leurs propres suites.
 */

const clientsCrees: string[] = [];
function fabrique(nom: string) {
  return () => {
    clientsCrees.push(nom);
    throw new Error("client de base créé par " + nom);
  };
}
vi.mock("@/lib/supabase/server", () => ({ creerClientServeur: fabrique("serveur") }));
vi.mock("@/lib/supabase/system", () => ({ creerClientSysteme: fabrique("systeme") }));
vi.mock("@/lib/supabase/anon", () => ({ creerClientAnonyme: fabrique("anonyme") }));
vi.mock("@/lib/supabase/verification", () => ({ creerClientVerification: fabrique("verification") }));

let profil: { profilId: string; shopId: string; statut: "active" | "suspended"; email: string } | null = null;
vi.mock("@/lib/comptes/profil", () => ({ lireProfilVendeur: async () => profil }));

class Introuvable extends Error {}
class Redirection extends Error {}
vi.mock("@/lib/audit/garde", () => ({
  exigerAdmin: async () => {
    throw new Introuvable("404");
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Introuvable("404");
  },
  redirect: () => {
    throw new Redirection("redirect");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
// Le plancher de durée (contre la mesure du temps de réponse) est voulu en
// production ; ici il ferait seulement attendre chaque appel.
vi.mock("@/lib/auth/plancher", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/auth/plancher")),
  attendrePlancher: async () => undefined,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }),
}));
vi.mock("@/lib/instrumentation/emettre", () => ({
  emettre: async () => undefined,
  emettreApres: () => undefined,
}));

const MODULES_VENDEUR = {
  "lib/commandes/actions": () => import("@/lib/commandes/actions"),
  "lib/commandes/actions-medias": () => import("@/lib/commandes/actions-medias"),
  "lib/commandes/actions-contestation": () => import("@/lib/commandes/actions-contestation"),
  "marque/actions": () => import("@/app/[locale]/(app)/marque/actions"),
  "parametres/actions": () => import("@/app/[locale]/(app)/parametres/actions"),
  "bienvenue/actions": () => import("@/app/[locale]/bienvenue/actions"),
};
const MODULES_ADMIN = {
  "admin/commandes/actions": () => import("@/app/[locale]/admin/commandes/actions"),
  "admin/comptes/[id]/actions": () => import("@/app/[locale]/admin/comptes/[id]/actions"),
  "admin/parametres/actions": () => import("@/app/[locale]/admin/parametres/actions"),
};

/** Des entrées plausibles : un formulaire rempli, un objet, un identifiant. */
function entreesPlausibles(): unknown[] {
  const f = new FormData();
  for (const cle of ["id", "orderId", "commandeId", "profilId", "mediaId", "parcelId"]) {
    f.set(cle, "00000000-0000-4000-8000-000000000001");
  }
  f.set("motDePasse", "un-mot-de-passe-tres-long-1");
  f.set("nom", "Boutique");
  return [f, { id: "00000000-0000-4000-8000-000000000001", orderId: "00000000-0000-4000-8000-000000000001" }];
}

async function appeler(fn: (...a: unknown[]) => unknown): Promise<void> {
  for (const entree of entreesPlausibles()) {
    // Une exception quelconque est acceptable TANT QU'AUCUN client n'a été
    // créé : c'est ce que l'assertion vérifie ensuite.
    try {
      await fn(entree, entree);
    } catch {
      /* seule compte l'absence de client */
    }
    try {
      await fn(undefined, entree);
    } catch {
      /* seule compte l'absence de client */
    }
  }
}

async function exportsAppelables(charger: () => Promise<Record<string, unknown>>) {
  const charge = await charger();
  return Object.entries(charge).filter(([, v]) => typeof v === "function") as [
    string,
    (...a: unknown[]) => unknown,
  ][];
}

beforeEach(() => {
  clientsCrees.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("Les actions vendeur", () => {
  test("l'inventaire trouve des actions — un ensemble vide passerait tout", async () => {
    let total = 0;
    for (const charger of Object.values(MODULES_VENDEUR)) total += (await exportsAppelables(charger)).length;
    expect(total).toBeGreaterThanOrEqual(20);
  });

  for (const [nom, charger] of Object.entries(MODULES_VENDEUR)) {
    test(`⚠️ ${nom} : sans session, AUCUN export ne touche la base`, async () => {
      profil = null;
      for (const [action, fn] of await exportsAppelables(charger)) {
        clientsCrees.length = 0;
        await appeler(fn);
        expect(clientsCrees, `${nom}.${action} a créé un client SANS session`).toEqual([]);
      }
    });

    test(`⚠️ ${nom} : compte suspendu, AUCUN export ne touche la base`, async () => {
      profil = {
        profilId: "00000000-0000-4000-8000-0000000000aa",
        shopId: "00000000-0000-4000-8000-0000000000bb",
        statut: "suspended",
        email: "suspendu@exemple.test",
      };
      for (const [action, fn] of await exportsAppelables(charger)) {
        clientsCrees.length = 0;
        await appeler(fn);
        expect(clientsCrees, `${nom}.${action} a créé un client pour un compte SUSPENDU`).toEqual([]);
      }
    });
  }
});

describe("Les actions d'administration", () => {
  for (const [nom, charger] of Object.entries(MODULES_ADMIN)) {
    test(`⚠️ ${nom} : sans administrateur, AUCUN export ne touche la base`, async () => {
      const exports = await exportsAppelables(charger);
      expect(exports.length, `${nom} n'exporte rien : la sonde n'inspecterait rien`).toBeGreaterThan(0);
      for (const [action, fn] of exports) {
        clientsCrees.length = 0;
        await appeler(fn);
        expect(clientsCrees, `${nom}.${action} a créé un client sans administrateur`).toEqual([]);
      }
    });
  }
});

describe("CONTRE-TEST : la sonde voit un client créé", () => {
  test("avec un compte ACTIF, au moins une action vendeur atteint la base", async () => {
    // Sans ce contrôle, une sonde dont les substituts ne seraient jamais
    // atteints passerait tout.
    profil = {
      profilId: "00000000-0000-4000-8000-0000000000aa",
      shopId: "00000000-0000-4000-8000-0000000000bb",
      statut: "active",
      email: "actif@exemple.test",
    };
    let atteintes = 0;
    for (const charger of Object.values(MODULES_VENDEUR)) {
      for (const [, fn] of await exportsAppelables(charger)) {
        clientsCrees.length = 0;
        await appeler(fn);
        if (clientsCrees.length > 0) atteintes += 1;
      }
    }
    expect(atteintes).toBeGreaterThanOrEqual(10);
  });
});
