/**
 * Un graphe JSON-LD rendu CÔTÉ SERVEUR : Google traite les données structurées
 * injectées par JavaScript avec retard. Seul `<` est neutralisé — il pourrait
 * fermer la balise ; les valeurs viennent des catalogues, jamais d'une saisie.
 */
export function GrapheJsonLd({ graphe }: { graphe: Record<string, unknown> | null }) {
  if (graphe === null) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graphe).replace(/</g, "\\u003c") }}
    />
  );
}
