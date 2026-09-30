import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LA PRISE EN CHARGE ANNONCE CE QU'ELLE A PAYÉ — ET SEULEMENT APRÈS L'AVOIR PAYÉ.
 *
 * Audit ECC du 30/09/2026. `annoncerBudgetDeSuivi` était testée seule ; rien ne
 * vérifiait que `prendreEnCharge` l'appelle, quand, et avec quel fournisseur. Un
 * appel retiré, avancé avant le paiement ou posé sur un refus serait passé.
 *
 * Et l'ORDRE compte : l'annonce lit le solde chez le fournisseur puis poste sur
 * Discord — jusqu'à 22 secondes bornées. Posée AVANT l'interrogation, elle
 * retardait d'autant l'état du colis à l'écran du vendeur, et chaque colis d'une
 * passe de la cadence (boucle en série). Elle vient donc EN DERNIER.
 */

const etapes: string[] = [];
let rpc: Record<string, { data: unknown; error: { message: string } | null }> = {};
let inscription: { statut: string; motif?: string } = { statut: "vide" };
const annonces: unknown[][] = [];

vi.mock("@/lib/supabase/system", () => ({
  creerClientSysteme: () => ({
    rpc: async (nom: string) => {
      etapes.push("rpc:" + nom);
      return rpc[nom] ?? { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/tracking/provider/dix-sept-track", () => ({
  dixSeptTrack: {
    prendreEnCharge: async () => {
      etapes.push("payer");
      return inscription;
    },
    interroger: async () => {
      etapes.push("interroger");
      return { statut: "vide", brut: null };
    },
  },
}));
vi.mock("@/lib/tracking/ingestion", () => ({
  ingererEtat: async () => {
    etapes.push("ingerer");
    return { statut: "rien" };
  },
}));
vi.mock("@/lib/alerte/budget-suivi", () => ({
  annoncerBudgetDeSuivi: async (...a: unknown[]) => {
    etapes.push("annoncer");
    annonces.push(a);
  },
}));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre: async () => true }));

const { prendreEnCharge } = await import("@/lib/tracking/prise-en-charge");

beforeEach(() => {
  etapes.length = 0;
  annonces.length = 0;
  inscription = { statut: "vide" };
  rpc = { lire_suivi_actif: { data: true, error: null }, colis_a_inscrire: { data: true, error: null } };
});

describe("L'annonce de la dépense", () => {
  test("CONTRE-TEST : une prise en charge payée est annoncée, APRÈS l'état du colis", async () => {
    await prendreEnCharge("parcel-1", "LX123456789FR", null);

    expect(annonces).toHaveLength(1);
    const i = (e: string) => etapes.indexOf(e);
    expect(i("payer")).toBeLessThan(i("annoncer"));
    expect(i("rpc:marquer_prise_en_charge")).toBeLessThan(i("annoncer"));
    // L'état du colis d'abord : c'est ce que le vendeur attend à l'écran.
    expect(i("ingerer")).toBeLessThan(i("annoncer"));
    // Deux arguments : le fournisseur RÉEL est celui par défaut, jamais un double.
    expect(annonces[0]).toHaveLength(2);
    expect(annonces[0]?.[1]).toBe("LX123456789FR");
  });

  test.each([
    ["un refus du fournisseur", () => (inscription = { statut: "refuse", motif: "numero-invalide" })],
    ["un fournisseur indisponible", () => (inscription = { statut: "indisponible", motif: "reseau" })],
    ["un numéro encore instable", () => (rpc["colis_a_inscrire"] = { data: false, error: null })],
    ["l'interrupteur coupé", () => (rpc["lire_suivi_actif"] = { data: false, error: null })],
  ])("⚠️ %s : AUCUNE annonce — rien n'a été dépensé", async (_cas, regler) => {
    regler();
    await prendreEnCharge("parcel-1", "LX123456789FR", null);
    expect(annonces).toHaveLength(0);
  });
});
