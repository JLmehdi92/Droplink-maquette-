/**
 * L'EN-TÊTE D'UN ÉCRAN DE L'ESPACE VENDEUR : barre blanche, titre, sous-titre,
 * et de la place à droite pour les gestes propres à l'écran.
 *
 * IL EXISTE PARCE QU'IL Y EN AVAIT QUATRE COPIES. Envois, analyses et marque
 * portaient chacun le même bloc, recopié — et trois copies d'un même bloc
 * divergent toujours par la correction qu'on oublie de reporter dans la
 * troisième. La liste des commandes garde le sien : il porte une recherche et
 * une action principale, et le généraliser pour un seul appelant aurait produit
 * un composant à cinq propriétés facultatives.
 *
 * ⚠️ LA BARRE N'EST BLANCHE QUE SUR TÉLÉPHONE. Ce commentaire a longtemps dit
 * « la barre est blanche et le contenu est gris », et le code suivait — sur les
 * deux largeurs. Les planches disent autre chose, et quatre relevés de
 * conformité menés séparément l'ont rapporté sans se voir :
 *
 *   bureau  `padding: 26px 30px`, AUCUN fond, AUCUNE bordure — le titre repose
 *           sur le gris de la zone de travail, et 24 px le séparent du contenu ;
 *   mobile  `#ffffff`, `border-bottom: 1px solid #ececf0`, `16px 16px 14px`.
 *
 * La raison tient à la place : sur téléphone la barre est collée en haut et doit
 * se détacher de ce qui défile dessous ; sur bureau elle est déjà bornée par la
 * carte-page et la barre latérale, et un second filet la redécoupe pour rien.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  actions,
}: {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest px-margin-mobile pt-4 pb-3.5 md:border-0 md:bg-transparent md:px-[30px] md:pt-[26px] md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
            {titre}
          </h1>
          {sousTitre !== undefined ? (
            <p className="mt-[5px] font-body-sm text-[13px] text-sourdine md:text-[14px]">
              {sousTitre}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
