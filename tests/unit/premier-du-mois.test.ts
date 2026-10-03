import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createFormatter } from "next-intl";
import { describe, expect, test } from "vitest";
import { avecPremierDuMois, premierDuMois } from "@/lib/format/premier-du-mois";

/**
 * « 1er » DANS LES DATES FRANÇAISES (passe de finition du 03/10/2026).
 * `Intl` écrit « 1 octobre » ; le produit doit écrire « 1er octobre », partout.
 */
describe("premierDuMois", () => {
  test("pose « 1er » devant un nom de mois, en français seulement", () => {
    expect(premierDuMois("fr", "1 octobre 2026")).toBe("1er octobre 2026");
    expect(premierDuMois("fr", "mardi 1 octobre à 14:05")).toBe("mardi 1er octobre à 14:05");
    expect(premierDuMois("fr", "1 sept. 2026, 14:05")).toBe("1er sept. 2026, 14:05");
    expect(premierDuMois("fr", "du 30 septembre au 1 octobre")).toBe("du 30 septembre au 1er octobre");
    expect(premierDuMois("fr", "1 août")).toBe("1er août");
    expect(premierDuMois("fr", "1 déc.")).toBe("1er déc.");
  });

  test("CONTRE-TESTS : ni 11, 21, 31, ni une date chiffrée, ni une autre langue, ni un nombre isolé", () => {
    for (const t of ["11 octobre", "21 octobre", "31 décembre", "01/10/2026", "1 commande", "1 234 octets", "10 oct."]) {
      expect(premierDuMois("fr", t)).toBe(t);
    }
    expect(premierDuMois("en", "1 October")).toBe("1 October");
    expect(premierDuMois("zh-CN", "10月1日")).toBe("10月1日");
  });

  test("le formateur enveloppé garde toutes ses autres méthodes", () => {
    const jour = new Date("2026-10-01T12:00:00Z");
    const fr = avecPremierDuMois("fr", createFormatter({ locale: "fr", timeZone: "UTC" }));
    expect(fr.dateTime(jour, { day: "numeric", month: "long", year: "numeric" })).toBe("1er octobre 2026");
    expect(fr.number(1248)).toBe(new Intl.NumberFormat("fr").format(1248));
    const en = avecPremierDuMois("en", createFormatter({ locale: "en", timeZone: "UTC" }));
    expect(en.dateTime(jour, { day: "numeric", month: "long" })).toBe("October 1");
  });

  test("la plage de dates pose « 1er » aussi (dateTimeRange)", () => {
    const fr = avecPremierDuMois("fr", createFormatter({ locale: "fr", timeZone: "UTC" }));
    const plage = fr.dateTimeRange(new Date("2026-05-01T12:00:00Z"), new Date("2026-06-01T12:00:00Z"), {
      day: "numeric",
      month: "long",
    });
    expect(plage).not.toMatch(/(^|\D)1 /u);
    expect(plage.match(/1er/gu)).toHaveLength(2);
  });
});

describe("Aucun écran ne formate une date sans passer par le formateur du produit", () => {
  test("getFormatter et useFormatter ne s'importent que dans src/lib/format/", () => {
    const fichiers: string[] = [];
    const parcourir = (d: string): void => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (/\.(ts|tsx)$/.test(e)) fichiers.push(p);
      }
    };
    parcourir(join(process.cwd(), "src"));
    // UN ENSEMBLE VIDE PASSE TOUT.
    expect(fichiers.length).toBeGreaterThan(100);
    const fautifs = fichiers.filter((f) => {
      if (f.split(/[\\/]/).includes("format") && f.includes(join("lib", "format"))) return false;
      const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return /\b(getFormatter|useFormatter)\b/.test(code);
    });
    expect(fautifs, "Ces fichiers formatent sans « 1er » : passer par getFormateur / useFormateur.").toEqual([]);
  });
});
