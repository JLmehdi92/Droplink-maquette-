import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * ARCHIVER INVALIDE LA PAGE DU JETON QUE LA BASE PORTE, JAMAIS CELUI DU FORMULAIRE.
 *
 * DÉFAUT ANTÉRIEUR À LA REFONTE (journal § 9, tranché par Mehdi le 03/10/2026) : le menu
 * « ••• » de la fiche est rendu au serveur avec le jeton DU CHARGEMENT. Après une
 * révocation sans rechargement, « Archiver » postait l'ANCIEN jeton, et la route
 * invalidait la page d'un lien mort pendant que celle du lien vivant gardait son cache.
 *
 * ET LE JETON VENU DU NAVIGATEUR N'A RIEN À FAIRE LÀ : la route invalidait n'importe
 * quelle étiquette de cache qu'on lui tendait. Le jeton est la donnée la plus sensible du
 * produit ; il est donc RELU EN BASE, sous RLS, par l'écriture même (`returning`).
 */

const invalides: string[] = [];
vi.mock("@/lib/commandes/cache", () => ({
  invaliderCommandePublique: (jeton: string) => invalides.push(jeton),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettreApres: () => undefined }));
vi.mock("@/lib/commandes/journal", () => ({ journaliserApres: () => undefined }));
vi.mock("@/lib/comptes/profil", () => ({
  lireProfilVendeur: async () => ({ profilId: "p1", shopId: "s1", statut: "active", email: "x@exemple.test" }),
}));

const ID = "4c676d85-0000-4000-8000-000000000001";
const JETON_EN_BASE = "jetonDeLaBaseAAAAAAAA";
let reponse: { data: unknown; error: unknown } = { data: null, error: null };
let colonnes = "";
vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          select: (c: string) => {
            colonnes = c;
            return { maybeSingle: async () => reponse };
          },
        }),
      }),
    }),
  }),
}));

function formulaire(jeton: string | null): FormData {
  const f = new FormData();
  f.set("geste", "archiver");
  f.set("id", ID);
  if (jeton !== null) f.set("jeton", jeton);
  f.set("archiver", "1");
  f.set("retour", "/fr/commandes");
  return f;
}

beforeEach(() => {
  invalides.length = 0;
  reponse = { data: { id: ID, archived_at: new Date().toISOString(), public_token: JETON_EN_BASE }, error: null };
});

describe("Archiver depuis la liste ou la fiche", () => {
  test("invalide le jeton RELU EN BASE, pas l'ancien jeton posté après une révocation", async () => {
    const { executerGesteDeListe } = await import("@/lib/commandes/geste-liste");
    await executerGesteDeListe(formulaire("ancienJetonRevoqueBBBB"));
    expect(invalides).toEqual([JETON_EN_BASE]);
    // Le jeton est bien demandé à l'écriture elle-même (`returning`), pas inventé.
    expect(colonnes.split(",").map((x) => x.trim())).toContain("public_token");
  });

  test("le jeton du formulaire est ignoré même absent : la page vivante est invalidée", async () => {
    const { executerGesteDeListe } = await import("@/lib/commandes/geste-liste");
    await executerGesteDeListe(formulaire(null));
    expect(invalides).toEqual([JETON_EN_BASE]);
  });

  test("contre-test : une écriture refusée n'invalide rien", async () => {
    reponse = { data: null, error: null };
    const { executerGesteDeListe } = await import("@/lib/commandes/geste-liste");
    await executerGesteDeListe(formulaire("nImporteQuoiCCCCCCCCC"));
    expect(invalides).toEqual([]);
  });
});
