import type { ReactNode } from "react";

/**
 * LA CARTE DU KIT `client_link` — et ce qu'elle devient au téléphone.
 *
 * Valeurs relevées sur le kit servi : fond blanc, filet 1 px `#ECECF5`, rayon
 * 20 (`--radius-card-lg`, pas `--radius-card` qui vaut 16), ombre de carte,
 * remplissage 24.
 *
 * ⚠️ AU TÉLÉPHONE ELLE N'EST PAS UNE CARTE, ET C'EST UNE CONSIGNE DE WASSIM :
 * « au téléphone, encadrer coûte 16 px de chaque côté sur une largeur de 390 —
 * un dixième de la ligne, pris à ce qu'il y a dedans ». Le kit dessine des
 * cartes à toutes les largeurs ; le produit garde sous `lg` une section pleine
 * largeur, séparée de la précédente par un filet, et migre le dessin du BUREAU.
 */
export const CARTE =
  "border-t border-ds-filet bg-ds-surface-carte px-[18px] py-[26px] " +
  "lg:rounded-ds-card-lg lg:border lg:p-6 lg:shadow-ds-card";

/**
 * Le titre de carte du kit : 18 / 700, interlettrage -0,025em, 18 px dessous,
 * et une action éventuelle alignée à droite.
 */
export function TitreCarte({
  children,
  action,
}: {
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <header className="mb-[18px] flex items-center gap-3">
      {/* LE TITRE A LA LARGEUR DE SON TEXTE, et c'est un espaceur qui pousse
          l'action — comme au kit. Un titre étiré sur toute la carte rendait
          654 px là où le kit en rend 163. */}
      <h2 className="min-w-0 text-[18px] leading-[19.8px] font-bold tracking-[-0.025em] text-ds-texte-titre">
        {children}
      </h2>
      <div className="flex-1" />
      {action}
    </header>
  );
}
