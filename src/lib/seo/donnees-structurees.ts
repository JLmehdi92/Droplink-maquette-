import { LANGUES, type Langue } from "@/i18n/config";
import { origineConfiguree } from "@/lib/site";

/**
 * LES DONNÉES STRUCTURÉES (JSON-LD) — IL N'Y EN AVAIT AUCUNE.
 *
 * Mesuré sur la production le 08/09/2026 : `application/ld+json` apparaissait
 * **zéro fois** dans le HTML servi de `https://droplink.fr/fr`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ÇA COMPTE PLUS ICI QUE SUR UN GROS SITE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DropLink a douze URL indexables et un domaine de septembre 2026. Il ne
 * prendra pas la première place sur une requête générique — Google classe aussi
 * sur l'ampleur et l'ancienneté, et aucun balisage ne compense ça.
 *
 * Ce que le balisage change vraiment, c'est la **citation par les moteurs de
 * réponse** : AI Overviews, ChatGPT, Perplexity. Là, ce qui compte est de
 * pouvoir répondre sans ambiguïté à « qu'est-ce que c'est, qui l'édite, à qui
 * ça s'adresse » — une question de clarté, pas de volume. C'est le seul terrain
 * où un petit site bien décrit gagne réellement contre un gros mal décrit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE QUI N'EST PAS DÉCLARÉ, ET POURQUOI CHAQUE ABSENCE EST UNE DÉCISION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Aucun `offers`, donc aucun prix.** `SoftwareApplication` accepte un bloc
 * `offers`, et Google le demande pour ses résultats enrichis. On ne le pose
 * pas : le produit ne connaît **aucune notion de prix** — pas de table, pas de
 * code de facturation, c'est une contrainte verrouillée du brief. Déclarer
 * « price: 0 » serait affirmer dans des données lisibles par une machine ce que
 * la base n'a jamais enregistré (principe XII), et cette affirmation
 * deviendrait fausse en phase 2 **avant que quiconque pense à la relire**. Une
 * absence est réversible ; une donnée structurée périmée circule.
 *
 * **Un `logo`, depuis le 03/10/2026.** Ce bloc disait « aucun logo : `public/`
 * ne contient que les polices ». Ce n'est plus vrai : la refonte a posé
 * `public/marque/logo-symbole.png` (520 × 724), le symbole que `LogoDropLink`
 * affiche sur toutes les pages.
 * La règle d'origine tient toujours — *une information absente est OMISE,
 * jamais remplacée par une valeur inventée* (décision 26) — mais celle-ci
 * n'est plus absente.
 *
 * **Aucune `FAQPage`, aucun `HowTo`.** Le premier exigerait des questions
 * réellement présentes sur la page ; le second est un type que Google a
 * déprécié. Baliser du contenu qui n'existe pas à l'écran est la définition du
 * balisage trompeur, et c'est sanctionné.
 */

/** Le graphe JSON-LD d'une page, prêt à être sérialisé. */
export function donneesStructurees(
  langue: Langue,
  textes: { readonly nom: string; readonly description: string },
): Record<string, unknown> | null {
  const origine = origineConfiguree();

  // Sans origine, pas de `@id` stable : un graphe dont les identifiants
  // changent d'un environnement à l'autre ne peut pas être recoupé, et vaut
  // moins que pas de graphe du tout.
  if (origine === null) return null;

  const idOrganisation = `${origine}/#organisation`;
  const idSite = `${origine}/#site`;

  return {
    "@context": "https://schema.org",
    /*
     * UN `@graph` PLUTÔT QUE TROIS BLOCS SÉPARÉS. Les trois entités se citent
     * par `@id` : le site est publié PAR l'organisation, l'application est
     * éditée par elle. Trois blocs indépendants décriraient trois choses sans
     * lien, et un moteur qui cherche « qui édite ce site » n'aurait pas la
     * réponse.
     */
    "@graph": [
      {
        "@type": "Organization",
        "@id": idOrganisation,
        name: "DropLink",
        url: origine,
        logo: `${origine}/marque/logo-symbole.png`,
      },
      {
        "@type": "WebSite",
        "@id": idSite,
        url: origine,
        name: "DropLink",
        description: textes.description,
        publisher: { "@id": idOrganisation },
        /*
         * LES TROIS LANGUES, ET LA COURANTE EN PREMIER. `inLanguage` accepte
         * une liste ; la déclarer complète dit qu'il s'agit d'UN site en trois
         * langues, ce que hreflang affirme déjà en balises. Les deux signaux se
         * confirment au lieu de se contredire.
         */
        inLanguage: [langue, ...LANGUES.filter((l) => l !== langue)],
      },
      {
        "@type": "SoftwareApplication",
        name: textes.nom,
        description: textes.description,
        url: `${origine}/${langue}`,
        applicationCategory: "BusinessApplication",
        // Le destinataire d'un lien n'installe rien et n'a aucun compte : le
        // produit s'ouvre dans un navigateur, sur n'importe quel appareil.
        operatingSystem: "Web",
        inLanguage: langue,
        publisher: { "@id": idOrganisation },
      },
    ],
  };
}

/**
 * Le graphe d'un article de blog.
 *
 * ⚠️ `Article` ET NON `BlogPosting`, ET C'EST DÉLIBÉRÉ. Les deux sont valides ;
 * `BlogPosting` est plus précis, et c'est justement le problème — il promet un
 * flux régulier. Cinq articles publiés le même jour, sans engagement de
 * cadence, décrivent mieux une base de connaissances qu'un blog vivant. On
 * pourra resserrer le jour où la cadence existe ; l'inverse (avoir promis un
 * blog et l'abandonner) ne se rattrape pas.
 *
 * ⚠️ AUCUN `author` NOMMÉ. Le brief interdit d'exposer une personne, et une
 * organisation suffit à répondre à « qui dit ça » — c'est la question que les
 * moteurs de réponse posent. Inventer un nom d'auteur pour cocher une case
 * serait exactement le genre de donnée structurée fausse qui circule.
 */
export function donneesArticle(
  langue: Langue,
  article: {
    readonly slug: string;
    readonly titre: string;
    readonly description: string;
    readonly date: string;
  },
): Record<string, unknown> | null {
  const origine = origineConfiguree();
  if (origine === null) return null;

  const url = `${origine}/${langue}/blog/${article.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": url,
    headline: article.titre,
    description: article.description,
    inLanguage: langue,
    datePublished: article.date,
    /*
     * ⚠️ `dateModified` VAUT LA DATE DE PUBLICATION, PAS « MAINTENANT ».
     * Une date engendrée à la volée annoncerait un article remanié à chaque
     * requête — c'est le principe XII appliqué aux moteurs : on n'affirme pas
     * une fraîcheur que rien n'a enregistrée. Google traite d'ailleurs une
     * `dateModified` non fiable comme du bruit et cesse de la lire.
     */
    dateModified: article.date,
    // Le fil d'Ariane appartient à la PAGE (`WebPage.breadcrumb`), pas à l'article :
    // schema.org ne le connaît pas sur `Article`.
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "DropLink", item: `${origine}/${langue}` },
          { "@type": "ListItem", position: 2, name: "Le blog", item: `${origine}/${langue}/blog` },
          { "@type": "ListItem", position: 3, name: article.titre, item: url },
        ],
      },
    },
    publisher: { "@id": `${origine}/#organisation` },
    // L'auteur est l'ORGANISATION, par `@id` (audit SEO du 03/10/2026) : Google
    // attend un `author` sur un article, et la réponse vraie existait déjà
    // ci-dessus — sans nom de personne.
    author: { "@id": `${origine}/#organisation` },
    // L'image d'aperçu réellement servie en Open Graph (1200 × 630).
    image: `${origine}/og-droplink.jpg`,
  };
}

/** Le type schema.org d'une page secondaire. Liste fermée : rien qui promette un résultat enrichi. */
export type TypeDePage = "WebPage" | "ContactPage" | "CollectionPage";

/**
 * Le graphe d'une page SECONDAIRE (tarifs, pages légales, guide, signalement, blog).
 *
 * ⚠️ AJOUTÉ PAR L'AUDIT SEO DU 03/10/2026 : seules la landing et les articles
 * portaient un graphe. Les autres pages publiques n'en avaient AUCUN, et rien ne
 * les rattachait au site ni à l'organisation déclarés sur la landing.
 *
 * On ne décrit que ce que la page EST : son nom, sa description (celle de ses
 * balises, sauf `/tarifs` qui donne son chapeau : sa balise porte un montant),
 * sa langue, le site dont elle fait partie (par `@id`, sans
 * redéclarer l'entité) et son fil d'Ariane. Aucune note, aucun avis, aucun
 * montant — le test `seo.test.ts` refuse ces mots dans ce fichier.
 *
 * Le fil d'Ariane a deux maillons, ou trois quand la page a un parent (un
 * article sous le blog) : la racine s'appelle « DropLink », une marque qui ne
 * se traduit pas, ce qui évite un libellé de plus dans trois catalogues.
 */
export function donneesPage(
  langue: Langue,
  chemin: string,
  textes: { readonly nom: string; readonly description: string },
  type: TypeDePage = "WebPage",
  parent?: { readonly nom: string; readonly chemin: string },
): Record<string, unknown> | null {
  const origine = origineConfiguree();
  if (origine === null) return null;

  const url = `${origine}/${langue}${chemin}`;
  const maillons = [
    { nom: "DropLink", url: `${origine}/${langue}` },
    ...(parent === undefined ? [] : [{ nom: parent.nom, url: `${origine}/${langue}${parent.chemin}` }]),
    { nom: textes.nom, url },
  ];
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": url,
    url,
    name: textes.nom,
    description: textes.description,
    inLanguage: langue,
    isPartOf: { "@id": `${origine}/#site` },
    publisher: { "@id": `${origine}/#organisation` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: maillons.map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: m.nom,
        item: m.url,
      })),
    },
  };
}
