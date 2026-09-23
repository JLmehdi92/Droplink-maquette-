import { describe, expect, test } from "vitest";
import { etatPanneauQc } from "@/lib/analyses/activite";

/**
 * LE PANNEAU QC DES ANALYSES — trouvé par la chasse aux échecs silencieux ECC,
 * 23/09/2026.
 *
 * Quand la lecture de l'activité échouait (`null`), le panneau calculait un
 * total de 0 et affichait « Aucune commande sur cette période ». Tout le reste
 * de l'écran disait, lui, « section illisible — ce n'est pas « aucune donnée » ».
 * Un vendeur qui regardait ses validations pendant un incident concluait
 * qu'aucun client n'avait répondu : exactement ce que la contrainte n° 8 interdit.
 */

const ACTIVITE = { qcApprouve: 0, qcRefuse: 0, qcEnAttente: 0 };

describe("L'état du panneau QC", () => {
  test("⚠️ UNE LECTURE EN ÉCHEC EST « INDISPONIBLE », JAMAIS « AUCUNE COMMANDE »", () => {
    expect(etatPanneauQc(null)).toEqual({ etat: "indisponible" });
  });

  test("CONTRE-TEST : une période réellement vide est « vide »", () => {
    expect(etatPanneauQc(ACTIVITE)).toEqual({ etat: "vide" });
  });

  test("des validations lues sont rendues avec leur total", () => {
    expect(etatPanneauQc({ qcApprouve: 3, qcRefuse: 1, qcEnAttente: 2 })).toEqual({
      etat: "parts",
      total: 6,
    });
  });
});
