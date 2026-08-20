/**
 * Langues du produit. FR et EN dès le MVP, pas en rattrapage.
 *
 * La page publique `/p/[token]` vit HORS du segment `[locale]` : la langue y est
 * celle du VENDEUR, pas de l'URL. Un client à qui on envoie un lien ne la
 * choisit pas, et une URL localisée créerait deux adresses pour un jeton censé
 * être unique.
 */
export const LANGUES = ["fr", "en"] as const;

export type Langue = (typeof LANGUES)[number];

export const LANGUE_DEFAUT: Langue = "fr";

export function estLangueSupportee(valeur: string): valeur is Langue {
  return (LANGUES as readonly string[]).includes(valeur);
}
