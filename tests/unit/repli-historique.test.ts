import { describe, expect, test } from "vitest";
import { HISTORIQUE_SEUIL, HISTORIQUE_VISIBLES, replierHistorique } from "@/lib/page-publique/repli-historique";

/**
 * L'HISTORIQUE LONG SE REPLIE (26/09/2026, demande de Wassim : « c'est moche que
 * l'on voie toute la liste de l'historique du suivi débordée comme ça »).
 *
 * La règle tient en une fonction, testée seule : au-delà de SIX étapes, la page
 * montre les CINQ plus récentes et garde le reste pour « Voir tout ». À six ou
 * moins, rien n'est caché — un bouton pour révéler une seule ligne coûterait
 * plus de place qu'il n'en fait gagner.
 */
const etapes = (n: number): string[] => Array.from({ length: n }, (_, i) => `étape ${i + 1}`);

describe("replierHistorique", () => {
  test("la règle vaut ce que la planche dessine : seuil 6, cinq visibles", () => {
    expect(HISTORIQUE_SEUIL).toBe(6);
    expect(HISTORIQUE_VISIBLES).toBe(5);
  });

  test("six étapes ou moins : tout est montré, rien n'est replié", () => {
    for (const n of [0, 1, 5, 6]) {
      const r = replierHistorique(etapes(n));
      expect(r.visibles, `${n} étapes`).toEqual(etapes(n));
      expect(r.reste, `${n} étapes`).toEqual([]);
    }
  });

  test("au-delà de six : les cinq PREMIÈRES (les plus récentes) sont visibles, le reste est replié, dans l'ordre", () => {
    const toutes = etapes(9);
    const r = replierHistorique(toutes);
    expect(r.visibles).toEqual(toutes.slice(0, 5));
    expect(r.reste).toEqual(toutes.slice(5));
  });

  test("CONTRE-TEST : rien n'est perdu ni dupliqué dans la découpe", () => {
    for (const n of [7, 12, 30]) {
      const toutes = etapes(n);
      const r = replierHistorique(toutes);
      expect([...r.visibles, ...r.reste], `${n} étapes`).toEqual(toutes);
    }
  });
});
