/**
 * L'ENTRÉE DE CHAQUE ÉCRAN DE L'ESPACE VENDEUR.
 *
 * Un `template` est remonté à chaque changement d'écran, là où le layout (la
 * coque) survit : c'est exactement la chorégraphie de la maquette (`coque.js`,
 * `aller`), la colonne et la barre du haut restent, seul le contenu entre — en
 * 240 ms sur 10 px, dans le sens du menu (`data-sens`, posé au clic par
 * `NavigationVendeur`). Sous mouvement réduit, un fondu de 160 ms.
 *
 * L'animation est en `backwards`, pas `both` : finie, elle ne reste pas active,
 * donc l'écran ne garde pas de calque ni de transformation (une transformation
 * active ferait de ce bloc le repère des éléments `fixed` qu'il contient).
 */
export default function TemplateApplication({ children }: { children: React.ReactNode }) {
  return <div className="entree-ecran">{children}</div>;
}
