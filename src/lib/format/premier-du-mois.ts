/**
 * « 1er » DANS LES DATES FRANÇAISES (passe de finition du 03/10/2026).
 *
 * `Intl.DateTimeFormat` écrit « 1 octobre », « 1 oct. » ; la typographie
 * française veut « 1er ». Aucune option d'`Intl` ne pose l'ordinal : on le pose
 * ici, sur le texte rendu, et uniquement quand le jour 1 est suivi d'un NOM de
 * mois — jamais « 11 », « 21 », « 31 », jamais une date chiffrée (« 01/10 »).
 * Les autres langues ne changent pas.
 */
const MOIS = "janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc";
const PREMIER = new RegExp(`(^|[^\\d])1([\\s\\u00a0\\u202f])(${MOIS})`, "giu");

export function premierDuMois(langue: string, texte: string): string {
  if (!langue.startsWith("fr")) return texte;
  return texte.replace(PREMIER, "$11er$2$3");
}

/** Le formateur de next-intl, dont `dateTime` pose « 1er » en français. */
export function avecPremierDuMois<F extends { dateTime: (...a: never[]) => string }>(langue: string, format: F): F {
  const dateTime = format.dateTime.bind(format) as F["dateTime"];
  return { ...format, dateTime: ((...a: Parameters<F["dateTime"]>) => premierDuMois(langue, dateTime(...a))) as F["dateTime"] };
}
