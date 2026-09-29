import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { documentLegal } from "@/components/page-legale";
import { PRIX_PRO_EUR } from "@/lib/paiement/plan";

/**
 * LES PAGES LÉGALES — conditions, confidentialité, mentions (29/09/2026).
 *
 * Leur texte vit dans les catalogues (`legal.pages`), lu d'un bloc et VALIDÉ par
 * `documentLegal`. Trois choses se prouvent ici, et aucune autre garde ne les voit :
 *
 *  1. LES TROIS DOCUMENTS SE LISENT DANS LES TROIS LANGUES. Un bloc mal formé
 *     lèverait au rendu, en production, sur un document qui engage.
 *  2. UN BLOC QUI CITE LA PAGE DE SIGNALEMENT DISPARAÎT QUAND ELLE N'EXISTE PAS
 *     (`si: "signalement"`). Le défaut du 31/08/2026 : les conditions citaient
 *     un formulaire injoignable. Le contre-test établit que le même bloc EST
 *     rendu quand le canal existe — sans lui, un filtre qui retire tout passerait.
 *  3. LE PRIX DU PRO VIENT DE `PRIX_PRO_EUR`, jamais d'une chaîne : le texte ne
 *     porte que `{prixPro}`, et un gabarit laissé sans valeur LÈVE.
 */

type Catalogue = { legal: { pages: Record<string, unknown> } };
const LANGUES = ["fr", "en", "zh-CN"] as const;
const SORTES = ["conditions", "confidentialite", "mentions"] as const;
const VALEURS = { prixPro: `${PRIX_PRO_EUR} €` };

function pages(langue: string): Record<string, unknown> {
  const brut = readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8");
  return (JSON.parse(brut) as Catalogue).legal.pages;
}

function lire(langue: string, sorte: string, signalable: boolean) {
  return documentLegal(pages(langue)[sorte], signalable, VALEURS);
}

function texte(doc: ReturnType<typeof documentLegal>): string {
  return JSON.stringify(doc.sections);
}

describe("Les trois documents légaux se lisent dans les trois langues", () => {
  for (const langue of LANGUES) {
    for (const sorte of SORTES) {
      test(`${langue} · ${sorte}`, () => {
        const doc = lire(langue, sorte, true);
        expect(doc.sections.length).toBeGreaterThan(0);
        // La même structure dans les trois langues : mêmes ancres, dans le même ordre.
        const reference = lire("fr", sorte, true);
        expect(doc.sections.map((s) => s.id)).toEqual(reference.sections.map((s) => s.id));
        expect(doc.sections.map((s) => s.blocs.length)).toEqual(reference.sections.map((s) => s.blocs.length));
      });
    }
  }

  test("un tableau dont une ligne n'a pas le compte de cellules est REFUSÉ", () => {
    const decale = { titre: "T", pastille: "P", chapeau: "C", sections: [{ id: "a", titre: "A", blocs: [{ table: { entetes: ["x", "y"], lignes: [["1"]] } }] }] };
    expect(() => documentLegal(decale, true, VALEURS)).toThrow(/cellules/);
  });

  test("un bloc mal formé est REFUSÉ, pas ignoré", () => {
    const casse = { titre: "T", pastille: "P", chapeau: "C", sections: [{ id: "a", titre: "A", blocs: [{ paragraphe: "x" }] }] };
    expect(() => documentLegal(casse, true, VALEURS)).toThrow();
  });
});

describe("La page de signalement n'est citée que si elle existe", () => {
  for (const langue of LANGUES) {
    test(`${langue} : canal fermé → aucun bloc conditionnel ; canal ouvert → ils reviennent`, () => {
      for (const sorte of ["conditions", "mentions"] as const) {
        const ferme = texte(lire(langue, sorte, false));
        const ouvert = texte(lire(langue, sorte, true));
        expect(ferme, `${sorte} garde un bloc conditionnel sans canal`).not.toContain('"si"');
        // CONTRE-TEST : le bloc existe bien, et le filtre ne retire QUE lui.
        expect(ouvert, `${sorte} n'a plus de bloc conditionnel à filtrer`).toContain('"si":"signalement"');
        expect(ouvert.length).toBeGreaterThan(ferme.length);
      }
    });
  }
});

describe("Le prix du Pro ne s'écrit qu'à un seul endroit", () => {
  for (const langue of LANGUES) {
    test(`${langue} : les conditions citent le prix de PRIX_PRO_EUR, et aucun gabarit ne reste`, () => {
      const conditions = texte(lire(langue, "conditions", true));
      expect(conditions).toContain(VALEURS.prixPro);
      expect(conditions, "un gabarit {…} est resté dans le texte rendu").not.toMatch(/\{\w+\}/);
    });
  }

  test("un gabarit sans valeur LÈVE au lieu de s'afficher", () => {
    expect(() => documentLegal(pages("fr")["conditions"], true, {})).toThrow(/prixPro/);
  });
});
