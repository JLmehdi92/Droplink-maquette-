"use client";

import { useEffect, useRef } from "react";

/**
 * L'INFO-BULLE DES GRAPHIQUES (maquette, `admin.js`) : au survol d'un élément
 * `[data-info]` (barre, part d'anneau), son texte suit le pointeur.
 *
 * ELLE NE PORTE AUCUNE INFORMATION EXCLUSIVE : chaque graphique dit ses
 * chiffres ailleurs (légende, axe, total). C'est un confort de souris, absent
 * au toucher.
 */
export function InfoBulles() {
  const bulle = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const b = bulle.current;
    if (!b) return;
    const bouger = (e: PointerEvent) => {
      const cible = (e.target as Element | null)?.closest?.<SVGElement | HTMLElement>("[data-info]");
      if (!cible) {
        b.hidden = true;
        return;
      }
      b.textContent = cible.dataset.info ?? "";
      b.hidden = false;
      const r = b.getBoundingClientRect();
      b.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2))}px`;
      b.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
    };
    const cacher = () => {
      b.hidden = true;
    };
    document.addEventListener("pointermove", bouger, { passive: true });
    document.addEventListener("pointerleave", cacher);
    return () => {
      document.removeEventListener("pointermove", bouger);
      document.removeEventListener("pointerleave", cacher);
    };
  }, []);
  return <div ref={bulle} className="adm-info" role="tooltip" hidden />;
}
