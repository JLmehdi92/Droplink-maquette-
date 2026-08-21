import { describe, expect, test } from "vitest";
import { mettreOctetsALEchelle } from "@/lib/format/octets";

/**
 * LA MISE À L'ÉCHELLE DES OCTETS.
 *
 * Ce que ces contrôles protègent n'est pas l'arrondi : c'est la BASE. Un
 * fournisseur de stockage facture en base 1000 ; afficher des Gio là où l'on
 * paye des Go ferait diverger l'écran de la facture d'environ 7 % — assez pour
 * faire douter du chiffre, trop peu pour qu'on voie d'où vient l'écart.
 */

describe("La base est 1000, celle des factures", () => {
  test("mille octets font un kilo-octet, pas 1024", () => {
    expect(mettreOctetsALEchelle(1_000)).toMatchObject({ valeur: 1, unite: "Ko" });
    // Le contre-test qui distingue les deux bases : en base 1024, 1 024 octets
    // vaudraient exactement 1 Ko. Ici ils en valent un peu plus.
    expect(mettreOctetsALEchelle(1_024).valeur).toBeCloseTo(1.024, 3);
  });

  test("chaque palier change d'unité", () => {
    expect(mettreOctetsALEchelle(999).unite).toBe("o");
    expect(mettreOctetsALEchelle(1_000).unite).toBe("Ko");
    expect(mettreOctetsALEchelle(1_000_000).unite).toBe("Mo");
    expect(mettreOctetsALEchelle(1_000_000_000).unite).toBe("Go");
    expect(mettreOctetsALEchelle(1_000_000_000_000).unite).toBe("To");
  });

  test("au-delà du téra-octet, l'unité ne déborde pas", () => {
    // Sans la borne, l'index sortirait du tableau et l'unité serait `undefined` —
    // ce qui, avec `noUncheckedIndexedAccess`, casserait au typage plutôt qu'à
    // l'écran, mais seulement si quelqu'un l'écrivait ainsi.
    expect(mettreOctetsALEchelle(5_000_000_000_000_000).unite).toBe("To");
  });
});

describe("Les décimales suivent ce que la décision demande", () => {
  test("aucune sous le méga-octet, une à partir du méga-octet", () => {
    expect(mettreOctetsALEchelle(4_200).decimales).toBe(0);
    expect(mettreOctetsALEchelle(4_200_000).decimales).toBe(1);
    // 1,2 Go et 1,9 Go, c'est exactement la distinction qu'on vient chercher.
    expect(mettreOctetsALEchelle(1_200_000_000).decimales).toBe(1);
  });
});

describe("Les valeurs impossibles sont bornées, pas propagées", () => {
  test("zéro, négatif et non fini rendent zéro octet", () => {
    // La colonne en base porte une contrainte `>= 0` : rien de tout cela ne peut
    // en venir. C'est borné ici quand même — une mise en forme qui compte sur la
    // validation d'une AUTRE couche disparaît le jour où cette couche change.
    for (const impossible of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(mettreOctetsALEchelle(impossible), `non borné : ${impossible}`).toEqual({
        valeur: 0,
        unite: "o",
        decimales: 0,
      });
    }
  });
});
