"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LES PILULES DE VUES, AVEC LA PASTILLE QUI GLISSE DE L'UNE À L'AUTRE.
 *
 * ⚠️ CETTE ANIMATION N'A PU EXISTER QU'APRÈS LE PASSAGE À NEXT 16. Sous Next 15,
 * cliquer une pilule détruisait le document entier : il n'y avait pas deux
 * rendus entre lesquels animer quoi que ce soit. Depuis Next 16 la navigation
 * reste cliente, et l'arbre est conservé — mesuré, un marqueur posé dans
 * `window` survit au clic.
 *
 * ⚠️ ET `layoutId` DE MOTION NE MARCHE PAS ICI, C'EST MESURÉ AUSSI. C'était la
 * première version, celle qui anime la barre de navigation du vendeur. Sonde du
 * 09/09/2026 : après le clic, `<main>` SURVIT, le conteneur des pilules SURVIT,
 * mais la pastille est un NOUVEAU nœud du DOM. La raison est que le contenu RSC
 * arrive en plusieurs morceaux : l'ancienne pastille est démontée, la nouvelle
 * montée dans un cycle ultérieur, et Motion — qui relie deux `layoutId` vus
 * dans le MÊME cycle — n'a rien à relier. La navigation du vendeur, elle, vit
 * dans le LAYOUT : elle n'est jamais re-rendue par une navigation, d'où la
 * différence.
 *
 * CE QUI MARCHE ICI : une pastille UNIQUE, montée une fois pour toutes hors de
 * la boucle, qu'on POSITIONNE sur la pilule active. Elle n'est jamais démontée,
 * donc rien ne peut la remplacer, et sa transition CSS l'emmène d'une position
 * à l'autre quel que soit ce que React fait des pilules autour.
 *
 * ⚠️ ELLE NE PORTE AUCUNE INFORMATION : `aria-current` reste sur le lien, et la
 * couleur du texte change aussi. `globals.css` coupe déjà toutes les transitions
 * sous `prefers-reduced-motion` — la pastille s'y pose sans glisser, et rien ne
 * disparaît.
 *
 * LES LIBELLÉS ARRIVENT RÉSOLUS, comme pour la navigation : ce composant ne
 * tire aucun catalogue de traduction dans le navigateur.
 */

export interface VuePilule {
  readonly clef: string;
  readonly href: string;
  readonly actif: boolean;
  readonly libelle: string;
}

export function PilulesFiltresAnimees({ vues }: { readonly vues: readonly VuePilule[] }) {
  const rangee = useRef<HTMLDivElement>(null);
  const pastille = useRef<HTMLSpanElement>(null);
  /*
   * ⚠️ LE PREMIER PLACEMENT NE S'ANIME PAS. Sans ce drapeau, la pastille
   * partirait du bord gauche à chaque ouverture de l'écran et glisserait jusqu'à
   * sa place — un mouvement que personne n'a demandé, sur une page qui vient de
   * s'afficher.
   */
  const dejaPlacee = useRef(false);

  /*
   * `useLayoutEffect` et non `useEffect` : le placement doit être fait AVANT que
   * le navigateur peigne. Avec `useEffect`, la pastille serait visible une image
   * à son ancienne position.
   *
   * On écrit directement dans le style plutôt que de passer par un état : c'est
   * du positionnement, pas de la donnée, et un état déclencherait un second
   * rendu à chaque mesure.
   */
  useLayoutEffect(() => {
    const boite = rangee.current;
    const marque = pastille.current;
    if (boite === null || marque === null) return;

    const actif = boite.querySelector<HTMLElement>("[data-vue-active='true']");
    if (actif === null) {
      marque.style.opacity = "0";
      return;
    }

    if (!dejaPlacee.current) marque.style.transition = "none";
    marque.style.opacity = "1";
    marque.style.transform = `translateX(${actif.offsetLeft}px)`;
    marque.style.width = `${actif.offsetWidth}px`;

    if (!dejaPlacee.current) {
      // Une image plus tard, la transition est rendue : les placements SUIVANTS
      // glisseront, celui-ci non.
      const image = requestAnimationFrame(() => {
        marque.style.transition = "";
        dejaPlacee.current = true;
      });
      return () => cancelAnimationFrame(image);
    }
    return;
  }, [vues]);

  /*
   * ⚠️ LA POSITION SE REMESURE QUAND LA RANGÉE CHANGE DE TAILLE. Les pilules
   * défilent horizontalement au téléphone et se réagencent au redimensionnement ;
   * sans cela, la pastille resterait où elle était pendant que sa pilule est
   * partie ailleurs.
   */
  useEffect(() => {
    const boite = rangee.current;
    if (boite === null || typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(() => {
      const marque = pastille.current;
      const actif = boite.querySelector<HTMLElement>("[data-vue-active='true']");
      if (marque === null || actif === null) return;
      marque.style.transform = `translateX(${actif.offsetLeft}px)`;
      marque.style.width = `${actif.offsetWidth}px`;
    });
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, []);

  return (
    <div ref={rangee} className="relative flex shrink-0 gap-2">
      <span
        ref={pastille}
        aria-hidden="true"
        style={{ opacity: 0 }}
        className="pointer-events-none absolute top-0 left-0 h-full rounded-full border border-primary bg-primary transition-[transform,width] duration-[260ms] ease-out"
      />
      {vues.map((vue) => (
        <LienEcran
          key={vue.clef}
          href={vue.href}
          aria-current={vue.actif ? "true" : undefined}
          className={
            // 44 px au doigt, 34 px à la souris : la planche téléphone écrit
            // `min-height: 44px` là où la planche bureau écrit `height: 34px`.
            "relative flex min-h-11 shrink-0 items-center rounded-full border px-3.5 font-label-md text-[13px] font-semibold whitespace-nowrap transition-colors md:h-[34px] md:min-h-0 " +
            (vue.actif
              ? "border-transparent text-on-primary"
              : "border-filet-controle bg-surface-container-lowest text-ardoise hover:bg-fond-neutre")
          }
          data-vue-active={vue.actif ? "true" : undefined}
        >
          {vue.libelle}
        </LienEcran>
      ))}
    </div>
  );
}
