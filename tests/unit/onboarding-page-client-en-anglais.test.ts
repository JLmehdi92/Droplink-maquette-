import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LA PAGE CLIENT D'UN NOUVEAU COMPTE PART EN ANGLAIS, QUELLE QUE SOIT LA LANGUE
 * DE L'INSCRIPTION.
 *
 * Décision de Mehdi du 29/09/2026 : un fournisseur inscrit par `/zh-CN` voyait
 * sa première page client servie en chinois à un acheteur qui ne le lit pas.
 * L'accueil recopiait la langue de l'INTERFACE du vendeur dans la langue de ses
 * PAGES CLIENT. Les deux restent distinctes : l'interface suit le vendeur, la
 * page client part en anglais, et « Ma marque » permet de la changer.
 *
 * Le contrôle porte sur l'EFFET : la valeur réellement transmise à l'écriture
 * des réglages de marque, et celle écrite dans le profil (contre-test : la
 * langue de l'interface n'est PAS forcée en anglais).
 */

const reglagesEcrits: Array<Record<string, unknown>> = [];
const profilsEcrits: Array<Record<string, unknown>> = [];

// Seule l'ÉCRITURE est interceptée : le reste du module (dont la langue par
// défaut) est le vrai. Le test compare ensuite à la valeur littérale « en »,
// pas à la constante — sinon il se satisferait de n'importe quelle valeur.
vi.mock("@/lib/boutique/reglages", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/boutique/reglages")),
  appliquerReglagesMarque: async (_client: unknown, _shop: string, reglages: Record<string, unknown>) => {
    reglagesEcrits.push(reglages);
    return true;
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  creerClientServeur: async () => ({
    from: () => ({
      update: (valeurs: Record<string, unknown>) => {
        profilsEcrits.push(valeurs);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
vi.mock("@/lib/comptes/profil", () => ({
  lireProfilVendeur: async () => ({
    profilId: "00000000-0000-4000-8000-0000000000aa",
    shopId: "00000000-0000-4000-8000-0000000000bb",
    statut: "active",
    logoUrl: null,
  }),
  onboardingAFaire: () => true,
}));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre: async () => undefined, emettreApres: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirection");
  },
}));

const { terminerOnboarding } = await import("@/app/[locale]/bienvenue/actions");

function formulaire(locale: string): FormData {
  const f = new FormData();
  f.set("typeDeCompte", "supplier");
  f.set("nom", "Atelier Test");
  f.set("couleurAccent", "#5B4BF5");
  f.set("locale", locale);
  return f;
}

beforeEach(() => {
  reglagesEcrits.length = 0;
  profilsEcrits.length = 0;
});

describe("L'accueil pose une page client en anglais", () => {
  for (const locale of ["fr", "en", "zh-CN"]) {
    test(`inscrit en ${locale} : la page client part en anglais, l'interface garde ${locale}`, async () => {
      // La redirection finale vers les commandes lève dans ce test : elle
      // prouve que l'action est allée au bout.
      await expect(terminerOnboarding({ statut: "inactif" }, formulaire(locale))).rejects.toThrow("redirection");

      expect(reglagesEcrits, "les réglages de marque n'ont pas été écrits").toHaveLength(1);
      expect(reglagesEcrits[0]?.["languePublique"]).toBe("en");

      // CONTRE-TEST : l'interface du vendeur reste dans SA langue.
      expect(profilsEcrits[0]?.["locale"]).toBe(locale);
    });
  }
});
