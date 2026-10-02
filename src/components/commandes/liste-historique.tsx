"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * LA LISTE DE L'HISTORIQUE, dont les nouvelles lignes ENTRENT (maquette,
 * `commande.js` : 320 ms, 6 px vers le bas) quand la fiche est relue après une
 * écriture. Les lignes déjà là au premier affichage sont posées ; une ligne est
 * reconnue par son identifiant (`data-id`), jamais par sa position.
 */
export function ListeHistorique({ children }: { readonly children: ReactNode }) {
  const liste = useRef<HTMLOListElement>(null);
  const connues = useRef<Set<string> | null>(null);

  useLayoutEffect(() => {
    const ol = liste.current;
    if (ol === null) return;
    const lignes = [...ol.querySelectorAll<HTMLElement>(":scope > li[data-id]")];
    const deja = connues.current;
    connues.current = new Set(lignes.map((li) => li.dataset.id ?? ""));
    if (deja === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lignes
      .filter((li) => !deja.has(li.dataset.id ?? ""))
      .forEach((li) =>
        li.animate(
          [
            { opacity: 0, transform: "translateY(-6px)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, easing: "cubic-bezier(.23,1,.32,1)" },
        ),
      );
  });

  return (
    <ol ref={liste} className="ed-histo">
      {children}
    </ol>
  );
}
