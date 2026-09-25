"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * LE BOUTON « VOIR TOUT L'HISTORIQUE » — la seule part interactive du repli.
 *
 * Les étapes repliées sont rendues PAR LE SERVEUR et passées ici en `children` :
 * ce composant ne fait que les montrer ou les cacher. Il pèse quelques lignes, sans
 * bibliothèque — la page client a un budget (< 300 Ko hors médias).
 *
 * ⚠️ UN BOUTON, PAS `<details>`. L'élément natif aurait épargné ces lignes, mais son
 * `<summary>` est forcément AU-DESSUS du contenu qu'il déroule : une fois la liste
 * ouverte, « Réduire » se serait retrouvé coincé entre la cinquième et la sixième
 * étape. Ici le bouton reste en bas, comme sur la planche (`#historique-long`).
 *
 * ⚠️ CACHÉES DÈS LE PREMIER RENDU (`hidden`), jamais montrées puis masquées : la page
 * a un budget de décalage de mise en page (< 0,1), et une liste de trente lignes qui
 * disparaîtrait à l'hydratation le ferait exploser. Aucune animation : rien à
 * neutraliser sous `prefers-reduced-motion`.
 *
 * La couleur est l'ENCRE D'ACCENT du vendeur (`accent.texte`, 4,5:1 garanti par
 * `resoudreAccent`), jamais le dégradé DropLink : cette page porte sa marque à lui.
 */
export function RepliHistorique({
  children,
  voirTout,
  reduire,
  couleur,
}: {
  readonly children: ReactNode;
  readonly voirTout: string;
  readonly reduire: string;
  readonly couleur: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const Chevron = ouvert ? ChevronUp : ChevronDown;

  return (
    <>
      <div id={id} hidden={!ouvert}>
        {children}
      </div>
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={() => setOuvert((v) => !v)}
        className="ml-[90px] inline-flex h-11 items-center gap-2 rounded-ds-pill border border-ds-filet bg-ds-surface-carte px-[18px] text-[14px] leading-[normal] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: couleur, outlineColor: couleur }}
      >
        {ouvert ? reduire : voirTout}
        <Chevron aria-hidden="true" size={16} strokeWidth={2} />
      </button>
    </>
  );
}
