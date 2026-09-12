/**
 * LA RÉFÉRENCE COURTE D'UNE COMMANDE — ce que le kit écrit « #DLK7842 ».
 *
 * ⚠️ ELLE A SON PROPRE DOMICILE DEPUIS LE 12/09/2026. Elle vivait dans
 * `tableau-commandes.tsx`, c'est-à-dire dans l'écran qui l'a fait naître ;
 * l'éditeur de commande l'emploie désormais aussi, et une règle d'identité
 * partagée par deux écrans qui habite l'un des deux finit par être recopiée
 * dans l'autre. Le corps et le raisonnement sont inchangés.
 *
 * ⚠️ ELLE EST DÉRIVÉE DE L'IDENTIFIANT, PAS STOCKÉE, ET C'EST UN ARBITRAGE.
 * Un numéro séquentiel par boutique se lirait mieux — « commande 42 » se dit au
 * téléphone — mais il exige une colonne, un compteur par boutique pour éviter
 * la course à l'insertion, un reprise de l'existant, et une migration qui ne
 * serait appliquée en production que le jour d'un déploiement. Pour un gain de
 * LISIBILITÉ sur une référence qu'on copie plus qu'on ne récite, c'est cher.
 *
 * Les six derniers caractères de l'identifiant sont STABLES à VIE — aucune
 * édition ne les change — et ils ne divulguent rien : cet identifiant est déjà
 * dans l'URL que le vendeur a sous les yeux. Ce n'est pas le `public_token`, qui
 * transfère une capacité et ne doit jamais servir d'étiquette.
 *
 * Le jour où un numéro séquentiel sera décidé, il remplace cette fonction sans
 * toucher à une seule colonne de l'écran.
 */
export function referenceCourte(id: string): string {
  return "#" + id.replace(/-/g, "").slice(-6).toUpperCase();
}
