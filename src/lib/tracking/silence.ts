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
  /**
   * L'étape du colis rend la question sans objet : il n'est pas encore parti,
   * ou il est arrivé. Distinct de `recent`, qui affirme un mouvement récent.
   */
  | { readonly etat: "sans-objet"; readonly jours: number }
  | { readonly etat: "recent"; readonly jours: number }
  | { readonly etat: "silencieux"; readonly jours: number };

/**
 * L'étape du colis, telle que la frise la connaît.
 *
 * ⚠️ ELLE EST EXIGÉE, ET C'EST TOUT L'OBJET DU CORRECTIF DU 05/09/2026. Un
 * paramètre facultatif aurait laissé les appelants existants garder leur défaut
 * sans qu'une seule ligne ne change : c'est le TYPAGE qui doit forcer chaque
 * point d'appel à dire de quel colis il parle.
 */
export type EtapeColis = "preparation" | "expedie" | "en_transit" | "livre";

/**
 * Décrit le silence d'un colis à un instant donné.
 *
 * `jours` est arrondi VERS LE BAS : dire « 3 jours » quand il s'est écoulé 3
 * jours et 20 heures est exact au sens où on l'entend en français, alors
 * qu'arrondir à 4 affirmerait un jour qui n'a pas eu lieu.
 */
export function decrireSilence(
  dernierMouvement: Date | null,
  maintenant: Date,
  etape: EtapeColis,
): Silence {
  if (dernierMouvement === null) return { etat: "aucun-mouvement" };

  const ecart = maintenant.getTime() - dernierMouvement.getTime();

  // UN MOUVEMENT DANS LE FUTUR N'EST PAS UNE ERREUR À CORRIGER EN SILENCE : les
  // transporteurs datent leurs scans dans leur fuseau, et un décalage de
  // quelques heures traverse régulièrement minuit. On le ramène à zéro plutôt
  // que de rendre un nombre de jours négatif, qui s'afficherait tel quel.
  const jours = Math.max(0, Math.floor(ecart / MS_PAR_JOUR));

  /*
   * ⚠️ UN COLIS LIVRÉ N'EST PAS IMMOBILE : IL A FINI DE BOUGER.
   *
   * DÉFAUT VU PAR WASSIM SUR UNE VRAIE PAGE, le 05/09/2026. Un Colissimo livré
   * le 18 août affichait « Aucun mouvement depuis 18 jours — nous continuons
   * d'interroger le transporteur chaque jour », juste au-dessus de la frise qui
   * disait « Livré » et de la ligne « Votre colis est livré dans votre boîte
   * aux lettres ». La page s'inquiétait d'un colis arrivé, et promettait des
   * interrogations quotidiennes qui n'ont plus lieu d'être.
   *
   * Même chose avant le départ : un colis en PRÉPARATION n'a aucun mouvement à
   * attendre, et compter les jours depuis un mouvement qui n'existe pas encore
   * n'informe personne.
   *
   * ⚠️ LA RÈGLE EXISTAIT DÉJÀ — DANS DEUX APPELANTS SUR QUATRE. La liste des
   * commandes écartait `livre` et `preparation` avant d'appeler, à deux
   * endroits ; la page publique et l'écran Envois ne le faisaient pas. Une
   * règle qui vit chez les appelants n'est appliquée que par ceux qui y ont
   * pensé — c'est pourquoi elle descend ici, au seul endroit qui décide.
   */
  if (etape === "livre" || etape === "preparation") return { etat: "sans-objet", jours };

  return jours >= SEUIL_SILENCE_JOURS
    ? { etat: "silencieux", jours }
    : { etat: "recent", jours };
}
