import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LES TROIS CHEMINS QUI CHOISISSENT UN MOT DE PASSE REFUSENT CELUI QUI A FUITÉ —
 * AVANT d'appeler le serveur d'authentification.
 *
 * Inscription, réinitialisation, changement dans les paramètres. Une vérification
 * posée sur deux chemins sur trois laisserait le troisième ouvert, et c'est
 * précisément celui qu'un attaquant emprunterait. Le contrôle porte sur l'EFFET :
 * `signUp` / `updateUser` ne sont jamais appelés avec un mot de passe fuité, et
 * le sont avec un mot de passe sain (contre-test).
 */

let verdict: "fuite" | "sain" | "inconnu" = "fuite";
vi.mock("@/lib/auth/fuites", () => ({ verifierFuite: async () => verdict }));

const appelsAuth: string[] = [];
const client = {
  auth: {
    signUp: async () => {
      appelsAuth.push("signUp");
      return { data: { user: null, session: null }, error: { message: "arrêt du test", status: 500 } };
    },
    updateUser: async () => {
      appelsAuth.push("updateUser");
      return { data: {}, error: { message: "arrêt du test" } };
    },
  },
  rpc: async () => ({ data: true, error: null }),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
};
vi.mock("@/lib/supabase/server", () => ({ creerClientServeur: async () => client }));
vi.mock("@/lib/supabase/system", () => ({ creerClientSysteme: () => client }));
vi.mock("@/lib/auth/plancher", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/auth/plancher")),
  attendrePlancher: async () => undefined,
}));
vi.mock("@/lib/limitation/quota", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/limitation/quota")),
  verifierQuotaAuth: async () => ({ autorise: true }),
  verifierQuotaMotDePasse: async () => ({ autorise: true }),
}));
vi.mock("@/lib/comptes/profil", () => ({
  lireProfilVendeur: async () => ({
    profilId: "00000000-0000-4000-8000-0000000000aa",
    shopId: "00000000-0000-4000-8000-0000000000bb",
    email: "vendeur@exemple.test",
    statut: "active",
    langue: "fr",
  }),
}));
vi.mock("@/lib/auth/recuperation", () => ({ sessionParEmail: async () => true }));
vi.mock("@/lib/auth/reauthentification", () => ({ verifierMotDePasseActuel: async () => "ok" }));
vi.mock("@/lib/site", () => ({
  origineDuSite: async () => "https://droplink.fr",
  origineConfiguree: () => "https://droplink.fr",
}));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection");
  },
  notFound: () => {
    throw new Error("404");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }),
}));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre: async () => undefined, emettreApres: () => undefined }));

const { sInscrire } = await import("@/app/[locale]/connexion/actions");
const { changerMotDePasse } = await import("@/app/[locale]/nouveau-mot-de-passe/actions");
const { changerMotDePasseCompte } = await import("@/app/[locale]/(app)/parametres/actions");

const MDP = "un-mot-de-passe-tres-long-9";

function formulaire(champs: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}

const CHEMINS = {
  inscription: () =>
    sInscrire({ statut: "inactif" } as never, formulaire({ email: "nouveau@exemple.test", motDePasse: MDP, locale: "fr" })),
  reinitialisation: () => changerMotDePasse({ statut: "inactif" } as never, formulaire({ motDePasse: MDP, locale: "fr" })),
  parametres: () =>
    changerMotDePasseCompte({ statut: "inactif" } as never, formulaire({ actuel: "ancien-mot-de-passe-long", nouveau: MDP })),
};
const MOTIF_ATTENDU = { inscription: "mdp_fuite", reinitialisation: "fuite", parametres: "mdp_fuite" };

beforeEach(() => {
  appelsAuth.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("Un mot de passe fuité", () => {
  for (const [nom, appeler] of Object.entries(CHEMINS)) {
    test(`⚠️ ${nom} : refusé AVANT le serveur d'authentification, avec son motif`, async () => {
      verdict = "fuite";
      const r = await appeler().catch((e: unknown) => e);
      expect(r).toEqual({ statut: "erreur", motif: MOTIF_ATTENDU[nom as keyof typeof MOTIF_ATTENDU] });
      expect(appelsAuth, `${nom} a transmis un mot de passe fuité`).toEqual([]);
    });

    test(`CONTRE-TEST — ${nom} : un mot de passe sain atteint le serveur d'authentification`, async () => {
      verdict = "sain";
      await appeler().catch(() => undefined);
      expect(appelsAuth.length, `${nom} n'atteint jamais l'authentification : le refus ne prouverait rien`).toBe(1);
    });

    test(`${nom} : un service des fuites en panne n'empêche pas de choisir son mot de passe`, async () => {
      verdict = "inconnu";
      await appeler().catch(() => undefined);
      expect(appelsAuth.length).toBe(1);
    });
  }
});
