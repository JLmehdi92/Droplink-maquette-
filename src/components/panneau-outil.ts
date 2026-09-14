/**
 * LA GÉOMÉTRIE DES CONTRÔLES QUI OUVRENT, dans une barre d'outils de liste.
 *
 * Deux écrans en portent — `Commandes` (filtres, export) et `Envois` (tri) — et
 * les planches du canevas les dessinent pareil : une pilule dans la rangée, un
 * panneau ancré dessous. Deux copies de ces valeurs divergeraient au premier
 * réglage, et personne ne le verrait avant de comparer les deux écrans côte à
 * côte.
 *
 * ⚠️ POURQUOI CE N'EST PAS UN SIMPLE `absolute`. Sous `lg`, ces barres d'outils
 * défilent horizontalement (`overflow-x: auto`). **Un conteneur qui rogne en X
 * rogne AUSSI en Y** : mesuré sur `Envois` à 390 px, le menu de tri s'ouvrait à
 * y 242 pour 150 px de haut alors que sa bande s'arrête à 238 — cent pour cent
 * hors du cadre, sans une erreur ni une trace, et seule la mesure le disait.
 *
 * ⚠️ ET POURQUOI CE N'EST PAS NON PLUS UN PANNEAU `fixed` DANS LA BANDE. Premier
 * essai : le panneau seul passait en `fixed`, ce qui réglait le rognage. Mais la
 * feuille, haute de 658 px sur un écran de 844, RECOUVRAIT SA PROPRE PILULE —
 * donc le seul geste qui la referme au doigt. Échap n'existe pas sur un
 * téléphone : le panneau était un cul-de-sac. C'est donc le `<details>` ENTIER
 * qui devient la feuille, et sa pilule en est l'en-tête : le geste qui ouvre est
 * exactement celui qui referme.
 */

/*
 * ⚠️ LES TROIS CONSTANTES DE L'ANCIEN CANEVAS (`PILULE_OUTIL`, `DETAILS_OUTIL`,
 * `PANNEAU_OUTIL`) ONT ÉTÉ RETIRÉES LE 14/09/2026 : elles avaient coexisté avec
 * celles-ci le temps que `Envois` passe, et plus rien ne les appelait. La
 * construction, elle, est inchangée — les deux raisons écrites plus haut sont
 * des mesures, pas des choix esthétiques, et le design system ne dessine
 * aucune feuille du bas.
 *
 * `max-h-[85vh]` + défilement interne : sans plafond, le panneau le plus long
 * dépasserait du haut de l'écran, et son bouton « Appliquer » serait
 * inatteignable. Au bureau, le `<details>` redevient une pilule ordinaire de la
 * rangée, et c'est le PANNEAU qui s'ancre — à la BANDE quand l'appelant pose
 * `lg:open:static`, à la PILULE quand il pose `lg:open:relative`.
 */

/**
 * LE CONTRÔLE QUI OUVRE — le `ToolbarButton` d'`OrdersView` : 42 px de haut,
 * `padding: 0 14px`, écart 9, rayon de carte, filet, fond carte, 14 px en
 * graisse moyenne, survol sur la teinte violette.
 *
 * 44 px au doigt : le kit n'a pas de version tactile de ce bouton, et 42 px
 * passerait sous le plancher que sa propre règle 5 impose.
 */
export const PILULE_OUTIL_DS =
  "flex min-h-11 w-fit cursor-pointer list-none items-center gap-[9px] rounded-ds-card border " +
  "border-ds-filet bg-ds-surface-carte px-[14px] text-[14px] font-medium whitespace-nowrap " +
  "text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte lg:h-[42px] lg:min-h-0";

/** Le `<details>` : pilule dans la rangée, feuille du bas une fois ouvert au
 *  téléphone. Géométrie inchangée, surfaces du design system. */
export const DETAILS_OUTIL_DS =
  "shrink-0 open:fixed open:inset-x-0 open:bottom-0 open:z-50 open:max-h-[85vh] " +
  "open:overflow-y-auto open:rounded-t-ds-card-lg open:border-t open:border-ds-filet " +
  "open:bg-ds-surface-carte open:p-4 open:shadow-ds-window " +
  "lg:open:z-auto lg:open:max-h-none lg:open:overflow-visible " +
  "lg:open:rounded-none lg:open:border-0 lg:open:bg-transparent lg:open:p-0 lg:open:shadow-none";

/** Le panneau — dans le flux de la feuille au téléphone, ancré sous sa pilule
 *  au bureau. La position au bureau reste à l'appelant, pour la raison écrite
 *  plus haut : elle décide DE QUOI le panneau est ancré. */
/*
 * ⚠️ `top-full`, PAS UN NOMBRE, ET C'EST UNE CORRECTION. L'ancienne constante
 * ancrait le panneau à `top: 42px`, c'est-à-dire à la hauteur EXACTE de la
 * pilule d'alors. La bande d'outils du design system porte 16 px de marge
 * haute : la même valeur aurait posé le panneau DANS sa pilule, avec dix
 * pixels de recouvrement. `top-full` se mesure sur le bloc contenant — la
 * BANDE quand l'appelant pose `lg:open:static`, la PILULE quand il pose
 * `lg:open:relative` — donc il reste juste quelle que soit la hauteur des deux.
 * Un nombre en dur se serait tu au prochain changement de marge.
 */
export const PANNEAU_OUTIL_DS =
  "mt-3 w-full " +
  "lg:absolute lg:end-0 lg:top-full lg:z-20 lg:mt-1.5 lg:max-w-full " +
  "lg:rounded-ds-card-lg lg:border lg:border-ds-filet lg:bg-ds-surface-carte " +
  "lg:p-[18px] lg:shadow-ds-lg";
