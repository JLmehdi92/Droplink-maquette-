import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PURGE_JOURS, detailsConstates, reglagesConstates } from "@/lib/audit/reglages-constates";

/**
 * LES RÉGLAGES QUE L'ADMINISTRATION CONSTATE SANS POUVOIR LES CHANGER
 * (`lib/audit/reglages-constates.ts`, écran « Paramètres » de l'admin).
 *
 * ⚠️ CE FICHIER N'ÉTAIT QU'IMPORTÉ PAR LES SUITES, JAMAIS APPELÉ — trouvé par
 * l'audit ECC du 24/09/2026. Un nombre faux sur cet écran serait lu comme la
 * règle du produit par celui qui décide.
 */

describe("Les réglages constatés", () => {
  const reglages = reglagesConstates();

  test("chacun porte une valeur réelle — un NaN ou un 0 se lirait comme une règle", () => {
    expect(reglages.length).toBeGreaterThanOrEqual(8);
    for (const r of reglages) {
      expect(Number.isFinite(r.valeur), r.id).toBe(true);
      expect(r.valeur, r.id).toBeGreaterThan(0);
    }
    for (const [cle, valeur] of Object.entries(detailsConstates())) {
      expect(Number.isFinite(valeur) && valeur > 0, cle).toBe(true);
    }
  });

  test("les identifiants sont uniques — ils servent de clé de rendu", () => {
    const ids = reglages.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("la durée de purge affichée est la constante surveillée contre la base", () => {
    expect(reglages.find((r) => r.id === "purge_jours")?.valeur).toBe(PURGE_JOURS);
  });

  test("⚠️ CHAQUE RÉGLAGE A SON LIBELLÉ DANS LES TROIS LANGUES — sans quoi l'écran lève", () => {
    for (const langue of ["fr", "en", "zh-CN"]) {
      const brut = readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8");
      for (const r of reglages) {
        expect(brut.includes(`"${r.id}"`), `${langue} : ${r.id}`).toBe(true);
      }
    }
  });
});
