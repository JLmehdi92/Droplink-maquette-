import { describe, expect, test } from "vitest";
import { creerSuiviDeCouverture } from "../../src/lib/commandes/suivi-couverture";

/**
 * LA COUVERTURE AFFICHÉE EST-ELLE CELLE QUI EST ENREGISTRÉE ?
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026 : le vendeur déposait huit photos
 * d'un coup, son écran encadrait la première, et la base gardait la huitième.
 * Il envoyait son lien en croyant avoir mis la bonne photo en avant.
 *
 * La cause était une fermeture périmée — `medias.length` capturé au rendu, lu
 * huit fois avec la même valeur `0`. Ce module existe pour que la décision
 * puisse être jouée sur un lot entier sans monter le composant : c'est cette
 * impossibilité d'éprouver qui a laissé le défaut vivre.
 */

describe("un seul média devient la couverture, et c'est le premier", () => {
  /*
   * LE CAS MOTIVANT, AU PLAFOND DU PRODUIT.
   *
   * Vingt médias par commande est la limite produit : on joue le lot maximal
   * plutôt qu'un lot de deux. Le défaut d'origine était invisible à un fichier
   * et se voyait dès deux — mesurer au plafond, pas à un dixième du plafond.
   */
  test("vingt dépôts sur une galerie vide : un seul est la couverture", () => {
    const suivi = creerSuiviDeCouverture(0);
    const couvertures = Array.from({ length: 20 }, () => suivi.ajouter());

    expect(couvertures.filter(Boolean)).toHaveLength(1);
    expect(couvertures[0], "ce n'est pas le PREMIER qui devient la couverture").toBe(true);
    expect(suivi.compte()).toBe(20);
  });

  // CONTRE-TEST POSITIF : une implémentation qui rendrait toujours `false`
  // passerait le test ci-dessus « un seul » à zéro, mais surtout elle casserait
  // la fonctionnalité — aucune commande n'aurait jamais de couverture.
  test("le tout premier média d'une galerie vide EST la couverture", () => {
    expect(creerSuiviDeCouverture(0).ajouter()).toBe(true);
  });

  test("une galerie qui a déjà des médias ne change pas de couverture", () => {
    const suivi = creerSuiviDeCouverture(3);
    expect([suivi.ajouter(), suivi.ajouter()]).toEqual([false, false]);
  });
});

describe("le compte suit les suppressions", () => {
  /*
   * FALSIFICATION HORS DU CAS MOTIVANT.
   *
   * Le défaut d'origine portait sur un LOT DE DÉPÔTS. Celui-ci porte sur une
   * séquence que personne n'avait en tête : tout supprimer, puis redéposer. Si
   * le compte n'était pas décrémenté, la galerie redevenue vide n'attribuerait
   * plus jamais de couverture — et la page publique du client n'aurait plus
   * d'image d'ouverture, sans que rien ne le signale.
   */
  test("après avoir tout supprimé, le média suivant redevient la couverture", () => {
    const suivi = creerSuiviDeCouverture(0);
    suivi.ajouter();
    suivi.ajouter();
    suivi.retirer();
    suivi.retirer();

    expect(suivi.compte()).toBe(0);
    expect(suivi.ajouter()).toBe(true);
  });

  test("le compte ne descend jamais sous zéro", () => {
    // Une suppression de trop — un double clic, une réponse rejouée — mettrait
    // le compte à -1, et `compte === 0` deviendrait faux pour une galerie
    // pourtant vide : plus aucune couverture, définitivement.
    const suivi = creerSuiviDeCouverture(1);
    suivi.retirer();
    suivi.retirer();
    suivi.retirer();

    expect(suivi.compte()).toBe(0);
    expect(suivi.ajouter()).toBe(true);
  });

  test("un compte initial absurde est borné plutôt que cru", () => {
    for (const absurde of [-5, 1.5, Number.NaN]) {
      expect(creerSuiviDeCouverture(absurde).ajouter()).toBe(true);
    }
  });
});
