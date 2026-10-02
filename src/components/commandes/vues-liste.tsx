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

  /** Le premier placement ne glisse pas : le trait est POSÉ, comme la maquette. */
  const place = useRef(false);

  useLayoutEffect(() => {
    const r = rangee.current, t = trait.current;
    if (!r || !t) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Le fondu qui dit qu'il reste des vues de part et d'autre.
    const bords = () => {
      const reste = r.scrollWidth - r.clientWidth;
      r.classList.toggle("a-suite", reste > 2 && r.scrollLeft < reste - 2);
      r.classList.toggle("a-avant", reste > 2 && r.scrollLeft > 2);
    };
    // MAQUETTE (`commandes.js`, `parametres.js`) : le trait ne glisse QU'au changement de
    // vue ; au premier affichage, au redimensionnement et au défilement il est posé.
    const poser = (anime: boolean) => {
      const a = r.querySelector<HTMLElement>('[aria-current="page"]');
      t.style.transition = anime && !reduit ? "" : "none";
      t.style.opacity = a ? "1" : "0";
      if (a) {
        t.style.width = `${a.offsetWidth}px`;
        // X et Y : la même rangée devient une colonne dans « Paramètres » au bureau.
        t.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
      }
      bords();
    };
    const changement = place.current;
    place.current = true;
    poser(changement);
    // Au téléphone la rangée défile : la vue choisie reste en vue (maquette `parametres.js`).
    const a = r.querySelector<HTMLElement>('[aria-current="page"]');
    if (a !== null && r.scrollWidth > r.clientWidth) {
      r.scrollTo({ left: a.offsetLeft - 16, behavior: changement && !reduit ? "smooth" : "auto" });
    }
    // Le premier rappel d'un `ResizeObserver` part dès l'observation : l'ignorer, sans quoi
    // il couperait le glissement qu'on vient de lancer.
    let premier = true;
    const obs = new ResizeObserver(() => {
      if (premier) {
        premier = false;
        return;
      }
      poser(false);
    });
    obs.observe(r);
    // Le trait vit DANS la rangée et défile avec elle : au défilement, seuls les bords
    // changent (repositionner couperait le glissement pendant un défilement doux).
    const auDefilement = () => bords();
    r.addEventListener("scroll", auDefilement, { passive: true });
    return () => {
      obs.disconnect();
      r.removeEventListener("scroll", auDefilement);
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
