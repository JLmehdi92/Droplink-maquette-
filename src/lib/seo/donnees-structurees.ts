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
 * **Aucun `logo`, aucune `image`.** `public/` ne contient que les polices — il
 * n'existe pas de fichier de logo. Pointer vers une URL qui rend 404 vaudrait
 * moins que ne rien dire : *une information absente est OMISE, jamais remplacée
 * par une valeur inventée* (décision 26).
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
