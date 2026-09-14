/**
 * L'EN-TÊTE D'ÉCRAN DU DESIGN SYSTEM — le `PageHeader` de `ui_kits/seller_app`.
 *
 * ⚠️ IL A COEXISTÉ AVEC L'ANCIEN `EnTeteEcran` le temps de la migration, pour
 * ne jamais poser un titre du design system au-dessus d'un corps d'écran resté à
 * l'ancien thème. Il a été retiré le 14/09/2026 : plus rien ne l'appelait, et il
 * était le dernier en-tête en Plus Jakarta Sans.
 *
 * LES VALEURS SONT CELLES DU KIT, RELEVÉES ET NON ARRONDIES :
 *
 *   titre       40 px / 800 / interligne 1,05 / tracking -0,045em
 *   sous-titre  15 px, couleur de corps, 8 px sous le titre
 *   rangée      écart 20 px, 26 px sous l'en-tête
 *   marges      32 px à gauche et à droite du contenu, 30 px au-dessus du
 *               titre — mesuré sur la référence servie : la zone de contenu
 *               commence à x=264 et le titre à x=296, la barre supérieure
 *               finit à y=89 et le titre commence à y=119
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
  pleineLargeur = false,
}: {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: React.ReactNode;
  /** Rendu sous la ligne du titre, pleine largeur — la recherche au téléphone. */
  readonly dessous?: React.ReactNode;
  /** Rendu à droite du titre AU TÉLÉPHONE SEULEMENT. Voir `EnTeteEcran`. */
  readonly actionMobile?: React.ReactNode;
  /**
   * LE BLOC DU TITRE PREND TOUTE LA LIGNE. `SettingsView` pose son titre dans
   * un simple bloc, sans rangée d'actions : il mesure 1 347 px de large chez le
   * kit, et 488 dans notre rangée flexible. Et ce bloc n'a que 24 px dessous
   * (`marginBottom: 24`), quand le `PageHeader` des autres écrans en rend 26.
   * Facultatif, parce que `/marque` — déjà à zéro écart — mesure le sien à la
   * largeur de son contenu.
   */
  readonly pleineLargeur?: boolean;
}) {
  return (
    <header
      className={
        "border-b border-ds-filet bg-ds-surface-carte px-margin-mobile pt-4 pb-3.5 md:border-0 md:bg-transparent md:px-8 md:pt-[30px] " +
        (pleineLargeur ? "md:pb-6" : "md:pb-[26px]")
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className={pleineLargeur ? "min-w-0 flex-1" : "min-w-0"}>
          <h1 className="text-[26px] leading-[1.05] font-extrabold tracking-[-0.045em] text-ds-texte-titre max-[560px]:text-[24px] md:text-[40px]">
            {titre}
          </h1>
          {/*
            ⚠️ 1,55 ET NON 1,45 — mesuré, pas transposé. Le `PageHeader` du kit
            ne pose AUCUNE `line-height` sur ce paragraphe : il hérite du corps
            de texte du design system, qui vaut 1,55. Sur la référence servie, le
            sous-titre de 15 px rend donc 23,25 px de haut, quand le nôtre en
            rendait 21,75 — un pixel et demi qui remontait toute la rangée de
            compteurs et, avec elle, le tableau.

            La soustraction de `/commandes` ne pouvait pas l'attraper : elle
            apparie par le TEXTE, et nos deux sous-titres ne disent pas la même
            chose que ceux du kit. Le défaut était donc commun aux deux écrans et
            invisible à l'outil — c'est le geste « regarder les deux captures »
            qui le rattrape, pas les nombres.
          */}
          {sousTitre !== undefined ? (
            <p className="mt-2 text-[15px] leading-[1.55] text-ds-texte-corps">{sousTitre}</p>
          ) : null}
        </div>
        {actionMobile === undefined ? null : <div className="md:hidden">{actionMobile}</div>}
        {actions}
      </div>
      {dessous}
    </header>
  );
}
