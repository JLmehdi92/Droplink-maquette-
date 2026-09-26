import { describe, expect, test } from "vitest";
import { EtatQuota, cheminQuotaAtteint, quotaColisDepuisCode, quotaDepuisErreur } from "@/lib/commandes/quota-atteint";

/**
 * LE REFUS DE QUOTA, RECONNU — et lui seul.
 *
 * Trouvé en cliquant tout le SaaS le 26/09/2026 : au-delà de son quota, un vendeur
 * gratuit recevait une page d'erreur en créant une commande, et rien du tout en la
 * dupliquant. Les codes viennent de la base (`DL067`, `DL035`), éprouvés par
 * `tests/rls/quota-gratuit.test.ts` et `plafonds-par-compte.test.ts`.
 */
describe("quotaDepuisErreur", () => {
  test("DL067 est le quota À VIE du compte gratuit", () => {
    expect(quotaDepuisErreur({ code: "DL067" })).toBe("gratuit");
  });

  test("DL035 est le plafond MENSUEL", () => {
    expect(quotaDepuisErreur({ code: "DL035" })).toBe("mensuel");
  });

  test("toute autre erreur reste une panne : jamais maquillée en quota", () => {
    for (const erreur of [{ code: "23505" }, { code: "DL051" }, { code: "" }, { code: null }, {}, null, undefined]) {
      expect(quotaDepuisErreur(erreur)).toBeNull();
    }
  });
});

describe("quotaColisDepuisCode", () => {
  test("DL070 est le quota de colis À VIE, DL051 le plafond de colis du mois", () => {
    expect(quotaColisDepuisCode("DL070")).toBe("gratuit");
    expect(quotaColisDepuisCode("DL051")).toBe("mensuel");
  });

  test("un refus de COMMANDE n'est pas un refus de colis, et une panne reste une panne", () => {
    for (const code of ["DL067", "DL035", "lecture", "ecriture", "23505", "", null, undefined]) {
      expect(quotaColisDepuisCode(code)).toBeNull();
    }
  });
});

describe("le quota dans l'URL", () => {
  test("seules les deux valeurs connues passent ; le reste n'affiche rien", () => {
    expect(EtatQuota.parse("gratuit")).toBe("gratuit");
    expect(EtatQuota.parse("mensuel")).toBe("mensuel");
    for (const brut of ["", "n_importe_quoi", ["gratuit", "mensuel"], undefined, 3]) {
      expect(EtatQuota.parse(brut)).toBeNull();
    }
  });

  test("le chemin mène à la liste des commandes de la bonne langue", () => {
    expect(cheminQuotaAtteint("zh-CN", "gratuit")).toBe("/zh-CN/commandes?quota=gratuit");
    expect(cheminQuotaAtteint("fr", "mensuel")).toBe("/fr/commandes?quota=mensuel");
  });
});
