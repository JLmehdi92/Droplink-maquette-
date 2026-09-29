import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * SUPPRIMER UN COMPTE DONT L'ABONNEMENT PRÉLÈVE ENCORE — audit RGPD du 29/09/2026.
 *
 * La base refuse (DL077, migration 206) : la cascade effacerait l'abonnement
 * chez nous, jamais chez Lemon Squeezy, qui continuerait de prélever. L'écran
 * doit alors DIRE pourquoi et comment faire — pas « service indisponible », qui
 * ferait réessayer en boucle un vendeur qui ne peut rien y changer.
 */

let codeRefus: string | null = "DL077";

vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => ({
    rpc: async () =>
      codeRefus === null
        ? { data: [], error: null }
        : { data: null, error: { code: codeRefus, message: "refus de la base" } },
    auth: { signOut: async () => ({ error: null }) },
  }),
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
vi.mock("@/lib/auth/reauthentification", () => ({ verifierMotDePasseActuel: async () => "ok" }));
vi.mock("@/lib/auth/plancher", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/auth/plancher")),
  attendrePlancher: async () => undefined,
}));
vi.mock("@/lib/storage/purge", () => ({ purgerCles: async () => ({ purgees: [], echecs: 0 }) }));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre: async () => undefined, emettreApres: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => undefined }),
}));

const { supprimerMonCompte } = await import("@/app/[locale]/(app)/parametres/actions");

function formulaire(): FormData {
  const f = new FormData();
  f.set("confirmation", "vendeur@exemple.test");
  f.set("actuel", "un-mot-de-passe-actuel");
  f.set("locale", "fr");
  return f;
}

const ENV = process.env["LEMON_SQUEEZY_CHECKOUT_URL"];
beforeEach(() => {
  codeRefus = "DL077";
  process.env["LEMON_SQUEEZY_CHECKOUT_URL"] = "https://droplink.lemonsqueezy.com/buy/0000-aaaa";
});
afterEach(() => {
  if (ENV === undefined) delete process.env["LEMON_SQUEEZY_CHECKOUT_URL"];
  else process.env["LEMON_SQUEEZY_CHECKOUT_URL"] = ENV;
});

describe("La suppression refusée pour abonnement en cours se DIT", () => {
  test("DL077 rend le motif « abonnement_en_cours » et le portail client du fournisseur", async () => {
    const etat = await supprimerMonCompte({ statut: "inactif" }, formulaire());
    expect(etat).toEqual({
      statut: "erreur",
      motif: "abonnement_en_cours",
      portail: "https://droplink.lemonsqueezy.com/billing",
    });
  });

  test("sans lien de paiement configuré, le motif reste dit, sans lien inventé", async () => {
    delete process.env["LEMON_SQUEEZY_CHECKOUT_URL"];
    const etat = await supprimerMonCompte({ statut: "inactif" }, formulaire());
    expect(etat).toEqual({ statut: "erreur", motif: "abonnement_en_cours", portail: null });
  });

  test("CONTRE-TEST : une autre panne reste « indisponible »", async () => {
    codeRefus = "XX000";
    const etat = await supprimerMonCompte({ statut: "inactif" }, formulaire());
    expect(etat).toEqual({ statut: "erreur", motif: "indisponible" });
  });

  test("CONTRE-TEST : sans refus, la suppression va au bout (redirection)", async () => {
    codeRefus = null;
    await expect(supprimerMonCompte({ statut: "inactif" }, formulaire())).rejects.toThrow("redirection");
  });
});
