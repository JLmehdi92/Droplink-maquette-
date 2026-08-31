/**
 * Substitue un jeton dans un gabarit, SANS interpréter les motifs de `$`.
 *
 * ⚠️ POURQUOI CE MODULE EXISTE. `String.prototype.replace` avec une chaîne de
 * remplacement interprète `$&`, `` $` ``, `$'` et `$n` comme des MOTIFS DE
 * SUBSTITUTION. Or les valeurs substituées ici sont du texte libre écrit par le
 * vendeur — `shops.name` n'est borné que par une longueur, et
 * `orders.customer_label` est un pseudo libre par décision produit :
 *
 *     "Retrouvez {nom}".replace("{nom}", "Rock $& Roll")  →  "Retrouvez Rock {nom} Roll"
 *     "Retrouvez {nom}".replace("{nom}", "A$`B")          →  "Retrouvez ARetrouvez B"
 *
 * La phrase corrompue n'apparaît QUE sur la page du client : le vendeur ne la
 * verra jamais. Et `replace` ne substitue que la PREMIÈRE occurrence, donc une
 * traduction future portant deux fois le même jeton passerait la parité et
 * rendrait un gabarit à moitié substitué.
 *
 * `split().join()` ne connaît aucun motif et remplace TOUTES les occurrences.
 */
export function substituer(gabarit: string, jeton: string, valeur: string): string {
  return gabarit.split(jeton).join(valeur);
}
