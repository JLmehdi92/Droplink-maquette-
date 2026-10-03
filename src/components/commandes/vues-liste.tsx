"use client";

import { useLayoutEffect, useRef } from "react";
import { LienEcran } from "@/components/lien-ecran";
import { useRouter } from "next/navigation";
import { EVENEMENT_ESTOMPE } from "@/components/app/transitions-ecran";

/**
 * LES VUES DE LA LISTE (maquette, `.vues-liste` : un trait qui glisse sous la vue
 * choisie). Ce sont des LIENS : la vue est dans l'URL, le serveur relit la liste,
 * et l'écran fonctionne sans JavaScript. L'îlot ne fait que poser le trait, et le
 * fondu qui dit qu'il reste des vues à droite quand la rangée défile.
 */
export function VuesListe({
  etiquette,
  vues,
  onglets,
}: {
  readonly etiquette: string;
  readonly vues: ReadonlyArray<{ readonly clef: string; readonly href: string; readonly libelle: React.ReactNode; readonly actif: boolean }>;
  /**
   * Posé, la rangée devient des ONGLETS (Paramètres, maquette `parametres.js:43-51`) : rôle
   * `tablist`/`tab`, un seul arrêt de tabulation sur l'onglet choisi, flèches, Début et Fin.
   * Ce restent des liens : la section vit dans l'URL (`?section=`), qui reste la source de
   * vérité — la flèche suit le lien, le serveur rend la section, le focus reste sur l'onglet.
   */
  readonly onglets?: {
    /** Le panneau que la rangée commande (Paramètres) ; aucun pour les vues de Commandes. */
    readonly panneau?: string;
    /**
     * Les Paramètres de la maquette (`parametres.js:43-51`) prennent aussi ↑ ↓ Début Fin, et
     * au clavier, l'onglet change sans le fondu du panneau et sans empiler l'historique ; les vues
     * de Commandes (`commandes.js:277-280`) ne prennent que ← →.
     */
    readonly toutesTouches?: boolean;
  };
}) {
  const routeur = useRouter();
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

  if (onglets !== undefined) {
    const { panneau, toutesTouches = false } = onglets;
    const aller = (e: React.KeyboardEvent<HTMLAnchorElement>, rang: number): void => {
      // Alt+← et Cmd+← sont le Retour du navigateur : jamais avalés par les onglets.
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const pas: Record<string, number> = toutesTouches
        ? { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }
        : { ArrowRight: 1, ArrowLeft: -1 };
      const n = vues.length;
      const cible =
        e.key in pas
          ? (rang + (pas[e.key] ?? 0) + n) % n
          : toutesTouches && e.key === "Home"
            ? 0
            : toutesTouches && e.key === "End"
              ? n - 1
              : null;
      if (cible === null) return;
      e.preventDefault();
      const liens = rangee.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]');
      const lien = liens?.[cible];
      if (lien === undefined) return;
      lien.focus();
      if (cible === rang) return;
      // AU CLAVIER, L'ADRESSE EST REMPLACÉE, pas empilée — comme le sélecteur de période :
      // trois flèches ajoutaient trois entrées d'historique (audit final du 03/10/2026). Et
      // sans le fondu du panneau, comme les Paramètres de la maquette (`anime: false`).
      const href = lien.getAttribute("href");
      if (href === null) return;
      // Les vues de Commandes estompent la table comme au clic (`commandes.js`, `rafraichir`) ;
      // les Paramètres changent d'onglet sans fondu.
      if (!toutesTouches) window.dispatchEvent(new CustomEvent(EVENEMENT_ESTOMPE, { detail: href }));
      routeur.replace(href, { scroll: false });
    };
    return (
      <div ref={rangee as React.RefObject<HTMLDivElement | null>} className="vues-liste" role="tablist" aria-label={etiquette}>
        <i ref={trait} className="vues-liste__trait" aria-hidden="true" />
        {vues.map((v, rang) => (
          <LienEcran
            key={v.clef}
            href={v.href}
            id={`onglet-${v.clef}`}
            role="tab"
            aria-selected={v.actif}
            // Le seul panneau rendu est celui de l'onglet choisi.
            aria-controls={v.actif && panneau !== undefined ? panneau : undefined}
            aria-current={v.actif ? "page" : undefined}
            tabIndex={v.actif ? 0 : -1}
            onKeyDown={(e) => aller(e, rang)}
          >
            {v.libelle}
          </LienEcran>
        ))}
      </div>
    );
  }

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
