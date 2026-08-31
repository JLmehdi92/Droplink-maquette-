import { describe, expect, test } from "vitest";
import { substituer } from "@/lib/format/gabarit";

/**
 * SUBSTITUER UN JETON SANS INTERPRÉTER LES MOTIFS DE `$`.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. Trois endroits employaient
 * `String.prototype.replace(jeton, valeur)` avec, pour valeur, du TEXTE LIBRE
 * écrit par le vendeur : `shops.name` n'est borné que par une longueur, et
 * `orders.customer_label` est un pseudo libre par décision produit.
 *
 * Or une chaîne de remplacement interprète `$&`, `` $` ``, `$'` et `$n` comme
 * des motifs de substitution. La phrase corrompue n'apparaît QUE sur la page du
 * client : le vendeur ne la verra jamais, et le client ne saura pas à qui le
 * dire.
 *
 * LES CAS DE CE FICHIER SONT LES QUATRE MOTIFS RÉELS, plus la double occurrence
 * — parce que `replace` ne substitue que la PREMIÈRE, donc une traduction
 * future portant deux fois le même jeton passerait la parité des catalogues et
 * rendrait un gabarit à moitié substitué.
 */
describe("La substitution de gabarit", () => {
  test("le cas ordinaire", () => {
    expect(substituer("Retrouvez {nom}", "{nom}", "Atelier Nord")).toBe("Retrouvez Atelier Nord");
  });

  test("les quatre motifs de `$` sont rendus tels quels", () => {
    // CONTRE-TEST DE LA SONDE ELLE-MÊME : `replace` échouerait sur chacun de ces
    // quatre cas. Sans eux, une implémentation revenue à `replace` passerait.
    expect(substituer("Retrouvez {nom}", "{nom}", "Rock $& Roll")).toBe("Retrouvez Rock $& Roll");
    expect(substituer("Retrouvez {nom}", "{nom}", "A$`B")).toBe("Retrouvez A$`B");
    expect(substituer("Retrouvez {nom}", "{nom}", "A$'B")).toBe("Retrouvez A$'B");
    expect(substituer("Retrouvez {nom}", "{nom}", "A$1B")).toBe("Retrouvez A$1B");
  });

  test("TOUTES les occurrences sont remplacées, pas seulement la première", () => {
    expect(substituer("{n} sur {n}", "{n}", "3")).toBe("3 sur 3");
  });

  test("un gabarit sans le jeton est rendu intact", () => {
    expect(substituer("Rien à substituer", "{nom}", "X")).toBe("Rien à substituer");
  });

  test("une valeur vide est une valeur, pas une absence", () => {
    // L'appelant décide d'omettre ou non ; cette fonction ne devine rien.
    expect(substituer("Pour {nom}", "{nom}", "")).toBe("Pour ");
  });
});
