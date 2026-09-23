import { describe, expect, test } from "vitest";
import { estimationVisible } from "@/lib/page-publique/estimation";

/**
 * L'ARRIVÉE ESTIMÉE NE DOIT PAS ANNONCER UNE DATE PASSÉE.
 *
 * DÉFAUT MESURÉ LE 02/09/2026, deux fois, sur la page servie :
 *
 *   colis en transit, ETA du 24 au 27 août, mouvement il y a 2 jours
 *     → « Arrivée estimée 24 août — 27 août », SIX JOURS DANS LE PASSÉ
 *   colis LIVRÉ hier, ETA du 6 au 9 septembre
 *     → « Arrivée estimée 6 — 9 septembre », à côté d'une frise « Livré »
 *
 * La page PROMETTAIT pourtant l'inverse en commentaire — « une date d'arrivée
 * qu'on sait dépassée est pire qu'une absence de date » — mais n'appliquait que
 * la règle du SILENCE, qui attend dix jours sans mouvement. Un colis qui bouge
 * tous les trois jours et qui est en retard gardait sa date morte
 * indéfiniment : c'est-à-dire exactement le colis qui produit le « c'est où mon
 * colis » que la deuxième feature du produit existe pour tuer.
 *
 * ⚠️ ET LA CORRECTION NE POUVAIT PAS VENIR DE LA DONNÉE. `appliquer_etat_colis`
 * garde l'estimation MONOTONE croissante, et `greatest(x, null)` ignore le nul :
 * une interrogation qui cesse d'annoncer une date laisse l'ancienne en base.
 */
describe("Quand la page client montre une arrivée estimée", () => {
  // En UTC, comme la base : `timestamptz` relu par `new Date(chaîne ISO)`.
  const LE_2_SEPT = new Date(Date.UTC(2026, 8, 2, 14, 0, 0));
  const jour = (j: number, mois = 8): Date => new Date(Date.UTC(2026, mois, j));

  const cas = (
    o: Partial<Parameters<typeof estimationVisible>[0]>,
  ): Parameters<typeof estimationVisible>[0] => ({
    du: jour(10, 8),
    au: jour(14, 8),
    etape: "en_transit",
    silencieux: false,
    maintenant: LE_2_SEPT,
    ...o,
  });

  test("une fourchette à venir est montrée", () => {
    expect(estimationVisible(cas({ du: jour(10, 8), au: jour(14, 8) }))).toBe(true);
  });

  test("le JOUR MÊME de la borne haute est encore montré", () => {
    // Le transporteur annonce une DATE, pas un horaire. Faire disparaître
    // l'estimation le matin du jour annoncé la retirerait au moment précis où
    // elle intéresse le plus.
    expect(estimationVisible(cas({ du: jour(2, 8), au: jour(2, 8) }))).toBe(true);
    expect(estimationVisible(cas({ du: jour(28, 7), au: jour(2, 8) }))).toBe(true);
  });

  test("une fourchette ENTIÈREMENT passée est retirée", () => {
    // Le cas mesuré : ETA du 24 au 27 août, un 2 septembre.
    expect(estimationVisible(cas({ du: jour(24, 7), au: jour(27, 7) }))).toBe(false);
  });

  test("une fourchette COMMENCÉE mais pas finie reste montrée", () => {
    // La borne HAUTE est celle qui compte : la fourchette est encore vraie.
    expect(estimationVisible(cas({ du: jour(28, 7), au: jour(6, 8) }))).toBe(true);
  });

  test("une date unique passée est retirée, une date unique à venir est montrée", () => {
    expect(estimationVisible(cas({ du: jour(27, 7), au: null }))).toBe(false);
    expect(estimationVisible(cas({ du: jour(6, 8), au: null }))).toBe(true);
  });

  test("un colis LIVRÉ ne montre plus d'estimation, même à venir", () => {
    // Ce n'est plus une prévision, c'est un fait — et il est déjà écrit dans la
    // frise, deux centimètres plus haut.
    expect(estimationVisible(cas({ etape: "livre", du: jour(6, 8), au: jour(9, 8) }))).toBe(false);
  });

  test("le silence retire l'estimation, comme avant cette correction", () => {
    expect(estimationVisible(cas({ silencieux: true, du: jour(6, 8) }))).toBe(false);
  });

  test("rien d'annoncé, rien de montré", () => {
    // Une fourchette inventée serait indiscernable d'une vraie, et c'est celle
    // qu'on croirait.
    expect(estimationVisible(cas({ du: null, au: null }))).toBe(false);
    expect(estimationVisible(cas({ du: null, au: jour(6, 8) }))).toBe(false);
  });

  test("CONTRE-TEST : les trois autres étapes montrent bien une estimation à venir", () => {
    /*
     * Sans lui, une correction qui retirerait l'estimation PARTOUT passerait
     * tous les cas ci-dessus — en supprimant du même coup la seule information
     * que le client vient chercher quand son colis est en route.
     */
    for (const etape of ["preparation", "expedie", "en_transit"] as const) {
      expect(estimationVisible(cas({ etape, du: jour(6, 8), au: jour(9, 8) })), etape).toBe(true);
    }
  });

  /*
   * ⚠️ LE JOUR NE DÉPEND PAS DU FUSEAU DU SERVEUR — trouvé par la revue ECC,
   * 23/09/2026. La fin du jour se calculait en heure LOCALE : sur un serveur
   * à New York, une ETA « 2 septembre » (minuit UTC) tombait le 1er au soir,
   * et l'estimation disparaissait le jour même où elle intéresse le plus.
   * Railway tourne en UTC, donc le défaut dormait — jusqu'au jour où la région
   * ou l'image change. La page affiche la date en UTC ; la décision aussi.
   */
  test("⚠️ le jour de la borne se lit en UTC, quel que soit le fuseau du serveur", () => {
    const avant = process.env.TZ;
    try {
      for (const fuseau of ["America/New_York", "Asia/Shanghai", "UTC"]) {
        process.env.TZ = fuseau;
        const eta = new Date("2026-09-02T00:00:00Z");
        expect(
          estimationVisible(cas({ du: eta, au: eta, maintenant: new Date("2026-09-02T20:00:00Z") })),
          fuseau,
        ).toBe(true);
        // CONTRE-TEST : le lendemain en UTC, elle est bien périmée.
        expect(
          estimationVisible(cas({ du: eta, au: eta, maintenant: new Date("2026-09-03T00:30:00Z") })),
          fuseau,
        ).toBe(false);
      }
    } finally {
      if (avant === undefined) delete process.env.TZ;
      else process.env.TZ = avant;
    }
  });
});
