import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * L'ANNONCE D'UNE UNITÉ DE SUIVI DÉPENSÉE (`lib/alerte/budget-suivi.ts`).
 *
 * ⚠️ CE FICHIER N'ÉTAIT QU'IMPORTÉ PAR LES SUITES, JAMAIS APPELÉ — trouvé par
 * l'audit ECC du 24/09/2026. La porte « couverture » le comptait traversé parce
 * que son code de MODULE s'exécutait à l'import ; aucune de ses fonctions ne
 * l'avait jamais été. Or il porte le seul signal qui dit que les 200 prises en
 * charge À VIE se vident.
 *
 * Ses trois règles, éprouvées par l'effet : il ne lève jamais, il n'annonce
 * aucun nombre qu'il n'a pas lu, et une configuration absente se dit UNE fois.
 */

type Issue =
  | { statut: "envoye" }
  | { statut: "non_configure"; manquant: string[] }
  | { statut: "refuse"; motif: string };
const envoyes: { sujet: string; texte: string }[] = [];
let issue: Issue = { statut: "envoye" };
vi.mock("@/lib/alerte/discord", () => ({
  expediteurDiscord: () => ({
    envoyer: async (m: { sujet: string; texte: string }) => {
      envoyes.push(m);
      return issue;
    },
  }),
}));

const { annoncerBudgetDeSuivi, reinitialiserAnnonceBudget } = await import("@/lib/alerte/budget-suivi");

function systeme(reponse: { data: unknown; error: { message: string } | null }): SupabaseClient<Database> {
  return { rpc: async () => reponse } as unknown as SupabaseClient<Database>;
}

const ETAT = { data: [{ utilisees: 9, total: 200, restantes: 191 }], error: null };
let erreurs: string[] = [];
let avertissements: string[] = [];

beforeEach(() => {
  envoyes.length = 0;
  issue = { statut: "envoye" };
  erreurs = [];
  avertissements = [];
  reinitialiserAnnonceBudget();
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    erreurs.push(a.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
    avertissements.push(a.map(String).join(" "));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("L'annonce du budget de suivi", () => {
  test("CONTRE-TEST : l'état lu part sur Discord, avec les trois nombres", async () => {
    await annoncerBudgetDeSuivi(systeme(ETAT), "LX123456789FR");
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0]?.texte).toContain("191");
    expect(envoyes[0]?.texte).toContain("200");
    expect(envoyes[0]?.texte).toContain("9 utilisées");
  });

  test("⚠️ LE NUMÉRO DU CLIENT N'EST JAMAIS ÉCRIT EN ENTIER", async () => {
    await annoncerBudgetDeSuivi(systeme(ETAT), "LX123456789FR");
    expect(envoyes[0]?.texte).toContain("LX12…");
    expect(envoyes[0]?.texte).not.toContain("LX123456789FR");
  });

  test("⚠️ UN ÉTAT ILLISIBLE N'ANNONCE AUCUN NOMBRE — il est nommé, et rien ne part", async () => {
    await annoncerBudgetDeSuivi(systeme({ data: null, error: { message: "coupure" } }), "LX1");
    await annoncerBudgetDeSuivi(systeme({ data: [], error: null }), "LX1");
    expect(envoyes).toHaveLength(0);
    expect(erreurs).toHaveLength(2);
  });

  test("⚠️ UNE CONFIGURATION ABSENTE SE DIT UNE FOIS, PAS À CHAQUE COLIS", async () => {
    issue = { statut: "non_configure", manquant: ["DISCORD_WEBHOOK_URL"] };
    await annoncerBudgetDeSuivi(systeme(ETAT), "LX1");
    await annoncerBudgetDeSuivi(systeme(ETAT), "LX2");
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("DISCORD_WEBHOOK_URL");
    expect(avertissements[0]).toContain("191");
  });

  test("un refus de Discord est nommé — une alerte perdue en silence est le défaut visé", async () => {
    issue = { statut: "refuse", motif: "HTTP 404" };
    await annoncerBudgetDeSuivi(systeme(ETAT), "LX1");
    expect(erreurs.some((e) => e.includes("HTTP 404"))).toBe(true);
  });

  test("⚠️ ELLE NE LÈVE JAMAIS — la dépense a déjà eu lieu", async () => {
    issue = { statut: "refuse", motif: "x" };
    await expect(annoncerBudgetDeSuivi(systeme({ data: null, error: { message: "x" } }), "LX1")).resolves.toBeUndefined();
    await expect(annoncerBudgetDeSuivi(systeme(ETAT), "LX1")).resolves.toBeUndefined();
  });
});
