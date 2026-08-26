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
 * LA BARRE EST BLANCHE ET LE CONTENU EST GRIS : c'est ce qui sépare le titre du
 * travail sur le canevas, sans ombre et sans carte.
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
    <header className="border-b border-outline-variant bg-surface-container-lowest px-margin-mobile py-4 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-headline-lg text-[24px] font-extrabold tracking-[-0.03em] text-on-surface md:text-[28px]">
            {titre}
          </h1>
          {sousTitre !== undefined ? (
            <p className="mt-1 font-body-sm text-[13px] text-on-surface-variant md:text-[14px]">
              {sousTitre}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
