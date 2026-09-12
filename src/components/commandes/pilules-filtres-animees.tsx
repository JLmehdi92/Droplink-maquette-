"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { LienEcran } from "@/components/lien-ecran";

/**
 * LES ONGLETS DE VUES, AVEC LE TRAIT QUI GLISSE DE L'UN À L'AUTRE.
 *
 * C'est `UnderlineTabs` du design system : un trait d'accent de 2 px sous
 * l'onglet regardé, à la place de la pastille pleine de l'ancien dessin.
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
  /**
   * Le compte affiché à droite du libellé, quand il est CONNU.
   *
   * ⚠️ FACULTATIF, ET C'EST TOUT LE POINT. Le kit pose un compte sur ses cinq
   * onglets parce qu'il les a tous ; le produit en a trois sur quatre. Afficher
   * un zéro, ou un nombre approché, sur celui qui manque serait affirmer ce que
   * la base n'a pas compté — une pastille absente ne dit rien, une pastille
   * fausse dit quelque chose de faux.
   */
  readonly compte?: number;
}

/**
 * ⚠️ LE TRAIT EST RENTRÉ DE 8 PX DE CHAQUE CÔTÉ, comme `UnderlineTabs` le pose
 * (`left: 8, right: 8`). Il ne souligne donc pas la ZONE cliquable de l'onglet
 * mais son LIBELLÉ — un trait qui court jusqu'au bord de la zone tactile
 * toucherait celui du voisin dès que l'écart tombe à 4 px, qui est l'écart du
 * kit.
 */
const RENTRE = 8;

function poser(marque: HTMLElement, actif: HTMLElement): void {
  marque.style.transform = `translateX(${actif.offsetLeft + RENTRE}px)`;
  marque.style.width = `${Math.max(0, actif.offsetWidth - RENTRE * 2)}px`;
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
    poser(marque, actif);

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
      poser(marque, actif);
    });
    observateur.observe(boite);
    return () => observateur.disconnect();
  }, []);

  return (
    <div ref={rangee} className="relative flex shrink-0 gap-1">
      <span
        ref={pastille}
        aria-hidden="true"
        style={{ opacity: 0 }}
        /* ⚠️ RAYON 2 px, ET NON `rounded-sm` QUI EN VAUT 10. Mesure sur le kit
           servi : le soulignement rend `border-radius: 2px`. */
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-[2px] bg-ds-accent transition-[transform,width] duration-[260ms] ease-out"
      />
      {vues.map((vue) => (
        <LienEcran
          key={vue.clef}
          href={vue.href}
          aria-current={vue.actif ? "true" : undefined}
          className={
            /*
              `UnderlineTabs` : `padding: 0 16px 14px`, 14 px, gras quand
              l'onglet est celui qu'on regarde, moyen sinon.

              ⚠️ L'ÉCART DE 8 px ENTRE LE LIBELLÉ ET SON COMPTEUR MANQUAIT. Le
              kit pose `gap: 8px` ; sans lui le compteur se colle au mot, et
              l'onglet rend 4 px de moins — mesuré à 1675 px : « Toutes » faisait
              110 contre 118, « En transit » 124 contre 128.

              ⚠️ ET L'INTERLIGNE : le corps pose 1,5, le kit laisse `normal`. La
              rangée rendait 35 px de haut au lieu de 33.

              44 px AU DOIGT, et le kit ne le dit pas : il n'a pas de version
              tactile de ses onglets, et 33 px passerait sous le plancher que sa
              propre règle 5 impose.
            */
            "relative flex min-h-11 shrink-0 items-center gap-2 px-4 pb-3.5 text-[14px] " +
            "leading-[normal] whitespace-nowrap transition-colors lg:min-h-0 " +
            (vue.actif
              ? "font-bold text-ds-accent-encre"
              : "font-medium text-ds-texte-corps hover:text-ds-texte-fort")
          }
          data-vue-active={vue.actif ? "true" : undefined}
        >
          {vue.libelle}
          {vue.compte === undefined ? null : (
            /* `UnderlineTabs` : `padding: 2px 8px`, rayon pilule, 11/700. Teinté
               et à l'encre d'accent sur l'onglet regardé, creux et sourdine
               ailleurs. */
            <span
              className={
                "ms-2 shrink-0 rounded-ds-pill px-2 py-0.5 text-[11px] font-bold " +
                (vue.actif
                  ? "bg-ds-surface-teinte text-ds-accent-encre"
                  : "bg-ds-surface-creux text-ds-texte-sourdine")
              }
            >
              {vue.compte}
            </span>
          )}
        </LienEcran>
      ))}
    </div>
  );
}
