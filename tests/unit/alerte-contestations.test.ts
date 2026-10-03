import { describe, expect, test, vi } from "vitest";
import { lireAlerteContestations } from "@/lib/audit/contestation";

/**
 * L'ALERTE DES CONTESTATIONS DE LA VUE D'ENSEMBLE (migration 213, décision de Mehdi du
 * 03/10/2026). TROIS états, et le défaut à craindre est silencieux : une lecture en panne
 * qui se dirait « aucune » ferait disparaître l'alerte précisément quand on en a besoin.
 * Le refus réel d'un non-administrateur est éprouvé sur la base, dans `tests/rls/contestation`.
 */
type Client = Parameters<typeof lireAlerteContestations>[0];
const client = (reponse: { data: unknown; error: { message: string } | null }): Client =>
  ({ rpc: async () => reponse }) as unknown as Client;

describe("lireAlerteContestations", () => {
  test("des dossiers en attente : le nombre, la référence et la date de la plus ancienne", async () => {
    const r = await lireAlerteContestations(
      client({ data: [{ en_attente: 3, plus_ancienne_ref: "#A1B2C3", plus_ancienne_le: "2026-10-01T08:00:00Z" }], error: null }),
    );
    expect(r).toEqual({ statut: "ok", nombre: 3, reference: "#A1B2C3", envoyeeLe: "2026-10-01T08:00:00Z" });
  });

  test("CONTRE-TEST : aucune en attente se dit « aucune »", async () => {
    const r = await lireAlerteContestations(client({ data: [{ en_attente: 0, plus_ancienne_ref: null, plus_ancienne_le: null }], error: null }));
    expect(r).toEqual({ statut: "aucune" });
  });

  test("une erreur, un refus ou une réponse hors forme se disent « illisible », jamais « aucune »", async () => {
    const bruit = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const reponse of [
      { data: null, error: { message: "introuvable" } },
      { data: [], error: null },
      { data: [{ en_attente: "beaucoup" }], error: null },
      // Un nombre sans sa plus ancienne contredit la base : rien n'est inventé.
      { data: [{ en_attente: 2, plus_ancienne_ref: null, plus_ancienne_le: null }], error: null },
    ]) {
      bruit.mockClear();
      expect(await lireAlerteContestations(client(reponse))).toEqual({ statut: "illisible" });
      // Chaque chemin « illisible » laisse sa trace au serveur, pas seulement l'un d'eux.
      expect(bruit).toHaveBeenCalledTimes(1);
    }
    bruit.mockRestore();
  });
});
