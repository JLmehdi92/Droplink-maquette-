import { describe, expect, test } from "vitest";
import { lireCompte } from "@/lib/audit/comptes";

/**
 * LA JAUGE DU QUOTA NE DIT RIEN PLUTÔT QUE « NaN » — relecture ECC du 27/09/2026.
 *
 * Tant que la migration 200 n'est pas appliquée, `lire_compte_admin` répond SANS
 * ses colonnes de quota : l'ancienne fonction est remplacée, pas absente, donc
 * aucune erreur. `Number(undefined)` faisait alors afficher « NaN sur NaN » et une
 * barre de largeur `NaN%`, sans une trace. Le lecteur rend `null`, et l'écran
 * n'affiche pas la jauge.
 */

const LIGNE_COMMUNE = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "vendeur@exemple.invalid",
  account_type: "reseller",
  role: "user",
  status: "active",
  locale: "fr",
  created_at: "2026-09-27T00:00:00Z",
  boutique_id: null,
  boutique_nom: "Boutique",
  accent_color: null,
  watermark_enabled: false,
  reseaux: [],
  commandes: 4,
  colis_ce_mois: 1,
  medias: 0,
  stockage_octets: 0,
  evenements: [],
};

function clientRendant(ligne: Record<string, unknown>) {
  return { rpc: async () => ({ data: [ligne], error: null }) } as unknown as Parameters<typeof lireCompte>[0];
}

describe("lireCompte : le quota de commandes", () => {
  test("une base SANS la migration 200 ne fait pas afficher de NaN : la jauge est omise", async () => {
    const fiche = await lireCompte(clientRendant(LIGNE_COMMUNE), LIGNE_COMMUNE.id, "ip");
    expect(fiche?.quotaCommandes).toBeNull();
  });

  test("CONTRE-TEST : une base à jour rend le quota du plan", async () => {
    const fiche = await lireCompte(
      clientRendant({ ...LIGNE_COMMUNE, plan: "gratuit", quota_commandes: 12, quota_commandes_plafond: 15 }),
      LIGNE_COMMUNE.id,
      "ip",
    );
    expect(fiche?.quotaCommandes).toEqual({ utilise: 12, plafond: 15 });
    expect(fiche?.plan).toBe("gratuit");
  });

  test("un plan inconnu ou un nombre nul n'est pas pris pour un quota", async () => {
    for (const ligne of [
      { ...LIGNE_COMMUNE, plan: "inconnu", quota_commandes: 1, quota_commandes_plafond: 15 },
      { ...LIGNE_COMMUNE, plan: "pro", quota_commandes: null, quota_commandes_plafond: 300 },
      { ...LIGNE_COMMUNE, plan: "pro", quota_commandes: 3, quota_commandes_plafond: null },
      // Chaque contrôle ISOLÉ : un seul champ manque, les deux autres sont valides —
      // sans quoi une condition voisine rattraperait le cas et en masquerait un retrait.
      { ...LIGNE_COMMUNE, plan: "pro", quota_commandes_plafond: 300 },
      { ...LIGNE_COMMUNE, plan: "pro", quota_commandes: 3 },
      { ...LIGNE_COMMUNE, quota_commandes: 3, quota_commandes_plafond: 300 },
    ]) {
      const fiche = await lireCompte(clientRendant(ligne), LIGNE_COMMUNE.id, "ip");
      expect(fiche?.quotaCommandes).toBeNull();
    }
  });
});
