/**
 * L'EN-TÊTE D'UN ÉCRAN DE L'ESPACE VENDEUR : titre, sous-titre, et de la place à
 * droite pour les gestes propres à l'écran.
 *
 * IL EXISTE PARCE QU'IL Y EN AVAIT CINQ COPIES. Envois, analyses et marque
 * portaient chacun le même bloc recopié, et la liste des commandes gardait le
 * sien « parce qu'elle a une recherche et une action principale ». Cinq copies
 * d'un même bloc divergent toujours par la correction qu'on oublie de reporter
 * dans la cinquième — et c'est exactement ce qui s'est produit : la hauteur de
 * ligne du titre, les 3 px de marge du sous-titre au téléphone contre 5 px au
 * bureau, la bordure de bas de barre. Le prix pour n'en garder qu'une était une
 * propriété de plus, `dessous`.
 *
 * ⚠️ LA BARRE N'EST BLANCHE QUE SUR TÉLÉPHONE. Ce fichier a longtemps dit
 * « la barre est blanche et le contenu est gris », et le code suivait — sur les
 * deux largeurs. Les planches disent autre chose :
 *
 *   bureau  `padding: 26px 30px`, AUCUN fond, AUCUNE bordure — le titre repose
 *           sur le gris de la zone de travail, et 24 px le séparent du contenu ;
 *   mobile  `#ffffff`, `border-bottom: 1px solid #ececf0`, `16px 16px 14px`.
 *
 * La raison tient à la place : sur téléphone la barre est collée en haut et doit
 * se détacher de ce qui défile dessous ; sur bureau elle est déjà bornée par la
 * carte-page et la barre latérale, et un second filet la redécoupe pour rien.
 *
 * ⚠️ LES HAUTEURS DE LIGNE SONT ÉCRITES EN PIXELS, et ce n'est pas de la
 * coquetterie. Les planches ne posent aucune `line-height` : le titre y fait
 * 35 px pour 28 px de corps. Le produit héritait du 1,5 du corps de texte, donc
 * 42 px — sept pixels de plus, qui poussaient le sous-titre et tout ce qui suit.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  actions,
  dessous,
}: {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: React.ReactNode;
  /** Rendu sous la ligne du titre, pleine largeur — la recherche au téléphone. */
  readonly dessous?: React.ReactNode;
}) {
  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest px-margin-mobile pt-4 pb-3.5 md:border-0 md:bg-transparent md:px-[30px] md:pt-[26px] md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-[24px] leading-[30px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px] md:leading-[35px]">
            {titre}
          </h1>
          {sousTitre !== undefined ? (
            <p className="mt-[3px] font-body-sm text-[13px] leading-4 text-sourdine md:mt-[5px] md:text-[14px] md:leading-[17px]">
              {sousTitre}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {dessous}
    </header>
  );
}
