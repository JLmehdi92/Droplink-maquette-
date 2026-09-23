import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * LA CONFIGURATION ÉCHOUE FERMÉ — quatre lectures d'environnement qu'aucun test
 * n'exerçait le 23/09/2026 (couverture à 0 %).
 *
 * Chacune transforme une variable d'environnement en décision, et chacune peut
 * se tromper dans le sens dangereux : une adresse de site devinée depuis la
 * requête, un contact d'abus qui est encore « votre@exemple.fr », un fournisseur
 * d'identité allumé par « true » au lieu de « 1 ». L-026 : une valeur qui a la
 * FORME d'une configuration franchit toutes les validations de présence.
 */

let entetes: Record<string, string> = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers(entetes) }));

const { origineConfiguree, origineDuSite } = await import("@/lib/site");
const { adresseAbus, signalementDisponible } = await import("@/lib/contact");
const { fournisseurActif, fournisseursActifs } = await import("@/lib/auth/fournisseurs");
const { alternatesDe, alternatesUneSeuleLangue } = await import("@/lib/seo/alternates");

const SAUVE = { ...process.env };
afterEach(() => {
  for (const cle of Object.keys(process.env)) if (!(cle in SAUVE)) delete process.env[cle];
  Object.assign(process.env, SAUVE);
  entetes = {};
  vi.restoreAllMocks();
});

/** `NODE_ENV` est typé en lecture seule ; on l'écrit comme n'importe quelle clé. */
function poser(cle: string, valeur: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (valeur === undefined) delete env[cle];
  else env[cle] = valeur;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("L'adresse du site", () => {
  test("CONTRE-TEST : une adresse https configurée est rendue, réduite à son origine", () => {
    poser("NEXT_PUBLIC_SITE_URL", "https://droplink.fr/fr/commandes?x=1");
    expect(origineConfiguree()).toBe("https://droplink.fr");
  });

  test("une adresse en http est refusée — sauf en local", () => {
    // Un lien de réinitialisation envoyé en clair se lit sur le réseau.
    poser("NEXT_PUBLIC_SITE_URL", "http://droplink.fr");
    expect(origineConfiguree()).toBeNull();
    poser("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(origineConfiguree()).toBe("http://localhost:3000");
  });

  test("une valeur qui n'est pas une URL est refusée, pas concaténée", () => {
    for (const faux of ["droplink.fr", "javascript:alert(1)", "   ", "à-remplir"]) {
      poser("NEXT_PUBLIC_SITE_URL", faux);
      expect(origineConfiguree(), faux).toBeNull();
    }
  });

  test("⚠️ EN PRODUCTION, L'ADRESSE N'EST JAMAIS DÉDUITE D'UN EN-TÊTE DE REQUÊTE", async () => {
    /*
     * LE CONTRÔLE DISCRIMINANT DE CE BLOC — c'est une faille connue, qui porte un
     * nom : l'empoisonnement de lien par l'en-tête Host.
     *
     * L'adresse du site sert à fabriquer le lien de RÉINITIALISATION DE MOT DE
     * PASSE. Si elle manque en production et qu'on la devinait depuis la requête,
     * un attaquant qui demande « mot de passe oublié » pour la victime en posant
     * `Host: pirate.net` ferait partir, dans la boîte de la victime, un lien
     * authentique… vers son propre serveur. Un clic, et le jeton de
     * réinitialisation lui appartient. Le compte avec.
     */
    poser("NEXT_PUBLIC_SITE_URL", undefined);
    poser("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    entetes = { host: "pirate.net", origin: "https://pirate.net", "x-forwarded-proto": "https" };
    expect(await origineDuSite()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("NEXT_PUBLIC_SITE_URL"));
  });

  test("CONTRE-TEST : en production, l'adresse configurée l'emporte sur tout en-tête", async () => {
    poser("NEXT_PUBLIC_SITE_URL", "https://droplink.fr");
    poser("NODE_ENV", "production");
    entetes = { host: "pirate.net", origin: "https://pirate.net" };
    expect(await origineDuSite()).toBe("https://droplink.fr");
  });

  test("en développement seulement, l'en-tête sert de repli", async () => {
    poser("NEXT_PUBLIC_SITE_URL", undefined);
    poser("NODE_ENV", "development");
    entetes = { host: "localhost:3000" };
    expect(await origineDuSite()).toBe("http://localhost:3000");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'adresse de signalement d'abus", () => {
  test("CONTRE-TEST : une vraie adresse est rendue, et le signalement est ouvert", () => {
    poser("NEXT_PUBLIC_CONTACT_ABUS", "abus@droplink.fr");
    expect(adresseAbus()).toBe("abus@droplink.fr");
    expect(signalementDisponible()).toBe(true);
  });

  test("⚠️ UN GABARIT RESTÉ EN PLACE N'EST PAS UNE ADRESSE", () => {
    /*
     * C'est l'obligation d'hébergeur : un moyen de signaler un contenu. Afficher
     * « votre-adresse@exemple.fr » sur la page de signalement serait pire que ne
     * rien afficher — le signalement partirait dans le vide, et la page
     * affirmerait le contraire.
     */
    for (const gabarit of [
      "votre-adresse@exemple.fr",
      "your-email@example.com",
      "<contact@droplink.fr>",
      "changeme@droplink.fr",
      "TODO",
    ]) {
      poser("NEXT_PUBLIC_CONTACT_ABUS", gabarit);
      expect(adresseAbus(), gabarit).toBeNull();
    }
    expect(signalementDisponible()).toBe(false);
  });

  test("une chaîne qui n'a pas la forme d'une adresse est refusée", () => {
    for (const faux of ["abus", "abus@", "@droplink.fr", "abus@droplink", "a b@droplink.fr", ""]) {
      poser("NEXT_PUBLIC_CONTACT_ABUS", faux);
      expect(adresseAbus(), faux).toBeNull();
    }
    poser("NEXT_PUBLIC_CONTACT_ABUS", undefined);
    expect(adresseAbus()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Le fournisseur d'identité externe", () => {
  test("Google ne s'allume que sur « 1 », exactement", () => {
    poser("AUTH_GOOGLE_ACTIF", "1");
    expect(fournisseurActif("google")).toBe(true);
    expect(fournisseursActifs()).toEqual(["google"]);
  });

  test("⚠️ « true », « yes », « 0 », vide ou absent : ÉTEINT", () => {
    // Un bouton « Continuer avec Google » affiché alors que le fournisseur n'est
    // pas configuré chez Supabase mène à une erreur au moment où un vendeur
    // essaie de s'inscrire — c'est-à-dire au pire moment.
    for (const valeur of ["true", "yes", "0", "", " ", "10", undefined]) {
      poser("AUTH_GOOGLE_ACTIF", valeur);
      expect(fournisseurActif("google"), String(valeur)).toBe(false);
    }
    expect(fournisseursActifs()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Les adresses alternatives (canonique et hreflang)", () => {
  test("chaque page se cite ELLE-MÊME, cite les trois langues ET le x-default", () => {
    // Sans auto-référence, Google ignore TOUT le jeu hreflang de la page.
    poser("NEXT_PUBLIC_SITE_URL", "https://droplink.fr");
    const alt = alternatesDe("en", "/docs");
    expect(alt?.canonical).toBe("https://droplink.fr/en/docs");
    expect(alt?.languages).toEqual({
      fr: "https://droplink.fr/fr/docs",
      en: "https://droplink.fr/en/docs",
      "zh-CN": "https://droplink.fr/zh-CN/docs",
      "x-default": "https://droplink.fr/fr/docs",
    });
  });

  test("⚠️ SANS ADRESSE CONFIGURÉE, AUCUNE CANONIQUE — plutôt qu'une canonique relative", () => {
    // Une canonique « /fr/docs » sans origine se résout contre l'adresse de la
    // requête : derrière le proxy, c'est celle du conteneur (défaut du 08/09).
    poser("NEXT_PUBLIC_SITE_URL", undefined);
    expect(alternatesDe("fr", "/docs")).toBeUndefined();
    expect(alternatesUneSeuleLangue("fr", "/blog")).toBeUndefined();
  });

  test("une page en une seule langue ne prétend pas en avoir trois", () => {
    // Le blog n'existe qu'en français : annoncer une version anglaise enverrait
    // Google sur un 404 voulu.
    poser("NEXT_PUBLIC_SITE_URL", "https://droplink.fr");
    const alt = alternatesUneSeuleLangue("fr", "/blog");
    expect(Object.keys(alt?.languages ?? {}).sort()).toEqual(["fr", "x-default"]);
  });
});
