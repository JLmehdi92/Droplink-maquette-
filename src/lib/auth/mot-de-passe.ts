import { z } from "zod";

/**
 * LA POLITIQUE DE MOT DE PASSE, EN UN SEUL ENDROIT.
 *
 * Elle sert à l'inscription ET au changement après réinitialisation. Écrite
 * deux fois, elle aurait divergé — et c'est toujours celle du chemin le moins
 * emprunté qui reste en arrière, c'est-à-dire celle de la réinitialisation,
 * c'est-à-dire le chemin par lequel on prend un compte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER NE PEUT PAS TENIR LA POLITIQUE À LUI SEUL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zod ne voit que ce qui passe par NOS formulaires. Le serveur
 * d'authentification, lui, accepte aussi des appels que nous n'écrivons pas, et
 * il applique SA propre longueur minimale — 6 par défaut. Tant que le réglage
 * du projet n'est pas relevé, un mot de passe de six caractères reste
 * acceptable par une voie que ce fichier ne voit pas.
 *
 * Le plancher vit donc aux DEUX endroits, et ce n'est pas de la redondance :
 * ce sont deux surfaces différentes. Le réglage du projet ne peut pas être posé
 * depuis le dépôt — c'est L-028, une propriété de sécurité qui vit hors du code
 * et qu'aucune relecture ne peut voir. Elle est inscrite au §9 du brief, avec
 * la protection contre les mots de passe déjà fuités, qui vit au même endroit.
 */

/**
 * DOUZE, ET NON HUIT.
 *
 * L'OWASP pose huit comme plancher absolu et recommande d'aller au-delà quand
 * on n'impose pas de règles de composition. C'est exactement notre cas : on
 * n'exige ni chiffre, ni majuscule, ni symbole, parce que ces règles produisent
 * `Motdepasse1!` — long à taper, court à deviner, et écrit sur un papier collé
 * à l'écran. La longueur est la seule contrainte qui achète réellement de
 * l'entropie sans pousser à la contourner.
 */
export const LONGUEUR_MINIMALE = 12;

/**
 * SOIXANTE-DOUZE OCTETS, ET C'EST UNE BORNE TECHNIQUE, PAS UN CHOIX.
 *
 * Le serveur d'authentification hache en bcrypt, qui **ignore silencieusement**
 * tout ce qui dépasse 72 octets. Accepter plus long ferait croire à une
 * sécurité qu'on n'a pas : deux mots de passe partageant leurs 72 premiers
 * octets ouvriraient le même compte, et personne ne le saurait jamais.
 *
 * ⚠️ EN OCTETS, PAS EN CARACTÈRES. Un accent en pèse deux en UTF-8, un emoji
 * jusqu'à quatre : compter les caractères laisserait passer une phrase qui
 * dépasse la borne réelle. C'est le genre d'écart qui ne se voit que chez
 * quelqu'un dont la langue porte des accents — donc chez la moitié de nos
 * utilisateurs.
 */
export const OCTETS_MAXIMUM = 72;

export function longueurEnOctets(valeur: string): number {
  return new TextEncoder().encode(valeur).length;
}

/**
 * La partie locale d'une adresse, en minuscules, ou `null`.
 *
 * Sert au seul contrôle de contenu qu'on s'autorise : refuser un mot de passe
 * qui contient l'identité qu'il protège.
 */
function partieLocale(email: string): string | null {
  const arobase = email.lastIndexOf("@");
  if (arobase <= 0) return null;
  const locale = email.slice(0, arobase).trim().toLowerCase();
  // En dessous de quatre caractères, la partie locale se retrouve dans trop de
  // mots ordinaires : refuser « mercredi » à quelqu'un dont l'adresse commence
  // par « mer » serait une règle qu'on ne peut pas expliquer.
  return locale.length >= 4 ? locale : null;
}

/** Les raisons de refus. Elles servent à choisir un message, pas à en fabriquer un. */
export type RefusMotDePasse = "trop_court" | "trop_long" | "contient_email";

/**
 * Le contrôle complet, adresse comprise.
 *
 * Rendu sous forme de liste plutôt que d'un premier refus : quelqu'un qui tape
 * un mot de passe trop court ET qui contient son adresse doit corriger les deux,
 * et découvrir le second refus après avoir réparé le premier est ce qui fait
 * abandonner un formulaire.
 */
export function refusDuMotDePasse(
  motDePasse: string,
  email: string,
): readonly RefusMotDePasse[] {
  const refus: RefusMotDePasse[] = [];

  if (motDePasse.length < LONGUEUR_MINIMALE) refus.push("trop_court");
  if (longueurEnOctets(motDePasse) > OCTETS_MAXIMUM) refus.push("trop_long");

  const locale = partieLocale(email);
  if (locale !== null && motDePasse.toLowerCase().includes(locale)) {
    refus.push("contient_email");
  }

  return refus;
}

/**
 * Le schéma de forme, SANS l'adresse.
 *
 * ⚠️ IL NE SUFFIT PAS, et c'est délibéré : le contrôle « contient l'adresse »
 * a besoin de deux champs, donc il ne peut pas vivre dans un schéma qui n'en
 * voit qu'un. Les appelants composent `MotDePasse` puis `refusDuMotDePasse` —
 * l'inverse (tout mettre dans un `superRefine` sur l'objet entier) rendrait la
 * politique invisible depuis le formulaire de changement, qui n'a pas de champ
 * d'adresse à soumettre.
 *
 * PAS DE `.trim()`. Une espace en tête ou en fin fait partie du mot de passe :
 * la retirer ici ferait diverger ce qu'on valide de ce qu'on envoie, et
 * quelqu'un se retrouverait avec un mot de passe qu'il ne peut pas retaper.
 */
export const MotDePasse = z
  .string()
  .min(LONGUEUR_MINIMALE)
  .refine((v) => longueurEnOctets(v) <= OCTETS_MAXIMUM);
