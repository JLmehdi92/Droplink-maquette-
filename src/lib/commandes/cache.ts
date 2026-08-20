import "server-only";

/**
 * ÉTIQUETTES DE CACHE DES PAGES PUBLIQUES.
 *
 * Le nom est dérivé du jeton, et vit dans CE fichier plutôt qu'à deux endroits :
 * une étiquette posée d'un côté et invalidée de l'autre sous un nom légèrement
 * différent ne lève rien. `revalidateTag` ne trouve simplement rien à invalider,
 * la mutation réussit, l'écran du vendeur affiche le nouvel état — et la page
 * publique continue d'être servie périmée. C'est le mode de défaillance le plus
 * trompeur du produit.
 *
 * ⚠️ TANT QUE `/p/[token]` N'EXISTE PAS, ces invalidations ne trouvent rien à
 * invalider, et c'est NORMAL. Ce qui ne l'est pas, ce serait de croire la chaîne
 * établie pour autant : au lot 6, il faudra prouver PAR EXÉCUTION que la page
 * EST mise en cache — le contre-test d'abord — puis qu'une mutation la coupe,
 * avec un seuil de 30 secondes.
 */
export function etiquetteCommandePublique(jeton: string): string {
  return "commande-publique:" + jeton;
}
