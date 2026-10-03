/**
 * RELIRE L'HISTORIQUE JUSQU'À CE QUE LA LIGNE NOUVELLE SOIT LÀ (contre-audit du 03/10/2026).
 *
 * Le journal d'une modification s'écrit APRÈS la réponse (`journaliserApres`, `after()`) :
 * une seule relecture à 700 ms pouvait arriver avant lui, et la ligne manquait jusqu'au
 * rechargement. On relit donc à 700 ms, 1,5 s puis 3 s après le geste, et l'on s'arrête dès
 * que la ligne la plus récente n'est plus celle qu'on connaissait. Au-delà, l'historique
 * affiché reste celui d'avant : il est vrai, simplement en retard.
 *
 * On compare l'IDENTIFIANT de la ligne la plus récente, pas un nombre de lignes : la lecture
 * est plafonnée (`PLAFOND_HISTORIQUE`), et au plafond le nombre n'augmente plus.
 *
 * Module pur (aucun import serveur ni React) : les délais et l'appel sont injectés, la
 * logique se teste sans horloge réelle.
 */
export const DELAIS_RELECTURE_MS = [700, 1500, 3000] as const;

export interface Relue {
  /** L'identifiant de la ligne la plus récente de l'historique relu. */
  readonly plusRecent: string;
}

export async function relireJusquaNouveau<T extends Relue>(options: {
  readonly relire: () => Promise<T | null>;
  /** La ligne la plus récente déjà affichée (`null` : aucune). */
  readonly connu: string | null;
  readonly attendre: (ms: number) => Promise<void>;
  /** Vrai quand l'écran a changé de commande ou qu'un nouveau geste a relancé la série. */
  readonly abandonne: () => boolean;
}): Promise<T | null> {
  let ecoule = 0;
  for (const echeance of DELAIS_RELECTURE_MS) {
    await options.attendre(echeance - ecoule);
    ecoule = echeance;
    if (options.abandonne()) return null;
    const relue = await options.relire();
    if (options.abandonne()) return null;
    if (relue !== null && relue.plusRecent !== options.connu) return relue;
  }
  return null;
}
