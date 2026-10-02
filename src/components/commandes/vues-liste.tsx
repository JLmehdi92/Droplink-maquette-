"use client";

import { useLayoutEffect, useRef } from "react";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LES VUES DE LA LISTE (maquette, `.vues-liste` : un trait qui glisse sous la vue
 * choisie). Ce sont des LIENS : la vue est dans l'URL, le serveur relit la liste,
 * et l'écran fonctionne sans JavaScript. L'îlot ne fait que poser le trait, et le
 * fondu qui dit qu'il reste des vues à droite quand la rangée défile.
 */
export function VuesListe({
  etiquette,
  vues,
}: {
  readonly etiquette: string;
  readonly vues: ReadonlyArray<{ readonly clef: string; readonly href: string; readonly libelle: React.ReactNode; readonly actif: boolean }>;
}) {
  const rangee = useRef<HTMLElement>(null);
  const trait = useRef<HTMLElement>(null);
  const actif = vues.find((v) => v.actif)?.clef ?? null;

  useLayoutEffect(() => {
    const r = rangee.current, t = trait.current;
    if (!r || !t) return;
    const poser = () => {
      const a = r.querySelector<HTMLElement>('[aria-current="page"]');
      t.style.opacity = a ? "1" : "0";
      if (a) {
        t.style.width = `${a.offsetWidth}px`;
        // X et Y : la même rangée devient une colonne dans « Paramètres » au bureau.
        t.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
      }
      const reste = r.scrollWidth - r.clientWidth;
      r.classList.toggle("a-suite", reste > 2 && r.scrollLeft < reste - 2);
      r.classList.toggle("a-avant", reste > 2 && r.scrollLeft > 2);
    };
    poser();
    const obs = new ResizeObserver(poser);
    obs.observe(r);
    r.addEventListener("scroll", poser, { passive: true });
    return () => {
      obs.disconnect();
      r.removeEventListener("scroll", poser);
    };
  }, [actif]);

  return (
    <nav ref={rangee} className="vues-liste" aria-label={etiquette}>
      <i ref={trait} className="vues-liste__trait" aria-hidden="true" />
      {vues.map((v) => (
        <LienEcran key={v.clef} href={v.href} aria-current={v.actif ? "page" : undefined}>
          {v.libelle}
        </LienEcran>
      ))}
    </nav>
  );
}
