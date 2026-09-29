import { describe, expect, test } from "vitest";
import { alertesDePurge } from "@/lib/veille/passer";

/**
 * UNE PURGE QUI ÉCHOUE SE DIT PAR E-MAIL (audit ECC du 29/09/2026).
 *
 * Son échec n'allait que dans le détail du battement, que ni l'écran de
 * surveillance ni la veille mutuelle ne lisent : une purge RGPD en panne aurait
 * manqué indéfiniment aux durées que la politique de confidentialité promet.
 */
describe("alertesDePurge — ce qui doit partir à l'exploitant", () => {
  test("une purge des durées en échec produit une alerte qui nomme l'obligation et l'erreur", () => {
    const [alerte, ...reste] = alertesDePurge({ comptes: null, durees: "function purger_donnees_expirees() does not exist" });
    expect(reste).toHaveLength(0);
    expect(alerte?.cle).toBe("veille:purge:durees");
    expect(alerte?.texte).toContain("does not exist");
    expect(alerte?.texte).toContain("206");
  });

  test("une purge des comptes en échec a SA clé : les deux pannes ne se taisent pas l'une l'autre", () => {
    const alertes = alertesDePurge({ comptes: "R2 injoignable", durees: "délai dépassé" });
    expect(alertes.map((a) => a.cle).sort()).toEqual(["veille:purge:comptes", "veille:purge:durees"]);
  });

  test("CONTRE-TEST : deux purges réussies n'alertent personne", () => {
    expect(alertesDePurge({ comptes: null, durees: null })).toEqual([]);
  });
});
