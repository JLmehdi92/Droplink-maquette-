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
 * ÉTAT ÉTABLI PAR EXÉCUTION (sonde de fumée, sur un build de production servi).
 * La page publique lit les en-têtes de la requête pour la limitation de débit :
 * elle est donc DYNAMIQUE, elle répond `private, no-cache, no-store`, et une
 * mutation faite EN BASE — en contournant l'application, donc sans qu'aucune
 * invalidation ne soit déclenchée — est servie en 0,2 seconde. Aucune étiquette
 * n'est posée nulle part aujourd'hui, et ces appels ne trouvent donc rien à
 * invalider : ils sont corrects et sans effet.
 *
 * CE N'EST PAS UNE PROTECTION, C'EST UNE ABSENCE DE CACHE. Elle disparaîtrait le
 * jour où quelqu'un envelopperait la lecture publique dans un cache de données —
 * la page resterait dynamique, l'en-tête resterait le bon, et le client verrait
 * l'ancienne commande. Ce qui tient la promesse est donc la sonde de fumée, qui
 * compare le CONTENU SERVI après mutation, et non ce fichier. Les deux
 * falsifications qui l'ont éprouvée sont un cache de lecture sans étiquette, et
 * un en-tête `public, max-age=600` : la première laisse l'en-tête intact, la
 * seconde laisse le contenu frais. Aucun des deux contrôles ne suffit seul.
 */
export function etiquetteCommandePublique(jeton: string): string {
  return "commande-publique:" + jeton;
}
