/**
 * FAUT-IL MONTRER L'ARRIVÉE ESTIMÉE ?
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026, sur la page servie, deux fois :
 *
 *   colis en transit, ETA du 24 au 27 août, mouvement il y a 2 jours
 *     → « Arrivée estimée 24 août — 27 août », SIX JOURS DANS LE PASSÉ
 *   colis LIVRÉ hier, ETA du 6 au 9 septembre
 *     → « Arrivée estimée 6 — 9 septembre », à côté d'une frise « Livré »
 *
 * Le commentaire de la page promettait pourtant l'inverse — « une date
 * d'arrivée qu'on sait dépassée est pire qu'une absence de date » — mais la
 * seule règle appliquée était celle du SILENCE, qui attend DIX jours sans
 * mouvement. Un colis qui bouge tous les trois jours et qui est en retard
 * gardait sa date morte indéfiniment. Or c'est exactement le colis en retard
 * qui produit le « c'est où mon colis » que la deuxième feature du produit
 * existe pour tuer.
 *
 * LA DÉCISION VIT ICI, SÉPARÉE DU RENDU, parce que c'est elle qui était fausse
 * et qu'un Server Component asynchrone ne s'éprouve pas sans serveur. Sortie en
 * fonction pure, elle est interrogée par l'EFFET, dans les portes, à chaque
 * commit.
 *
 * `appliquer_etat_colis` ne remet JAMAIS l'estimation à nul — elle est monotone
 * croissante en base, et `greatest(x, null)` ignore le nul, donc une
 * interrogation qui cesse d'annoncer une date laisse l'ancienne. La correction
 * ne peut donc pas venir de la donnée : elle vient du rendu.
 */

export type EtapeAffichee = "preparation" | "expedie" | "en_transit" | "livre";

export function estimationVisible(entree: {
  /** Début de la fourchette annoncée par le transporteur, ou `null`. */
  readonly du: Date | null;
  /** Fin de la fourchette, ou `null` quand il n'en annonce qu'une. */
  readonly au: Date | null;
  /** L'étape RÉELLEMENT affichée, après arbitrage vendeur / transporteur. */
  readonly etape: EtapeAffichee;
  /** Vrai quand le colis se tait depuis plus que le seuil du brief. */
  readonly silencieux: boolean;
  readonly maintenant: Date;
}): boolean {
  // Rien d'annoncé : rien à montrer. Une fourchette inventée serait
  // indiscernable d'une vraie, et c'est celle qu'on croirait.
  if (entree.du === null) return false;

  // Le silence a sa propre règle, plus ancienne : au-delà du seuil, la page
  // nomme le silence et retire la prévision.
  if (entree.silencieux) return false;

  // LIVRÉ : l'estimation n'a plus d'objet. Ce n'est plus une prévision, c'est un
  // fait — et il est déjà écrit dans la frise, deux centimètres plus haut.
  if (entree.etape === "livre") return false;

  /*
   * PÉRIMÉE. La borne HAUTE est celle qui compte : tant qu'elle n'est pas
   * passée, la fourchette reste vraie même si son début l'est.
   *
   * ⚠️ LA COMPARAISON SE FAIT AU JOUR, PAS À LA SECONDE. Le transporteur
   * annonce une DATE, pas un horaire : traiter « aujourd'hui » comme dépassé
   * ferait disparaître l'estimation le matin même du jour annoncé,
   * c'est-à-dire au moment précis où elle intéresse le plus.
   *
   * ⚠️ ET LE JOUR SE LIT EN UTC, comme la page l'affiche. En heure LOCALE, il
   * dépendait du fuseau du serveur : à New York, une ETA « 2 septembre »
   * (minuit UTC) tombait le 1er au soir et disparaissait le jour annoncé.
   */
  const borne = entree.au ?? entree.du;
  const finDuJour = Date.UTC(
    borne.getUTCFullYear(),
    borne.getUTCMonth(),
    borne.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return finDuJour >= entree.maintenant.getTime();
}
