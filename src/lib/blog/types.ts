/**
 * LE BLOG — sa forme, et pourquoi elle est en TypeScript plutôt qu'en Markdown.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE BLOG EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La passe SEO du 08/09/2026 a rendu le site techniquement irréprochable :
 * robots, plan de site, canoniques, hreflang, données structurées. Et ça ne
 * suffit pas. Google classe sur la pertinence technique — c'est fait —, sur le
 * CONTENU, et sur la confiance. Le produit avait douze URL et **aucune page qui
 * réponde à une question**. Un site qui ne dit rien de plus que ce qu'il vend
 * ne prend la place de personne.
 *
 * ⚠️ ET LE VOCABULAIRE EST BORNÉ. Le principe II interdit « rep », « replica »,
 * « batch », « W2C », toute marque de luxe et tout nom d'agent — c'est-à-dire
 * exactement les mots que ce marché tape le plus. Les articles visent donc la
 * brèche décrite au brief §2 : le vendeur SANS boutique, que ni QualiShip, ni
 * WelcomeTrack, ni AfterShip ne servent, parce qu'ils supposent tous Shopify ou
 * WooCommerce.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DES BLOCS TYPÉS, PAS DU MARKDOWN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le réflexe serait un fichier `.md` et une bibliothèque pour le rendre. Trois
 * raisons de ne pas le faire ici :
 *
 *   1. **Aucune dépendance à ajouter.** Le dépôt n'en a aucune pour ça, et le
 *      budget de la page publique a déjà fait écrire le visionneur à la main
 *      contre 40 à 90 Ko de bibliothèque. Un article est une page publique.
 *   2. **Le compilateur vérifie.** L'union ci-dessous est exhaustive : un bloc
 *      d'un type inconnu ne compile pas, et le `switch` du rendu non plus s'il
 *      en oublie un. Un Markdown mal formé, lui, rend du texte cassé en
 *      silence.
 *   3. **Rien n'est interprété.** Aucun HTML brut ne traverse ce chemin, donc
 *      aucun `dangerouslySetInnerHTML` — le seul du produit reste le JSON-LD.
 *
 * ⚠️ CE QUE ÇA COÛTE, ET C'EST ASSUMÉ : écrire un article est plus verbeux
 * qu'en Markdown. C'est le prix d'un contenu qui ne peut pas se rendre à
 * moitié.
 */

/** Un bloc d'article. L'union est FERMÉE : le rendu les traite tous. */
export type Bloc =
  /** Le paragraphe d'accroche, rendu plus grand. Un seul par article. */
  | { readonly type: "chapeau"; readonly texte: string }
  /** Un intertitre — rendu en `<h2>`, et repris dans le sommaire. */
  | { readonly type: "titre"; readonly texte: string }
  | { readonly type: "paragraphe"; readonly texte: string }
  /** La phrase qu'on retient, isolée sur son filet violet. */
  | { readonly type: "citation"; readonly texte: string }
  | { readonly type: "liste"; readonly items: readonly string[] };

export type Article = {
  /** Le segment d'URL. Minuscules, tirets, sans accent — il vit dans une URL. */
  readonly slug: string;
  /** Le `<h1>` de la page. Il peut être long : rien ne le tronque. */
  readonly titre: string;
  /**
   * Le `<title>`, quand le `<h1>` est trop long pour lui.
   *
   * ⚠️ MESURÉ SUR LES CINQ PREMIERS ARTICLES : trois `<title>` dépassaient 60
   * caractères une fois le suffixe « — DropLink » ajouté, dont deux à 83 et 84.
   * Google tronque autour de 60 — et il tronque LA FIN, c'est-à-dire l'endroit
   * où l'on met naturellement le mot qu'on vise.
   *
   * Le `<h1>` n'a pas cette contrainte : il est lu en entier, sur la page. Les
   * séparer permet un titre expressif à l'écran ET un titre court en résultat
   * de recherche, au lieu d'un compromis mauvais des deux côtés. Absent, le
   * `<h1>` est repris tel quel.
   */
  readonly titreMeta?: string;
  /**
   * La `<meta name="description">`.
   *
   * ⚠️ ELLE N'EST PAS LE CHAPEAU. Le chapeau s'adresse à qui a déjà cliqué ; la
   * description s'adresse à qui hésite dans une liste de résultats. Les
   * confondre fait écrire l'une des deux pour le mauvais lecteur.
   */
  readonly description: string;
  /** Le résumé affiché sur la carte de l'index. */
  readonly resume: string;
  /** ISO `AAAA-MM-JJ`. Sert la date affichée ET le JSON-LD. */
  readonly date: string;
  /** Durée de lecture annoncée, en minutes. */
  readonly minutes: number;
  /** L'étiquette de la pilule violette. */
  readonly etiquette: string;
  readonly blocs: readonly Bloc[];
};
