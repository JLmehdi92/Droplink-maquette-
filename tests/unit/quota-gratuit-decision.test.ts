import { describe, expect, test } from "vitest";
import { PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT } from "@/lib/audit/panneau";

/**
 * LE COMPTE GRATUIT : 5 COMMANDES ET 5 COLIS SUIVIS, À VIE.
 *
 * Décision de Mehdi, 30/09/2026 : « 5 suivis et 5 commandes ». Raison chiffrée :
 * le stock de prises en charge 17TRACK est commun à tout le produit (~191 à vie) ;
 * à 15 colis par compte gratuit, 13 inscrits le vidaient et coupaient le suivi
 * des clients Pro payants ; à 5, il en tient ~38.
 *
 * Le plafond de colis gratuit vaut UNE FOIS celui des commandes (201) : fixer
 * ce nombre fixe les deux. `tests/rls/quota-gratuit.test.ts` vérifie que la BASE
 * applique ce même défaut — ici, c'est la décision elle-même qui est tenue.
 */
describe("Le quota du compte gratuit", () => {
  test("vaut 5, à vie", () => {
    expect(PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT).toBe(5);
  });
});
