/**
 * Délai plancher, pour que le CHRONOMÈTRE ne dise rien de plus que la réponse.
 *
 * Mesuré sur le vrai projet Supabase, avec `shouldCreateUser: false` :
 *
 *   email SANS compte   ->  49 ms
 *   email AVEC compte   -> 778 ms
 *
 * Seize fois. Le chemin « pas de compte » court-circuite avant même de tenter
 * une remise. Uniformiser les messages d'erreur n'aurait donc rien réglé : il
 * serait resté un oracle parfaitement lisible depuis l'extérieur, et on aurait
 * cru le trou bouché. C'est la même discipline que le brief impose à la page
 * publique — comparer l'ORDRE DE GRANDEUR DU DÉLAI, pas seulement le corps de
 * la réponse.
 *
 * Le plancher est un MINIMUM, pas une pause ajoutée : une opération plus longue
 * que le plancher n'attend pas davantage. Ce qui trahissait était l'écart
 * SYSTÉMATIQUE entre deux chemins ; la variabilité qui subsiste au-dessus du
 * plancher affecte les deux de la même façon, donc n'apprend rien.
 */

/**
 * 1 200 ms : au-dessus du chemin lent observé (778 ms) avec de la marge, et
 * en dessous du seuil où l'attente devient perceptible comme une panne.
 */
export const PLANCHER_AUTH_MS = 1200;

export function dormir(ms: number): Promise<void> {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

/**
 * Attend le temps qu'il faut pour que la durée totale depuis `debut` atteigne
 * `plancherMs`. Ne fait rien si le plancher est déjà dépassé.
 */
export async function attendrePlancher(
  debut: number,
  plancherMs: number = PLANCHER_AUTH_MS,
  maintenant: () => number = Date.now,
): Promise<void> {
  const ecoule = maintenant() - debut;
  const reste = plancherMs - ecoule;
  if (reste > 0) await dormir(reste);
}
