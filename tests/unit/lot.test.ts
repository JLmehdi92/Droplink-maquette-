import { describe, expect, test } from "vitest";
import { ETATS_LOT, EtatLot, NombreLot } from "@/lib/commandes/lot";

/**
 * LE RÉSULTAT D'UN LOT VIENT DE LA BARRE D'ADRESSE, et finit dans une clef de
 * traduction : `t("lot." + etat)`. Une clef inexistante fait LEVER le rendu.
 *
 * Ce n'est donc pas une validation de confort. Sans elle, `?lot=n_importe_quoi`
 * casse l'écran le plus utilisé du produit — pour tout le monde, sans rien
 * exploiter, et de façon parfaitement reproductible par n'importe qui.
 */
describe("L'état d'un lot, tel qu'il revient de l'URL", () => {
  test("les états connus passent — sinon la sonde n'inspecte rien", () => {
    for (const etat of ETATS_LOT) {
      expect(EtatLot.parse(etat), `${etat} devrait être accepté`).toBe(etat);
    }
  });

  test("tout le reste devient `null`, sans lever", () => {
    // Une valeur inconnue n'est pas un incident : c'est une URL recopiée de
    // travers dans une conversation. On n'affiche simplement aucun message.
    for (const valeur of [
      "n_importe_quoi",
      "titre",
      "aide",
      // Une clef qui EXISTE dans le catalogue mais n'est pas un état : c'est le
      // cas le plus vicieux, parce qu'elle rendrait un message crédible et faux.
      "archiver",
      "__proto__",
      "constructor",
      "",
      undefined,
      null,
      42,
      ["ok"],
      { etat: "ok" },
    ]) {
      expect(EtatLot.parse(valeur)).toBeNull();
    }
  });

  test("le nombre est borné, et une valeur absurde vaut zéro", () => {
    expect(NombreLot.parse("12")).toBe(12);
    expect(NombreLot.parse("0")).toBe(0);
    expect(NombreLot.parse("200")).toBe(200);

    // Au-delà du plafond de la base, sous zéro, ou pas un nombre : zéro. Le
    // nombre n'est qu'un message, il ne commande rien — mais un « -1 » ou un
    // « 1e9 » affiché ferait douter de tout le reste de l'écran.
    for (const valeur of ["201", "-1", "1e9", "abc", "", undefined, null, "3.5"]) {
      expect(NombreLot.parse(valeur), `${String(valeur)} devrait valoir 0`).toBe(0);
    }
  });
});
