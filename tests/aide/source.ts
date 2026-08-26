/**
 * Dépollution du code source avant tout contrôle de motif.
 *
 * DÉFAUT RÉEL, ET IL AVEUGLAIT LA SONDE QUI COMPTE LE PLUS SUR LE SUIVI.
 *
 * Trois sondes retiraient les commentaires de ligne avec `/\/\/.*$/gm`, non
 * ancré. Ce motif ne dit pas « une ligne qui COMMENCE par // », il dit « deux
 * barres obliques, où qu'elles soient ». Vérifié par exécution :
 *
 *   const BASE = "https://api.17track.net/track/v2.4";
 *
 * devient
 *
 *   const BASE = "https:
 *
 * Le nom de domaine du fournisseur de suivi était donc INTROUVABLE dans tout le
 * dépôt dépollué — et la sonde chargée de garantir « un port, pas une API »,
 * c'est-à-dire qu'un seul fichier connaisse jamais le fournisseur, était aveugle
 * au SEUL cas qui puisse réellement se produire : une URL écrite en dur.
 *
 * C'est L-031 rendu concret dans les deux sens. Un motif de garde doit
 * s'appliquer au CODE, commentaires retirés — sinon il se satisfait du
 * commentaire qui décrit la garde. Mais une dépollution trop gourmande fait
 * l'inverse : elle efface le code que la garde devait voir, et le vert qu'elle
 * rend est indiscernable d'un vert mérité.
 *
 * Le témoin de `tests/unit/depollution.test.ts` fixe cette différence, avec une
 * chaîne que l'ancien motif détruisait et que celui-ci conserve.
 */

/** Retire les commentaires de bloc, puis les seules lignes qui n'ont QUE du commentaire. */
export function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
