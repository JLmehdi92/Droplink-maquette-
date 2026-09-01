/**
 * FAÇADE TYPÉE DU TRANSPORT DU HARNAIS.
 *
 * La logique vit dans `scripts/transport.mjs` — voir son en-tête pour le
 * pourquoi. Elle y est parce que `pnpm fumee`, qui est un script `.mjs`, doit
 * pouvoir la lire lui aussi : une règle écrite à deux endroits est une règle
 * qu'un seul des deux appliquera.
 *
 * Ce fichier n'ajoute que le type que JSDoc ne porte pas commodément, et le
 * point d'entrée unique attendu par les suites.
 */
export {
  estReseauInstable,
  fetchResilient,
  hoteDe,
  installerTransportResilient,
  patienter,
  refusDHote,
} from "../../scripts/transport.mjs";

/**
 * `status` peut être absent, et `exactOptionalPropertyTypes` distingue « absent »
 * de « vaut undefined ». Le déclarer explicitement évite d'élargir le type de
 * retour de la bibliothèque pour lui faire accepter un contrat plus étroit.
 */
export interface ErreurAuth {
  readonly status?: number | undefined;
  readonly message: string;
}
