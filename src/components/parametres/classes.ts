/**
 * LES CLASSES DE L'ÉCRAN « PARAMÈTRES », reprises de `SettingsView` du kit.
 *
 * ⚠️ ELLES VIVAIENT DANS `formulaires-parametres.tsx`, ET LA PAGE LES RECEVAIT
 * VIDES DE SENS. Ce module-là porte `"use client"` : tout ce qu'il exporte
 * devient, vu d'un composant serveur, une RÉFÉRENCE CLIENT — pas la chaîne. Le
 * `className` rendu n'était donc pas nos classes, et les boutons « Modifier »,
 * « Ouvrir » et le champ d'adresse sortaient sans filet, sans fond, en 16/400.
 * Typecheck, lint et tests verts : seule la capture l'a montré. Un module sans
 * directive est lisible des deux côtés.
 */

/** `CTRL` du kit : 48 px, remplissage 14, filet par défaut, rayon de contrôle. */
export const CLASSE_CHAMP =
  "flex h-12 min-w-0 items-center gap-[11px] rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-3.5 transition-shadow focus-within:border-ds-filet-focus focus-within:shadow-[var(--anneau-ds-focus)]";

/** Le texte saisi dans un `CTRL` : 14/500, encre forte. */
export const CLASSE_SAISIE =
  "min-w-0 flex-1 border-0 bg-transparent text-[14px] leading-[normal] font-medium text-ds-texte-fort outline-none placeholder:text-ds-texte-tenu";

/**
 * Un `<input>` ou un `<select>` dans un `CTRL` : il REMPLIT la hauteur du cadre.
 * Laissé à sa hauteur de texte, il ne mesurait que 17 px au téléphone — le
 * cadre de 48 se voit, mais c'est l'élément natif qui reçoit le toucher, et
 * aucun `<label>` ne l'enveloppe pour agrandir la cible (règle 5).
 */
export const CLASSE_ENTREE = CLASSE_SAISIE + " self-stretch";

/** `SetField` : libellé 13/500 en couleur de corps, 8 px au-dessus du champ. */
export const CLASSE_CHAMP_ETIQUETE = "flex min-w-0 flex-col gap-2";
export const CLASSE_LIBELLE = "text-[13px] leading-[normal] font-medium text-ds-texte-corps";

/** `GhostButton` : 42 px au bureau, 44 au toucher (règle 5), filet par défaut. */
export const CLASSE_BOUTON =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-ds-control border border-ds-filet-appuye bg-ds-surface-carte px-[18px] text-[14px] leading-[normal] font-semibold text-ds-texte-fort transition-colors hover:bg-ds-surface-teinte disabled:opacity-60 lg:min-h-0 lg:h-[42px]";

/** Aide et messages sous un formulaire. */
export const CLASSE_AIDE = "text-[12.5px] leading-[1.5] text-ds-texte-sourdine";
