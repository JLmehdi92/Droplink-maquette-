/**
 * Met un nombre d'octets à l'échelle, sans le mettre en forme.
 *
 * La fonction rend un NOMBRE et une UNITÉ, jamais une chaîne : le nombre est mis
 * en forme par `next-intl` — séparateur décimal compris, qui n'est pas le même
 * en français et en anglais — et l'unité vient du catalogue de traduction, parce
 * que « Ko » s'écrit « KB » ailleurs. Composer la chaîne ici obligerait à la
 * recomposer dans chaque écran, ou à s'en passer.
 *
 * BASE 1000, PAS 1024. C'est la base qu'emploient les fournisseurs de stockage
 * dans leurs factures : afficher des Gio là où l'on paye des Go ferait diverger
 * notre écran de la seule référence qui compte, d'environ 7 % — assez pour faire
 * douter, trop peu pour être vu.
 */

export type UniteOctets = "o" | "Ko" | "Mo" | "Go" | "To";

const UNITES: readonly UniteOctets[] = ["o", "Ko", "Mo", "Go", "To"];

export interface OctetsMisALEchelle {
  readonly valeur: number;
  readonly unite: UniteOctets;
  /** Décimales à afficher : aucune sous le Mo, où le dixième n'apprend rien. */
  readonly decimales: number;
}

export function mettreOctetsALEchelle(octets: number): OctetsMisALEchelle {
  // Une valeur négative ou non finie ne peut pas venir de la base — la colonne
  // porte une contrainte. Elle est bornée ici quand même : une mise en forme qui
  // compte sur la validation d'une AUTRE couche disparaît le jour où cette
  // couche change, et personne ne fait le lien.
  const sains = Number.isFinite(octets) && octets > 0 ? octets : 0;

  let rang = 0;
  let valeur = sains;
  while (valeur >= 1000 && rang < UNITES.length - 1) {
    valeur /= 1000;
    rang += 1;
  }

  const unite = UNITES[rang] ?? "o";
  // Sous le Mo, un dixième de kilo-octet n'apprend rien à personne ; au-delà, il
  // sépare 1,2 Go de 1,9 Go, ce qui est exactement la décision qu'on prend en
  // regardant cet écran.
  return { valeur, unite, decimales: rang >= 2 ? 1 : 0 };
}
