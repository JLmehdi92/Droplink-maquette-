import type { getFormatter } from "next-intl/server";

/**
 * L'ÉCHELLE DES GRAPHIQUES D'ADMINISTRATION — un seul endroit pour les
 * graduations et les dates d'axe, parce que trois graphiques qui arrondiraient
 * chacun à leur façon finiraient par dessiner le même nombre à trois hauteurs.
 */

/**
 * Le plafond d'un axe et ses graduations, TOUTES ENTIÈRES.
 *
 * ⚠️ LA COURBE DE LA VUE D'ENSEMBLE ARRONDISSAIT À LA DIZAINE PUIS DIVISAIT PAR
 * QUATRE : ses graduations valaient 2,5 et 7,5, écrites « 3 » et « 8 » — des
 * repères faux de un demi, mesurés sur la capture du 14/09/2026. Le pas est
 * désormais choisi parmi 1, 2 et 5 fois une puissance de dix, et le plafond en
 * est un multiple exact : chaque graduation tombe sur un entier qu'on peut lire.
 */
export function echelle(maximum: number, intervalles: number): { plafond: number; graduations: number[] } {
  // Un pas d'au moins UN : on compte des objets, et un axe à 0,5 commande n'a pas de sens.
  const brut = Math.max(maximum, intervalles) / intervalles;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = ([1, 2, 5, 10].map((m) => m * puissance).find((p) => p >= brut) ?? 10 * puissance);
  const plafond = pas * intervalles;
  return {
    plafond,
    graduations: Array.from({ length: intervalles + 1 }, (_, k) => plafond - k * pas),
  };
}

/**
 * `AAAA-MM-JJ` → « 13 sept. », « Sep 13 », « 9月13日 » — la date d'un repère,
 * DANS LA LANGUE DE LA PAGE.
 *
 * ⚠️ LES MOIS ÉTAIENT ÉCRITS EN DUR, EN FRANÇAIS : la vue d'ensemble chinoise
 * affichait « 15 août ». Le formateur de la requête les nomme, et le fuseau
 * est FORCÉ À UTC : la base rend un JOUR déjà résolu en UTC, et le relire dans
 * le fuseau du serveur le ferait reculer d'un jour pour la moitié du globe.
 */
export function jourCourt(format: Awaited<ReturnType<typeof getFormatter>>, jour: string): string {
  return format.dateTime(new Date(`${jour}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
}
