import { describe, expect, test } from "vitest";
import { cheminAdminSansDoubleFacteur } from "@/lib/audit/garde";

/**
 * UN ADMINISTRATEUR À UN SEUL FACTEUR N'EST PLUS ENVOYÉ DANS UNE IMPASSE.
 *
 * Défaut vu par Mehdi le 30/09/2026 : connecté depuis un appareil fiable (203),
 * sa session n'avait qu'un facteur ; `/admin` le renvoyait aux Paramètres, où sa
 * double authentification s'affichait « Activée » et où rien ne permettait de
 * taper le code. L'administration exige toujours deux facteurs (186) : seule la
 * DESTINATION change.
 */
describe("cheminAdminSansDoubleFacteur", () => {
  test("un facteur déjà vérifié → taper le code, puis revenir à l'administration", () => {
    expect(cheminAdminSansDoubleFacteur("fr", true)).toBe("/fr/verification?suite=admin");
    expect(cheminAdminSansDoubleFacteur("zh-CN", true)).toBe("/zh-CN/verification?suite=admin");
  });

  test("CONTRE-TEST : aucun facteur → les Paramètres, où l'on l'active", () => {
    expect(cheminAdminSansDoubleFacteur("fr", false)).toBe("/fr/parametres");
  });
});
