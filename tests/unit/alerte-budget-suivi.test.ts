import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import type { CarteDiscord } from "@/lib/alerte/discord";
import type { QuotaPort } from "@/lib/tracking/provider/port";

/**
 * L'ANNONCE D'UNE UNITÉ DE SUIVI DÉPENSÉE (`lib/alerte/budget-suivi.ts`).
 *
 * ⚠️ CE FICHIER N'ÉTAIT QU'IMPORTÉ PAR LES SUITES, JAMAIS APPELÉ — trouvé par
 * l'audit ECC du 24/09/2026. Il porte le seul signal qui dit que les 200 prises
 * en charge À VIE se vident.
 *
 * ⚠️ ET LE SIGNAL MENTAIT (30/09/2026, signalé par Mehdi) : « 197 restantes sur
 * 200 (3 utilisées) » quand 17TRACK en comptait 190. Le nombre venait de NOTRE
 * base, qui compte les lignes qu'elle a gardées, pas les unités payées. Il vient
 * désormais du FOURNISSEUR ; notre base n'est plus qu'un repli, et le message dit
 * alors qu'il s'agit d'une estimation.
 *
 * Ses règles, éprouvées par l'effet : il ne lève jamais, il n'annonce aucun
 * nombre qu'il n'a pas lu, il dit d'où vient le nombre, et une configuration
 * absente se dit UNE fois.
 */

type Issue =
  | { statut: "envoye"; id: string }
  | { statut: "non_configure"; manquant: string[] }
  | { statut: "refuse"; motif: string };
const cartes: CarteDiscord[] = [];
let issue: Issue = { statut: "envoye", id: "1" };
vi.mock("@/lib/alerte/discord", () => ({
  publierCarteDiscord: async (c: CarteDiscord) => {
    cartes.push(c);
    return issue;
  },
}));

const { annoncerBudgetDeSuivi, reinitialiserAnnonceBudget } = await import("@/lib/alerte/budget-suivi");

function systeme(reponse: { data: unknown; error: { message: string } | null }): SupabaseClient<Database> {
  return { rpc: async () => reponse } as unknown as SupabaseClient<Database>;
}

/** Ce que NOTRE base croit : c'est le chiffre faux que Mehdi a reçu. */
const BASE = { data: [{ utilisees: 3, total: 200, restantes: 197 }], error: null };
const BASE_ILLISIBLE = { data: null, error: { message: "coupure" } };

const fournisseur = (q: QuotaPort | (() => Promise<QuotaPort>)) => ({
  nom: "17track",
  lireQuota: typeof q === "function" ? q : async () => q,
});
const LU: QuotaPort = { statut: "ok", total: 200, utilisees: 10, restantes: 190, aujourdhui: 1 };
const INJOIGNABLE: QuotaPort = { statut: "indisponible", motif: "reseau" };

/** Tout le texte visible de la carte, pour chercher un nombre où qu'il soit rendu. */
const texte = (c: CarteDiscord | undefined): string =>
  c === undefined ? "" : [c.titre, c.description, c.pied, ...c.champs.flatMap((f) => [f.nom, f.valeur])].join("\n");
const champ = (c: CarteDiscord | undefined, nom: string): string =>
  c?.champs.find((f) => f.nom === nom)?.valeur ?? "";

let erreurs: string[] = [];
let avertissements: string[] = [];

beforeEach(() => {
  cartes.length = 0;
  issue = { statut: "envoye", id: "1" };
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
  test("⚠️ LE NOMBRE EST CELUI DU FOURNISSEUR, pas celui de notre base", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE), "6A0712345678", fournisseur(LU));

    expect(cartes).toHaveLength(1);
    expect(champ(cartes[0], "Restantes")).toContain("190");
    expect(champ(cartes[0], "Utilisées")).toContain("10");
    expect(champ(cartes[0], "Palier")).toContain("200");
    // Le chiffre faux reçu par Mehdi ne doit apparaître nulle part.
    expect(texte(cartes[0])).not.toContain("197");
    expect(cartes[0]?.pied).toContain("17TRACK");
  });

  test("la carte dit ce qui a été dépensé AUJOURD'HUI quand le fournisseur le donne", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE), "6A07", fournisseur({ ...LU, aujourdhui: 4 }));
    expect(champ(cartes[0], "Aujourd'hui")).toContain("4");

    await annoncerBudgetDeSuivi(systeme(BASE), "6A07", fournisseur({ ...LU, aujourdhui: null }));
    expect(cartes[1]?.champs.some((f) => f.nom === "Aujourd'hui")).toBe(false);
  });

  test("⚠️ LE NUMÉRO DU CLIENT N'EST JAMAIS ÉCRIT EN ENTIER", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE), "LX123456789FR", fournisseur(LU));
    expect(texte(cartes[0])).toContain("LX12…");
    expect(texte(cartes[0])).not.toContain("LX123456789FR");
  });

  test("la couleur et la jauge suivent ce qui RESTE", async () => {
    for (const restantes of [190, 60, 15]) {
      await annoncerBudgetDeSuivi(
        systeme(BASE),
        "6A07",
        fournisseur({ ...LU, restantes, utilisees: 200 - restantes }),
      );
    }
    const [large, moyen, bas] = cartes;
    // Vert, orange, rouge : les couleurs d'aplat du design system.
    expect([large?.couleur, moyen?.couleur, bas?.couleur]).toEqual([0x12a87a, 0xe08a18, 0xef4b57]);
    expect(champ(large, "Jauge")).toContain("95 %");
    expect(champ(bas, "Jauge")).toContain("8 %");
  });

  test("FOURNISSEUR INJOIGNABLE : notre base sert de repli, et la carte le DIT", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE), "6A07", fournisseur(INJOIGNABLE));

    expect(cartes).toHaveLength(1);
    expect(champ(cartes[0], "Restantes")).toContain("197");
    // Un nombre de repli présenté comme le solde serait l'erreur d'origine.
    expect(texte(cartes[0]).toLowerCase()).toContain("estimation");
    expect(texte(cartes[0])).toContain("reseau");
  });

  test("un fournisseur qui LÈVE est un fournisseur injoignable, pas une annonce perdue", async () => {
    await annoncerBudgetDeSuivi(
      systeme(BASE),
      "6A07",
      fournisseur(() => Promise.reject(new Error("boum"))),
    );
    expect(cartes).toHaveLength(1);
    expect(texte(cartes[0]).toLowerCase()).toContain("estimation");
  });

  test("⚠️ RIEN DE LISIBLE, RIEN N'EST ANNONCÉ — l'échec est nommé", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE_ILLISIBLE), "LX1", fournisseur(INJOIGNABLE));
    await annoncerBudgetDeSuivi(systeme({ data: [], error: null }), "LX1", fournisseur(INJOIGNABLE));
    expect(cartes).toHaveLength(0);
    expect(erreurs).toHaveLength(2);
  });

  test("CONTRE-TEST : notre base illisible n'empêche pas le solde du fournisseur", async () => {
    await annoncerBudgetDeSuivi(systeme(BASE_ILLISIBLE), "LX1", fournisseur(LU));
    expect(champ(cartes[0], "Restantes")).toContain("190");
  });

  test("⚠️ UNE CONFIGURATION ABSENTE SE DIT UNE FOIS, PAS À CHAQUE COLIS", async () => {
    issue = { statut: "non_configure", manquant: ["DISCORD_WEBHOOK_URL"] };
    await annoncerBudgetDeSuivi(systeme(BASE), "LX1", fournisseur(LU));
    await annoncerBudgetDeSuivi(systeme(BASE), "LX2", fournisseur(LU));
    expect(avertissements).toHaveLength(1);
    expect(avertissements[0]).toContain("DISCORD_WEBHOOK_URL");
    expect(avertissements[0]).toContain("190");
  });

  test("un refus de Discord est nommé — une alerte perdue en silence est le défaut visé", async () => {
    issue = { statut: "refuse", motif: "HTTP 404" };
    await annoncerBudgetDeSuivi(systeme(BASE), "LX1", fournisseur(LU));
    expect(erreurs.some((e) => e.includes("HTTP 404"))).toBe(true);
  });

  test("un fournisseur qui lève de façon SYNCHRONE ne la fait pas lever non plus", async () => {
    const synchrone = {
      nom: "17track",
      lireQuota: (): Promise<QuotaPort> => {
        throw new Error("double incomplet");
      },
    };
    await expect(annoncerBudgetDeSuivi(systeme(BASE), "6A07", synchrone)).resolves.toBeUndefined();
    expect(texte(cartes[0]).toLowerCase()).toContain("estimation");
  });

  test("⚠️ ELLE NE LÈVE JAMAIS — la dépense a déjà eu lieu", async () => {
    issue = { statut: "refuse", motif: "x" };
    await expect(
      annoncerBudgetDeSuivi(systeme(BASE_ILLISIBLE), "LX1", fournisseur(() => Promise.reject(new Error("x")))),
    ).resolves.toBeUndefined();
    await expect(annoncerBudgetDeSuivi(systeme(BASE), "LX1", fournisseur(LU))).resolves.toBeUndefined();
  });
});
