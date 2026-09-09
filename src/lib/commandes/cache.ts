import "server-only";
import { revalidateTag } from "next/cache";

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

/**
 * INVALIDE LA PAGE PUBLIQUE D'UNE COMMANDE.
 *
 * ⚠️ LE PROFIL EST `{ expire: 0 }`, ET CE N'EST PAS INTERCHANGEABLE. Next 16 a
 * rendu obligatoire un second argument à `revalidateTag`, et sa documentation
 * recommande `"max"` — c'est-à-dire : servir le contenu périmé pendant un an
 * pendant que la revalidation tourne en arrière-plan. Ce défaut-là est
 * excellent pour un catalogue ou un billet de blog.
 *
 * IL SERAIT ICI EXACTEMENT LE MODE DE DÉFAILLANCE QUE LE BRIEF §12 DÉCRIT. Ces
 * étiquettes servent la coupure de suspension — la capacité technique qui fonde
 * notre statut d'hébergeur — et la révocation d'un lien fuité. Avec `"max"`, un
 * compte suspendu continuerait d'être servi depuis le cache, un lien révoqué
 * resterait ouvert, et RIEN NE LE DIRAIT : la suspension s'enregistre, l'audit
 * la consigne, l'écran affiche « suspendu ». Tout dit que le compte est coupé.
 * Il ne l'est pas.
 *
 * `{ expire: 0 }` est le seul profil qui reproduise le comportement de Next 15 :
 * le contenu périmé n'est jamais servi, la requête suivante attend la
 * revalidation. Sur une page vue une fois par un client, cette attente ne coûte
 * rien ; l'inverse coûterait notre statut d'hébergeur.
 *
 * ⚠️ ET CE FICHIER NE PROTÈGE TOUJOURS RIEN À LUI SEUL — voir la note ci-dessus :
 * aucune étiquette n'est posée aujourd'hui, ces appels sont corrects et sans
 * effet. Ce qui tient la promesse est la sonde de fumée qui compare le CONTENU
 * SERVI après mutation. Le profil est choisi pour le jour où un cache existera.
 */
export function invaliderCommandePublique(jeton: string): void {
  revalidateTag(etiquetteCommandePublique(jeton), { expire: 0 });
}
