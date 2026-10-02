"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * LA COUCHE « v4 » DES ÉCRANS VENDEUR (maquette, `v4.js`).
 *
 * La matière est toujours là — la bordure lumineuse des cartes suit le
 * pointeur ; le MOUVEMENT (titre révélé, compteurs à rouleaux) ne se joue qu'au
 * premier chargement réel, jamais en passant d'un écran à l'autre : un outil
 * qu'on ouvre toute la journée ne rejoue pas son entrée à chaque clic.
 *
 * La classe `v4-entree` est posée sur `<html>` par le script en ligne de
 * `ScriptEntreeV4`, AVANT le premier rendu — posée après l'hydratation, le titre
 * s'afficherait puis disparaîtrait pour rejouer son entrée. Ce composant ne fait
 * que la bordure, par délégation : un seul écouteur pour toutes les cartes.
 */
export function CoucheV4() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const suivre = (e: PointerEvent) => {
      const c = (e.target as Element | null)?.closest?.<HTMLElement>(".v4-carte");
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty("--mx", `${e.clientX - r.left}px`);
      c.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", suivre, { passive: true });
    return () => document.removeEventListener("pointermove", suivre);
  }, []);
  return null;
}

/**
 * Le script qui pose `v4-entree` une fois par chargement de document. Elle est retirée
 * 1,6 s après `.pret` (et non après l'exécution du script) : jusqu'à `.pret`, `.attente`
 * gèle les animations (`ScriptJs`), et une entrée gelée coupée trop tôt sauterait. Exécuté
 * par le navigateur pendant l'analyse du HTML ; une navigation cliente ne le
 * rejoue pas (React n'exécute pas un script inséré), ce qui est voulu.
 */
export function ScriptEntreeV4() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          '(function(){if(window.__v4)return;window.__v4=1;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;try{if(sessionStorage.getItem("dl-sans-entree")){sessionStorage.removeItem("dl-sans-entree");return}}catch(e){}var r=document.documentElement;r.classList.add("v4-entree");function fin(){setTimeout(function(){r.classList.remove("v4-entree")},1600)}if(r.classList.contains("pret")){fin();return}var o=new MutationObserver(function(){if(r.classList.contains("pret")){o.disconnect();fin()}});o.observe(r,{attributes:true,attributeFilter:["class"]});setTimeout(function(){o.disconnect();if(r.classList.contains("v4-entree"))fin()},2500)})()',
      }}
    />
  );
}

function abonner(rappel: () => void) {
  const obs = new MutationObserver(rappel);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}
const enEntree = () => document.documentElement.classList.contains("v4-entree");
const jamaisAuServeur = () => false;

/**
 * Une valeur qui roule jusqu'à ses chiffres au premier chargement (maquette :
 * `.compteur-app__valeur`, `[data-colis-total]`), puis reste un texte.
 *
 * Le rouleau est décoratif (`aria-hidden`) : la valeur est lue dans un texte
 * masqué, sans quoi un lecteur d'écran épellerait dix chiffres par position.
 * La valeur roulée reste tant qu'elle ne change pas ; une nouvelle période
 * rend le texte simple.
 */
export function ValeurRoulee({ texte }: { readonly texte: string }) {
  const entree = useSyncExternalStore(abonner, enEntree, jamaisAuServeur);
  const [figee, setFigee] = useState<string | null>(null);
  if (entree && figee === null && /\d/.test(texte)) setFigee(texte);
  const roule = figee !== null && figee === texte;
  const racine = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const r = racine.current;
    if (!roule || !r) return;
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        r.querySelectorAll<HTMLElement>(".l4-rouleau").forEach((el) => {
          const colonne = el.firstElementChild as HTMLElement | null;
          if (colonne) colonne.style.transform = `translateY(${-Number(el.dataset.chiffre)}em)`;
        });
      });
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [roule]);

  if (!roule) return <>{texte}</>;
  let rang = 0;
  return (
    <span ref={racine}>
      <span className="visuellement-cache">{texte}</span>
      <span aria-hidden="true">
        {[...texte].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={i} className="l4-rouleau" data-chiffre={ch}>
              <span style={{ "--d": `${rang++ * 70}ms` } as React.CSSProperties}>
                {"0123456789".split("").map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </span>
            </span>
          ) : (
            ch
          ),
        )}
      </span>
    </span>
  );
}
