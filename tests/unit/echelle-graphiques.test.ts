import { describe, expect, test } from "vitest";
import { createFormatter } from "next-intl";
import { echelle, jourCourt } from "@/components/admin/echelle";

/**
 * L'ÉCHELLE ET LES DATES DES GRAPHIQUES D'ADMINISTRATION.
 *
 * Deux défauts de la courbe de la vue d'ensemble, vus sur capture le
 * 14/09/2026 : des graduations à 2,5 et 7,5 écrites « 3 » et « 8 », et des mois
 * en français sur la page chinoise.
 */
describe("Les graduations", () => {
  test("elles sont TOUTES entières, quel que soit le maximum", () => {
    for (let maximum = 0; maximum <= 5_000; maximum += 1) {
      for (const intervalles of [2, 4]) {
        const { plafond, graduations } = echelle(maximum, intervalles);
        expect(plafond, `plafond sous le maximum pour ${maximum}`).toBeGreaterThanOrEqual(maximum);
        expect(
          graduations.every((g) => Number.isInteger(g)),
          `graduation fractionnaire pour ${maximum} en ${intervalles} : ${graduations.join(", ")}`,
        ).toBe(true);
      }
    }
  });

  test("LE CAS MOTIVANT : dix commandes ne se graduent plus à 2,5", () => {
    expect(echelle(10, 4).graduations).not.toContain(2.5);
  });

  test("le plafond reste proche du maximum : la courbe n'est pas écrasée", () => {
    // Quatre commandes sur un axe de 0 à 20 ne se liraient plus.
    expect(echelle(4, 4).plafond).toBe(4);
    expect(echelle(37, 4).plafond).toBe(40);
    expect(echelle(1_240, 2).plafond).toBe(2_000);
  });

  test("l'ordre va du plafond à zéro, comme on lit un axe de haut en bas", () => {
    expect(echelle(8, 4).graduations).toEqual([8, 6, 4, 2, 0]);
  });
});

describe("La date d'un repère", () => {
  const formateur = (locale: string, timeZone: string) => createFormatter({ locale, timeZone });

  test("elle est écrite dans la langue de la page", () => {
    expect(jourCourt(formateur("fr", "UTC"), "2026-09-13")).toBe("13 sept.");
    expect(jourCourt(formateur("zh-CN", "UTC"), "2026-09-13")).toContain("月");
    expect(jourCourt(formateur("en", "UTC"), "2026-09-13")).toMatch(/Sep/);
  });

  test("elle ne recule pas d'un jour dans un fuseau à l'ouest de Greenwich", () => {
    // Le jour rendu par la base est déjà résolu en UTC : relu à Los Angeles,
    // minuit UTC serait la veille au soir.
    expect(jourCourt(formateur("fr", "America/Los_Angeles"), "2026-09-13")).toBe("13 sept.");
  });
});
