import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

/**
 * LES DERNIERS MODULES DE `src/lib/` QU'AUCUN TEST N'APPELAIT — 23/09/2026.
 *
 * Leurs exceptions de couverture disaient « atteint par la fumée ». Atteindre une
 * page ne prouve pas que le module fait ce qu'il doit : la réinitialisation de
 * mot de passe peut s'ouvrir à une session qui n'est pas venue par e-mail, un
 * libellé d'aperçu peut manquer dans une langue, et la page rend quand même.
 */

// ── Les dépendances de requête, substituées ─────────────────────────────────

let adresse: string | null = "198.51.100.23"; // plage de documentation, RFC 5737
vi.mock("@/lib/limitation/empreinte", async () => {
  const vraie = await vi.importActual<typeof import("@/lib/limitation/empreinte")>(
    "@/lib/limitation/empreinte",
  );
  return { ...vraie, adresseAppelant: async () => adresse };
});

/*
 * `getTranslations` n'existe que dans le rendu de Next. Le substitut lit les
 * VRAIS catalogues et LÈVE sur une clé absente — comme next-intl en production —
 * pour que la question posée soit bien « la clé existe-t-elle dans les trois
 * langues ? ».
 */
function catalogue(langue: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", langue + ".json"), "utf8")) as Record<
    string,
    unknown
  >;
}
function lire(racine: unknown, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], racine);
}
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const espace = lire(catalogue(locale), namespace);
    const t = (cle: string): string => {
      const v = lire(espace, cle);
      if (typeof v !== "string") throw new Error(`clé absente : ${locale}/${namespace}.${cle}`);
      return v;
    };
    t.raw = t;
    return t;
  },
}));

process.env["HASH_SALT"] = "sel-de-test-pour-l-empreinte";

const { sessionParEmail } = await import("@/lib/auth/recuperation");
const { empreinteAdmin } = await import("@/lib/audit/empreinte-admin");
const { tousLesLibellesApercu } = await import("@/lib/boutique/libelles-apercu");
const { tousLesArticles, articleParSlug, slugs, estLangueDuBlog } = await import("@/lib/blog/articles");
const { donneesArticle, donneesStructurees } = await import("@/lib/seo/donnees-structurees");

const SAUVE = { ...process.env };
afterEach(() => {
  Object.assign(process.env, SAUVE);
  adresse = "198.51.100.23";
});

// ─────────────────────────────────────────────────────────────────────────────

type ClientAuth = Parameters<typeof sessionParEmail>[0];
function clientAvecMethodes(methodes: unknown[], erreur: unknown = null): ClientAuth {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: erreur === null ? { currentAuthenticationMethods: methodes } : null,
          error: erreur,
        }),
      },
    },
  } as unknown as ClientAuth;
}

describe("La réinitialisation du mot de passe", () => {
  test("CONTRE-TEST : une session ouverte par le lien reçu par e-mail est reconnue", async () => {
    expect(await sessionParEmail(clientAvecMethodes([{ method: "otp", timestamp: 1 }]))).toBe(true);
    expect(await sessionParEmail(clientAvecMethodes(["otp"]))).toBe(true);
  });

  test("⚠️ UNE SESSION OUVERTE PAR MOT DE PASSE NE PEUT PAS CHANGER LE MOT DE PASSE ICI", async () => {
    // Sinon un cookie volé suffirait à changer le mot de passe sans connaître
    // l'ancien : l'écran de réinitialisation ne demande pas l'actuel.
    expect(await sessionParEmail(clientAvecMethodes([{ method: "password", timestamp: 1 }]))).toBe(false);
    expect(await sessionParEmail(clientAvecMethodes(["oauth", "totp"]))).toBe(false);
    expect(await sessionParEmail(clientAvecMethodes([]))).toBe(false);
  });

  test("une lecture en erreur REFUSE", async () => {
    expect(await sessionParEmail(clientAvecMethodes([], { message: "panne" }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'empreinte de l'administrateur au journal d'audit", () => {
  test("⚠️ L'ADRESSE IP N'EST JAMAIS ÉCRITE EN CLAIR", async () => {
    const e = await empreinteAdmin();
    expect(e).not.toContain("198.51.100.23");
    expect(e).toMatch(/^[0-9a-f]{32}$/);
  });

  test("deux adresses différentes donnent deux empreintes — sinon l'audit ne distinguerait personne", async () => {
    const a = await empreinteAdmin();
    adresse = "198.51.100.24";
    expect(await empreinteAdmin()).not.toBe(a);
  });

  test("sans adresse lisible, rien plutôt qu'une empreinte inventée", async () => {
    adresse = null;
    expect(await empreinteAdmin()).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Les libellés de l'aperçu de la page client", () => {
  test("⚠️ LES SIX LIBELLÉS EXISTENT DANS LES TROIS LANGUES, et aucun n'est vide", async () => {
    // Une clé manquante dans une langue faisait lever le rendu de l'aperçu pour
    // tous les vendeurs de cette langue.
    const tous = await tousLesLibellesApercu();
    expect(Object.keys(tous).sort()).toEqual(["en", "fr", "zh-CN"]);
    for (const [langue, libelles] of Object.entries(tous)) {
      for (const [cle, valeur] of Object.entries(libelles)) {
        expect(String(valeur).trim(), `${langue}.${cle}`).not.toBe("");
      }
    }
  });

  test("les trois langues ne rendent pas le même texte — l'aperçu suit la langue du client", async () => {
    const tous = await tousLesLibellesApercu();
    expect(new Set(Object.values(tous).map((l) => l.approuver)).size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Le registre du blog", () => {
  test("chaque slug est unique et sûr dans une URL", () => {
    const tous = slugs();
    expect(tous.length).toBeGreaterThanOrEqual(5);
    expect(new Set(tous).size).toBe(tous.length);
    for (const s of tous) expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  test("les articles sont rendus du plus récent au plus ancien, à des dates réelles", () => {
    const dates = tousLesArticles().map((a) => a.date);
    for (const d of dates) expect(Number.isNaN(Date.parse(d)), d).toBe(false);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  test("un slug inconnu ou hostile ne rend aucun article", () => {
    for (const s of ["", "inexistant", "../../etc/passwd", slugs()[0] + "/"]) {
      expect(articleParSlug(s), s).toBeNull();
    }
    expect(articleParSlug(slugs()[0] ?? "")).not.toBeNull();
  });

  test("le blog n'existe qu'en français", () => {
    expect(estLangueDuBlog("fr")).toBe(true);
    expect(estLangueDuBlog("en")).toBe(false);
    expect(estLangueDuBlog("zh-CN")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Les données structurées", () => {
  test("sans adresse de site, aucune donnée plutôt qu'une URL relative", () => {
    delete process.env["NEXT_PUBLIC_SITE_URL"];
    expect(donneesStructurees("fr", { nom: "DropLink", description: "d" })).toBeNull();
    expect(donneesArticle("fr", { slug: "a", titre: "t", description: "d", date: "2026-09-01" })).toBeNull();
  });

  test("CONTRE-TEST : l'article porte son URL absolue, sa langue et sa date", () => {
    process.env["NEXT_PUBLIC_SITE_URL"] = "https://droplink.fr";
    const premier = tousLesArticles()[0];
    if (premier === undefined) throw new Error("aucun article");
    const d = donneesArticle("fr", premier);
    expect(d?.["@id"]).toBe(`https://droplink.fr/fr/blog/${premier.slug}`);
    expect(d?.["inLanguage"]).toBe("fr");
    expect(d?.["datePublished"]).toBe(premier.date);
  });

  test("le graphe du site cite la langue de la page EN PREMIER, puis les deux autres", () => {
    process.env["NEXT_PUBLIC_SITE_URL"] = "https://droplink.fr";
    const g = donneesStructurees("en", { nom: "DropLink", description: "d" }) as {
      "@graph": { "@type": string; inLanguage?: unknown }[];
    };
    const site = g["@graph"].find((n) => n["@type"] === "WebSite");
    expect(site?.inLanguage).toEqual(["en", "fr", "zh-CN"]);
  });
});
