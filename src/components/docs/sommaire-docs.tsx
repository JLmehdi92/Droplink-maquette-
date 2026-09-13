"use client";

import { useEffect, useState } from "react";

/**
 * LE SOMMAIRE DE LA DOCUMENTATION — `DocsSidebar` du kit.
 *
 * CLIENT POUR UNE SEULE RAISON : SURLIGNER LA SECTION QU'ON LIT. Le kit la
 * calcule comme ceci — la dernière section dont le titre est passé sous 120 px —
 * et la même règle est reprise, pour que le repère tombe au même endroit. Sans
 * JavaScript, les ancres marchent et la première entrée reste surlignée : rien
 * ne manque, un repère en moins.
 */
export function SommaireDocs({
  etiquette,
  groupes,
}: {
  readonly etiquette: string;
  readonly groupes: readonly (readonly [string, readonly (readonly [string, string])[]])[];
}) {
  const ids = groupes.flatMap(([, entrees]) => entrees.map(([id]) => id));
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const suivre = () => {
      let courante = ids[0];
      for (const id of ids) {
        const titre = document.getElementById(id);
        if (titre !== null && titre.getBoundingClientRect().top <= 120) courante = id;
      }
      setActive(courante);
    };
    window.addEventListener("scroll", suivre, { passive: true });
    suivre();
    return () => window.removeEventListener("scroll", suivre);
    // Les identifiants sont ceux du rendu serveur : ils ne changent pas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <nav aria-label={etiquette} className="flex flex-col gap-[22px]">
      {groupes.map(([groupe, entrees]) => (
        <div key={groupe} className="flex flex-col gap-[3px]">
          <span className="px-3 pb-1.5 text-[11.5px] font-bold tracking-[0.08em] text-ds-texte-tenu uppercase">
            {groupe}
          </span>
          {entrees.map(([id, libelle]) => {
            const courante = active === id;
            return (
              <a
                key={id}
                href={"#" + id}
                onClick={() => setActive(id)}
                aria-current={courante ? "location" : undefined}
                className={
                  "flex min-h-11 items-center rounded-ds-sm px-3 py-2 text-[14px] transition-colors min-[761px]:block min-[761px]:min-h-0 " +
                  (courante
                    ? "bg-ds-surface-teinte font-bold text-ds-accent-encre"
                    : "font-medium text-ds-texte-corps hover:text-ds-accent-encre")
                }
              >
                {libelle}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
