/**
 * LE SILENCE D'UN COLIS — module PUR.
 *
 * « L'ancienneté du dernier mouvement est le seul élément de la page qui change
 * tous les jours quand le colis ne bouge pas. » C'est la raison d'être de ce
 * fichier : sans lui, une page figée pendant trois semaines est indiscernable
 * d'une page cassée.
 *
 * UN SILENCE NOMMÉ EST UNE INFORMATION, UN SILENCE SUBI SE LIT COMME UNE PANNE.
 * Le client qui voit « aucun mouvement depuis 14 jours » sait que nous savons ;
 * celui qui voit un écran immobile croit que le suivi ne marche pas, et écrit à
 * son vendeur — c'est-à-dire exactement ce que le produit doit tuer.
 *
 * TOUT EST CALCULÉ À PARTIR D'UN INSTANT PASSÉ EN ARGUMENT, jamais de l'horloge
 * du module. Une fonction qui lit l'heure elle-même ne se teste qu'en attendant,
 * ou en trichant sur l'horloge de la machine — et un test qui triche sur
 * l'horloge finit par tester l'horloge.
 */

/**
 * Au-delà de ce seuil, le silence est NOMMÉ sur la page publique.
 *
 * Dix jours et pas trois : sur un trajet Chine → Europe, une semaine sans scan
 * est banale et ne mérite pas d'alarmer un client. Signaler trop tôt est pire
 * que ne rien dire — une alerte qui se trompe est une alerte qu'on apprend à
 * ignorer.
 */
export const SEUIL_SILENCE_JOURS = 10;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export type Silence =
  /** Aucun mouvement n'a JAMAIS été rapporté. Ce n'est pas un silence, c'est un début. */
  | { readonly etat: "aucun-mouvement" }
  | { readonly etat: "recent"; readonly jours: number }
  | { readonly etat: "silencieux"; readonly jours: number };

/**
 * Décrit le silence d'un colis à un instant donné.
 *
 * `jours` est arrondi VERS LE BAS : dire « 3 jours » quand il s'est écoulé 3
 * jours et 20 heures est exact au sens où on l'entend en français, alors
 * qu'arrondir à 4 affirmerait un jour qui n'a pas eu lieu.
 */
export function decrireSilence(dernierMouvement: Date | null, maintenant: Date): Silence {
  if (dernierMouvement === null) return { etat: "aucun-mouvement" };

  const ecart = maintenant.getTime() - dernierMouvement.getTime();

  // UN MOUVEMENT DANS LE FUTUR N'EST PAS UNE ERREUR À CORRIGER EN SILENCE : les
  // transporteurs datent leurs scans dans leur fuseau, et un décalage de
  // quelques heures traverse régulièrement minuit. On le ramène à zéro plutôt
  // que de rendre un nombre de jours négatif, qui s'afficherait tel quel.
  const jours = Math.max(0, Math.floor(ecart / MS_PAR_JOUR));

  return jours >= SEUIL_SILENCE_JOURS
    ? { etat: "silencieux", jours }
    : { etat: "recent", jours };
}
