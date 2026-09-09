import { describe, expect, test } from "vitest";
import {
  DUREE_MINIMALE_ANNEAU_MS,
  resteAvantExtinction,
} from "@/components/bouton-action";

/**
 * L'ANNEAU D'ATTENTE DOIT SE VOIR, MÊME QUAND LE SERVEUR EST RAPIDE.
 *
 * ⚠️ CE CONTRÔLE EXISTE PARCE QUE LA PREMIÈRE VERSION NE MONTRAIT RIEN. Elle
 * attendait 150 ms AVANT d'afficher l'anneau, pour qu'une action rapide ne le
 * fasse pas clignoter. Le raisonnement se tenait, le chiffre était posé au jugé.
 *
 * MESURE DU 09/09/2026, cinq lectures après rodage, depuis la machine de
 * Wassim : 26, 32, 32, 37 et 59 ms — MÉDIANE 32 ms. Toutes les actions
 * revenaient donc avant le seuil, et l'anneau n'était JAMAIS peint. Le retour
 * de Wassim, mot pour mot : « rien a changé sur le bouton ».
 *
 * ⚠️ C'EST L-014 DANS SA FORME LA PLUS BÊTE : un chiffre écrit dans le code,
 * jamais confronté à la latence réelle. Et le défaut était INVISIBLE à toute
 * relecture — le composant était juste, le build le contenait, les portes
 * étaient vertes. Seule l'exécution pouvait le dire.
 *
 * La règle est donc devenue une durée MINIMALE D'AFFICHAGE, et c'est elle que
 * ce contrôle tient : à 32 ms de serveur, l'anneau doit rester.
 */
describe("la duree d affichage de l anneau d attente", () => {
  /**
   * LE CAS QUI A ÉCHOUÉ EN VRAI. Il est écrit en premier parce que c'est celui
   * dont on sait qu'il peut casser.
   */
  test("un serveur a 32 ms laisse l anneau visible, il ne disparait pas aussitot", () => {
    const reste = resteAvantExtinction(0, 32);
    expect(reste, "à 32 ms de serveur, l'anneau doit encore rester visible").toBeGreaterThan(0);
    expect(reste).toBe(DUREE_MINIMALE_ANNEAU_MS - 32);
  });

  test("une action plus longue que la duree minimale eteint l anneau tout de suite", () => {
    expect(resteAvantExtinction(0, DUREE_MINIMALE_ANNEAU_MS + 200)).toBe(0);
  });

  test("pile a la duree minimale, l anneau s eteint sans prolongation", () => {
    expect(resteAvantExtinction(0, DUREE_MINIMALE_ANNEAU_MS)).toBe(0);
  });

  /**
   * ⚠️ CONTRE-TEST : sans attente en cours, il n'y a rien à prolonger. Sans ce
   * cas, une implémentation qui rendrait toujours la durée pleine passerait les
   * trois contrôles précédents — et l'anneau resterait allumé sur un bouton qui
   * n'a jamais été cliqué.
   */
  test("CONTRE-TEST : aucune attente en cours ne prolonge rien", () => {
    expect(resteAvantExtinction(null, 10_000)).toBe(0);
  });

  /**
   * ⚠️ CONTRE-TEST DE SENS : une horloge qui recule ne doit pas rallonger
   * l'attente indéfiniment. Le cas paraît théorique ; il ne l'est pas, un
   * changement d'heure système suffit.
   */
  test("CONTRE-TEST : une horloge qui recule ne rallonge pas au-dela du plafond", () => {
    expect(resteAvantExtinction(1000, 0)).toBe(DUREE_MINIMALE_ANNEAU_MS + 1000);
    expect(resteAvantExtinction(1000, 0)).toBeLessThanOrEqual(DUREE_MINIMALE_ANNEAU_MS + 1000);
  });

  /**
   * ⚠️ LA DURÉE DOIT RESTER SUPÉRIEURE À LA LATENCE MESURÉE, sinon on
   * reconstruit exactement le défaut d'origine. 59 ms est la plus lente des
   * cinq mesures du 09/09 ; le seuil est gardé bien au-dessus pour que la
   * marge survive à un réseau plus lent que celui de ce jour-là.
   */
  test("la duree minimale reste bien au-dessus de la latence mesuree", () => {
    const latenceLaPlusLente = 59;
    expect(
      DUREE_MINIMALE_ANNEAU_MS,
      "sous la latence réelle, l'anneau redeviendrait invisible — c'est le défaut du 09/09",
    ).toBeGreaterThan(latenceLaPlusLente * 3);
  });
});
