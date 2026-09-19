import { describe, expect, test } from "vitest";
import { datesDesEtapes, type PassageCommande } from "@/lib/commandes/suivi-commande";

/**
 * LA DATE D'UNE ÉTAPE EST CELLE DE SON PREMIER PASSAGE — audit du 20/09/2026.
 *
 * `datesDesEtapes` n'avait aucun test, alors que son commentaire désigne lui-même le piège :
 * c'est le passage le PLUS ANCIEN portant une étape qui la date, sinon un second scan « en
 * transit » déplacerait dans le temps une étape déjà franchie — et la frise du vendeur comme
 * celle de son client dirait « en transit depuis hier » d'un colis parti il y a une semaine.
 * Un `<` changé en `>` suffirait, et rien ne le verrait.
 */

const passage = (instant: string, etape: PassageCommande["etape"]): PassageCommande => ({
  instant,
  lieu: null,
  description: "scan",
  etape,
});

describe("datesDesEtapes", () => {
  test("le PREMIER passage d'une étape la date, quel que soit l'ordre de lecture", () => {
    // Le fournisseur rend les passages du plus récent au plus ancien : l'ordre de la liste ne
    // doit rien décider.
    const dates = datesDesEtapes([
      passage("2026-09-12T10:00:00+00:00", "en_transit"),
      passage("2026-09-10T08:00:00+00:00", "en_transit"),
      passage("2026-09-11T09:00:00+00:00", "en_transit"),
    ]);
    expect(dates.en_transit).toBe("2026-09-10T08:00:00+00:00");
  });

  test("chaque étape garde sa propre date", () => {
    const dates = datesDesEtapes([
      passage("2026-09-15T16:00:00+00:00", "livre"),
      passage("2026-09-11T09:00:00+00:00", "en_transit"),
      passage("2026-09-09T07:00:00+00:00", "expedie"),
    ]);
    expect(dates).toEqual({
      expedie: "2026-09-09T07:00:00+00:00",
      en_transit: "2026-09-11T09:00:00+00:00",
      livre: "2026-09-15T16:00:00+00:00",
    });
  });

  test("un passage sans étape ne date rien, et une liste vide ne date rien", () => {
    expect(datesDesEtapes([passage("2026-09-10T08:00:00+00:00", null)])).toEqual({});
    expect(datesDesEtapes([])).toEqual({});
  });
});
