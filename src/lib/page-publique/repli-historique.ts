/**
 * L'HISTORIQUE LONG SE REPLIE — la règle, à un seul endroit.
 *
 * Demande de Wassim, 26/09/2026 : « c'est moche que l'on voie toute la liste de
 * l'historique du suivi débordée comme ça ». Un colis venu de Chine en compte
 * trente ; la carte en montrait trente, du plus récent au plus ancien.
 *
 * Au-delà de SIX étapes, la page montre les CINQ plus récentes et garde le reste
 * pour « Voir tout ». À six ou moins, rien n'est caché : un bouton pour révéler
 * une seule ligne coûterait plus de place qu'il n'en fait gagner. Les valeurs
 * sont celles de la planche (`ui_kits/client_link`, état `#historique-long`).
 *
 * Les étapes arrivent triées du plus récent au plus ancien
 * (`lire_passages_publics` les ordonne par `occurred_at desc`) : les « premières »
 * sont donc les plus récentes, et ce module n'a pas à re-trier.
 */
export const HISTORIQUE_SEUIL = 6;
export const HISTORIQUE_VISIBLES = 5;

export function replierHistorique<T>(etapes: readonly T[]): {
  readonly visibles: readonly T[];
  readonly reste: readonly T[];
} {
  if (etapes.length <= HISTORIQUE_SEUIL) return { visibles: etapes, reste: [] };
  return { visibles: etapes.slice(0, HISTORIQUE_VISIBLES), reste: etapes.slice(HISTORIQUE_VISIBLES) };
}
