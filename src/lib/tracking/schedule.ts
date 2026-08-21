/**
 * LA CADENCE D'INTERROGATION — module PUR.
 *
 * Le fournisseur facture À LA PRISE EN CHARGE d'un numéro, pas à
 * l'interrogation ; mais chaque interrogation consomme du quota et du temps, et
 * un colis qu'on interroge indéfiniment est un colis qui coûte indéfiniment.
 * Ce fichier décide QUAND redemander, et QUAND arrêter.
 *
 * LE CAS QUI PIÈGE : UN NUMÉRO FRAÎCHEMENT COLLÉ N'EST PAS ENCORE SCANNÉ.
 * Le vendeur imprime son étiquette, colle le numéro chez nous, et dépose le
 * colis le lendemain. Entre les deux, le fournisseur répond « rien ». Ce retour
 * vide compte dans le coût — il a bien été payé — mais il ne déclenche NI la
 * cadence du silence NI l'abandon. Confondre « pas encore scanné » et
 * « introuvable » ferait abandonner le suivi de colis parfaitement normaux, la
 * veille du jour où ils commencent à bouger.
 *
 * Comme `silence.ts`, tout part d'un instant PASSÉ EN ARGUMENT : une fonction
 * qui lit l'horloge ne se teste qu'en attendant.
 */

const MS_PAR_HEURE = 60 * 60 * 1000;
const MS_PAR_JOUR = 24 * MS_PAR_HEURE;

/**
 * La fenêtre laissée à un numéro pour donner signe de vie.
 *
 * Sept jours ET seize interrogations : les deux, parce qu'ils ne bornent pas la
 * même chose. Le temps borne le cas du numéro erroné saisi à la main ; le
 * nombre borne le cas où quelque chose nous ferait interroger en boucle.
 */
export const FENETRE_VIDE_JOURS = 7;
export const INTERROGATIONS_VIDES_MAX = 16;

export interface EtatColis {
  readonly enregistreLe: Date | null;
  readonly dernierMouvement: Date | null;
  readonly derniereInterrogation: Date | null;
  readonly interrogationsVides: number;
  readonly etape: "preparation" | "expedie" | "en_transit" | "livre";
  readonly abandonneLe: Date | null;
}

export type Decision =
  | { readonly action: "interroger"; readonly motif: "premiere" | "cadence" }
  | { readonly action: "attendre"; readonly prochaineLe: Date }
  | { readonly action: "abandonner"; readonly motif: "silence-initial" | "trop-de-vides" }
  | { readonly action: "terminer" };

/**
 * L'intervalle entre deux interrogations, en heures.
 *
 * IL S'ALLONGE AVEC LE SILENCE. Un colis qui bouge tous les jours mérite d'être
 * regardé souvent ; un colis immobile depuis trois semaines ne changera pas
 * dans l'heure, et l'interroger au même rythme paie quinze fois le même « rien ».
 * La progression est bornée : au-delà, on cesserait de remarquer un déblocage.
 */
export function intervalleHeures(joursDeSilence: number): number {
  if (joursDeSilence < 1) return 3;
  if (joursDeSilence < 3) return 6;
  if (joursDeSilence < 7) return 12;
  return 24;
}

/**
 * Décide quoi faire d'un colis, maintenant.
 *
 * L'ORDRE DES CAS EST LA LOGIQUE. Livré d'abord — il n'y a plus rien à demander
 * et c'est le cas le plus fréquent en régime établi. Abandonné ensuite : un
 * colis abandonné ne se réveille pas tout seul, seule une action du vendeur le
 * relance. Puis les abandons à décider, et enfin la cadence.
 */
export function decider(colis: EtatColis, maintenant: Date): Decision {
  if (colis.etape === "livre") return { action: "terminer" };
  if (colis.abandonneLe !== null) return { action: "terminer" };

  // PREMIÈRE INTERROGATION IMMÉDIATE. Un vendeur qui colle un numéro et ne voit
  // rien pendant quatre heures conclut que ça ne marche pas — et il a raison de
  // le conclure, puisque rien ne le détrompe.
  if (colis.derniereInterrogation === null) {
    return { action: "interroger", motif: "premiere" };
  }

  const aBouge = colis.dernierMouvement !== null;

  if (!aBouge) {
    // LE COLIS N'A JAMAIS RIEN DIT. C'est ici, et seulement ici, que l'abandon
    // se décide : une fois qu'un colis a bougé au moins une fois, il n'est plus
    // question de l'abandonner pour silence — il est en transit quelque part.
    const depuis = colis.enregistreLe ?? colis.derniereInterrogation;
    const joursDepuisEnregistrement = (maintenant.getTime() - depuis.getTime()) / MS_PAR_JOUR;

    if (joursDepuisEnregistrement >= FENETRE_VIDE_JOURS) {
      return { action: "abandonner", motif: "silence-initial" };
    }
    if (colis.interrogationsVides >= INTERROGATIONS_VIDES_MAX) {
      return { action: "abandonner", motif: "trop-de-vides" };
    }
  }

  const reference = colis.dernierMouvement ?? colis.enregistreLe ?? colis.derniereInterrogation;
  const joursDeSilence = Math.max(0, (maintenant.getTime() - reference.getTime()) / MS_PAR_JOUR);
  const attente = intervalleHeures(joursDeSilence) * MS_PAR_HEURE;

  const prochaine = new Date(colis.derniereInterrogation.getTime() + attente);
  if (prochaine.getTime() > maintenant.getTime()) {
    return { action: "attendre", prochaineLe: prochaine };
  }

  return { action: "interroger", motif: "cadence" };
}
