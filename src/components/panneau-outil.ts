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

/**
 * LA PILULE QUI OUVRE. Même hauteur et même bord que les pilules de vue, mais
 * jamais leur remplissage noir : le noir dit « cette vue est celle qu'on
 * regarde », et un menu replié ne dit rien de tel. Le chevron est la seule
 * chose qui la distingue d'un lien.
 *
 * 44 px au doigt, 34 px à la souris — la planche téléphone écrit
 * `min-height: 44px` là où la planche bureau écrit `height: 34px`.
 *
 * `w-fit` parce qu'elle devient l'en-tête de la feuille : sans lui, une pilule
 * étalée sur toute la largeur de l'écran ne se lirait plus comme un bouton.
 */
export const PILULE_OUTIL =
  "flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-full border " +
  "border-filet-controle bg-surface-container-lowest px-3.5 font-label-md text-[13px] " +
  "font-semibold whitespace-nowrap text-ardoise transition-colors hover:bg-fond-neutre " +
  "lg:h-[34px] lg:min-h-0";

/**
 * LE `<details>` — une pilule dans la rangée, et, une fois ouvert au téléphone,
 * la feuille du bas elle-même.
 *
 * `max-h-[85vh]` + défilement interne : sans plafond, le panneau le plus long
 * dépasserait du haut de l'écran, et son bouton « Appliquer » serait
 * inatteignable.
 *
 * Au bureau, tout cela se défait : le `<details>` redevient une pilule ordinaire
 * de la rangée, et c'est le PANNEAU qui s'ancre.
 *
 * ⚠️ LA POSITION AU BUREAU EST LAISSÉE À L'APPELANT, et ce n'est pas un oubli :
 * elle décide DE QUOI le panneau est ancré. `Commandes` pose `lg:open:static`
 * pour que ses deux panneaux s'alignent sur le bord de la CARTE, comme la
 * planche le dessine ; `Envois` pose `lg:open:relative` pour que son menu de
 * tri, plus étroit, tombe sous SA pilule. L'écrire ici en aurait imposé un aux
 * deux, et l'autre serait allé se coller au bord de la fenêtre — vu, mesuré,
 * à 220 px au-dessus de sa pilule.
 */
export const DETAILS_OUTIL =
  "shrink-0 open:fixed open:inset-x-0 open:bottom-0 open:z-50 open:max-h-[85vh] " +
  "open:overflow-y-auto open:rounded-t-[18px] open:border-t open:border-filet-controle " +
  "open:bg-surface-container-lowest open:p-4 open:shadow-[0_-16px_40px_-16px_rgba(14,14,19,0.3)] " +
  "lg:open:z-auto lg:open:max-h-none lg:open:overflow-visible " +
  "lg:open:rounded-none lg:open:border-0 lg:open:bg-transparent lg:open:p-0 lg:open:shadow-none";

/**
 * LE PANNEAU — dans le flux de la feuille au téléphone, ancré sous sa pilule au
 * bureau.
 *
 * `lg:max-w-full` LE BORNE À SON BLOC CONTENANT — donc à la rangée quand
 * l'appelant a posé `lg:open:static`, mais à la PILULE quand il a posé
 * `lg:open:relative`. Un menu ancré à sa pilule doit donc le défaire
 * (`lg:max-w-none`) : sans cela, celui d'`Envois` retombait de 232 à 202 px et
 * ses libellés passaient à la ligne.
 *
 * Sur la rangée, il sert : à 1 024 px, elle ne fait plus que À 1 024 px, la rangée ne fait plus que
 * 627 px : le panneau de filtres, large de 666, débordait de 16 px À GAUCHE de
 * la carte du tableau. Il ne sortait pas de la fenêtre, donc rien ne le
 * signalait — seule la mesure le dit.
 *
 * ⚠️ LA LARGEUR SE LIT SUR LA PLANCHE RENDUE, PAS DANS SON ATTRIBUT. Les
 * planches du canevas sont en `content-box` : `width: 620px; padding: 18px`
 * y donne **658** à l'écran, et le produit, qui est en `border-box`, rendait
 * 620 — 38 px plus étroit que le dessin. Chaque appelant pose donc la largeur
 * MESURÉE, jamais celle écrite dans le style de la planche.
 */
export const PANNEAU_OUTIL =
  "mt-3 w-full " +
  "lg:absolute lg:end-0 lg:top-[42px] lg:z-20 lg:mt-0 lg:max-w-full " +
  "lg:rounded-[16px] lg:border lg:border-filet-controle lg:bg-surface-container-lowest " +
  "lg:p-[18px] lg:shadow-[0_18px_40px_-18px_rgba(14,14,19,0.28)]";

/* ======================================================================== *
 *  LES MÊMES CONTRÔLES, PORTÉS SUR LE DESIGN SYSTEM.
 *
 *  ⚠️ ILS COEXISTENT AVEC LES TROIS CI-DESSUS, ET C'EST DÉLIBÉRÉ. `Envois`
 *  emploie encore les anciens et n'est pas migré : changer les constantes
 *  PARTAGÉES lui poserait une barre d'outils du design system au-dessus d'un
 *  corps d'écran de l'ancien thème. Même raison, même durée de vie et même
 *  échéance que les deux jeux d'`acces-champs.tsx` et d'`en-tete-ecran.tsx` :
 *  LES ANCIENS MEURENT QUAND LE DERNIER ÉCRAN PASSE.
 *
 *  ⚠️ CE QUI NE CHANGE PAS : la construction. Les deux raisons écrites plus
 *  haut — un conteneur qui rogne en X rogne AUSSI en Y, et une feuille qui
 *  recouvre sa propre pilule est un cul-de-sac au doigt — sont des mesures, pas
 *  des choix esthétiques. Le design system ne les contredit pas ; il ne dessine
 *  simplement aucune feuille du bas.
 * ======================================================================== */

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
