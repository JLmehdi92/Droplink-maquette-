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
  actionMobile,
}: {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: React.ReactNode;
  /** Rendu sous la ligne du titre, pleine largeur — la recherche au téléphone. */
  readonly dessous?: React.ReactNode;
  /**
   * Rendu à droite du titre AU TÉLÉPHONE SEULEMENT.
   *
   * Un seul écran s'en sert : Commandes, qui y porte la déconnexion. C'est la
   * seule planche téléphone du canevas à dessiner quelque chose à cet endroit —
   * un rond que le produit ne rendait pas — et l'espace vendeur n'a aucune autre
   * place où poser un geste de compte quand la barre latérale n'existe pas.
   *
   * ⚠️ FACULTATIF, ET IL DOIT LE RESTER. Le rendre obligatoire mettrait un
   * bouton de déconnexion en tête des cinq écrans, alors que les quatre autres
   * planches n'en dessinent aucun.
   */
  readonly actionMobile?: React.ReactNode;
}) {
  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest px-margin-mobile pt-4 pb-3.5 md:border-0 md:bg-transparent md:px-[30px] md:pt-[26px] md:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* `justify-between` du parent suffit à repousser l'action à droite :
            un `flex-1` ici n'ajoutait rien, et son `md:flex-none` ne produisait
            aucune règle — donc une classe écrite sans effet, que seule la sonde
            de classes mortes pouvait voir. */}
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
        {actionMobile === undefined ? null : (
          <div className="md:hidden">{actionMobile}</div>
        )}
        {actions}
      </div>
      {dessous}
    </header>
  );
}

/**
 * L'EN-TÊTE D'ÉCRAN DU DESIGN SYSTEM — le `PageHeader` de `ui_kits/seller_app`.
 *
 * ⚠️ POURQUOI DEUX EN-TÊTES COEXISTENT, ET POURQUOI CE N'EST PAS UN OUBLI.
 * `EnTeteEcran` sert encore Envois, Analyses et Marque, qui ne sont pas migrés.
 * Migrer le composant PARTAGÉ poserait un titre de 40 px du design system
 * au-dessus de trois corps d'écran restés à l'ancien thème — soit trois écrans
 * à moitié migrés, ce que le pilote automatique interdit explicitement
 * (« commiter un écran à moitié fait est pire que ne pas l'avoir commencé »).
 * C'est le même choix que `acces-champs.tsx`, qui a gardé ses deux jeux le temps
 * de la migration. ⚠️ LE VIEUX MEURT QUAND LE DERNIER ÉCRAN PASSE, PAS AVANT —
 * et le laisser vivre après serait une seconde source pour un seul dessin.
 *
 * LES VALEURS SONT CELLES DU KIT, RELEVÉES ET NON ARRONDIES :
 *
 *   titre       40 px / 800 / interligne 1,05 / tracking -0,045em
 *   sous-titre  15 px, couleur de corps, 8 px sous le titre
 *   rangée      écart 20 px, 26 px sous l'en-tête
 *   ≤ 760 px    l'en-tête passe en colonne, le titre tombe à 26 px
 *   ≤ 560 px    le titre tombe à 24 px
 *
 * ⚠️ LE PALIER DU GRAND TITRE EST CELUI DE LA COQUE — 768 — ET NON LE 761 DU
 * KIT. Les sept pixels d'écart ne se voient sur aucun appareil ; en revanche un
 * titre de 40 px posé au-dessus d'une mise en page encore en colonne, entre 761
 * et 767, se verrait. Le kit bascule sa coque et son titre au même endroit : on
 * fait pareil, à NOTRE palier. Le petit palier, lui, est repris tel quel
 * (`max-[560px]`) : il ne coïncide avec aucune bascule de mise en page, donc
 * rien ne l'attire vers 640.
 *
 * ⚠️ LA BARRE BLANCHE DU TÉLÉPHONE EST CONSERVÉE, ET C'EST UNE DÉCISION
 * PRODUIT. Le kit n'en dessine pas parce qu'il pose une barre supérieure
 * (`dl-topbar`) avec un menu hamburger ; le produit a choisi une barre
 * d'ONGLETS EN BAS, et n'a donc aucune barre en haut. Sans ce fond blanc et son
 * filet, le titre flotterait sur le dégradé lavande et rien ne le séparerait de
 * ce qui défile dessous.
 */
export function EnTeteEcranDs({
  titre,
  sousTitre,
  actions,
  dessous,
  actionMobile,
}: {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: React.ReactNode;
  /** Rendu sous la ligne du titre, pleine largeur — la recherche au téléphone. */
  readonly dessous?: React.ReactNode;
  /** Rendu à droite du titre AU TÉLÉPHONE SEULEMENT. Voir `EnTeteEcran`. */
  readonly actionMobile?: React.ReactNode;
}) {
  return (
    <header className="border-b border-ds-filet bg-ds-surface-carte px-margin-mobile pt-4 pb-3.5 md:border-0 md:bg-transparent md:px-[30px] md:pt-[26px] md:pb-[26px]">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre max-[560px]:text-[24px] md:text-[40px]">
            {titre}
          </h1>
          {sousTitre !== undefined ? (
            <p className="mt-2 text-[15px] leading-[1.45] text-ds-texte-corps">{sousTitre}</p>
          ) : null}
        </div>
        {actionMobile === undefined ? null : <div className="md:hidden">{actionMobile}</div>}
        {actions}
      </div>
      {dessous}
    </header>
  );
}
