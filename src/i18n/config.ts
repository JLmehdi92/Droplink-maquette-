/**
 * Langues du produit. FR et EN dès le MVP, pas en rattrapage ; `zh-CN` depuis
 * le 06/09/2026.
 *
 * La page publique `/p/[token]` vit HORS du segment `[locale]` : la langue y est
 * celle du VENDEUR, pas de l'URL. Un client à qui on envoie un lien ne la
 * choisit pas, et une URL localisée créerait deux adresses pour un jeton censé
 * être unique.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LE CHINOIS, ET POURQUOI `zh-CN` PLUTÔT QUE `zh-Hans`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce n'est pas une langue de plus : c'est celle du persona qui porte le
 * VOLUME. Le fournisseur de Guangzhou fait 100 à 300 commandes par semaine
 * quand le revendeur en fait 20 à 80 par mois, et Google lui est inaccessible.
 *
 * `zh-Hans` désigne le script simplifié indépendamment du pays et serait plus
 * correct linguistiquement. Il est écarté pour une raison MESURÉE : le filtre
 * pré-emptif du middleware n'accepte qu'un sous-tag de DEUX lettres.
 *
 *     /zh-CN/admin      reconnu       /zh-Hans/admin     NON reconnu
 *
 * Avec `zh-Hans`, la couche qui rend 404 sur l'admin — celle qui empêche la
 * surface d'EXISTER pour qui n'y a pas droit — disparaîtrait sans un seul
 * signal. Voir `lib/routes/vise-admin.ts` et sa garde, qui éprouve la CAPACITÉ
 * du motif et non les seules langues du moment.
 *
 * ⚠️ CE TYPE SE PROPAGE, ET C'EST VOULU. Ajouter une valeur ici fait rougir le
 * compilateur partout où quelqu'un a écrit `"fr" | "en"` à la main au lieu de
 * `Langue`. Ce sont exactement les endroits qu'aucune relecture ne trouve.
 *
 * ⚠️ ET CE QUE LE COMPILATEUR NE VOIT PAS EST PLUS DANGEREUX : les contraintes
 * SQL (migration 144), les `z.enum(["fr","en"])` — dont deux avec `.catch("fr")`
 * qui REPLIENT EN SILENCE —, et un `<select>` dont la valeur ne correspond à
 * aucune option affiche la première. Chacun est traité, aucun ne l'était par
 * une erreur de type.
 */
export const LANGUES = ["fr", "en", "zh-CN"] as const;

export type Langue = (typeof LANGUES)[number];

export const LANGUE_DEFAUT: Langue = "fr";

export function estLangueSupportee(valeur: string): valeur is Langue {
  return (LANGUES as readonly string[]).includes(valeur);
}
