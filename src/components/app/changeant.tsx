"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * UN CHIFFRE QUI CHANGE SE FOND, FLOUTÉ, PLUTÔT QUE DE DÉFILER (maquette,
 * `analytique.js` : `changer`).
 *
 * Quand la période change, le serveur rend de nouveaux chiffres : l'ancien s'efface
 * (110 ms, flou de 3 px), puis le nouveau entre (220 ms, 3 px plus bas, flou levé).
 * `cle` dit ce qui est affiché — deux rendus de la même valeur ne rejouent rien. Au
 * premier affichage, et sous mouvement réduit, la valeur se pose sans animation.
 *
 * Pendant les 110 ms de sortie, c'est l'ANCIENNE valeur qui reste à l'écran : elle a
 * déjà été remplacée en base de lecture, mais pas encore dite — jamais l'inverse.
 */
export function Changeant({ cle, children }: { readonly cle: string; readonly children: ReactNode }) {
  const [affiche, setAffiche] = useState<{ cle: string; contenu: ReactNode }>({ cle, contenu: children });
  const racine = useRef<HTMLSpanElement>(null);
  const entrer = useRef(false);
  const sortieRef = useRef<Animation | null>(null);
  const dernier = useRef<{ cle: string; contenu: ReactNode }>({ cle, contenu: children });
  // la valeur la plus récente, lue à la fin du fondu (jamais pendant le rendu)
  useLayoutEffect(() => {
    dernier.current = { cle, contenu: children };
  });

  useEffect(() => {
    if (cle === affiche.cle) {
      // Revenue à la valeur affichée pendant sa sortie : elle ne reste pas effacée
      // (seule la sortie est levée, jamais l'entrée qui vient de partir).
      sortieRef.current?.cancel();
      sortieRef.current = null;
      return;
    }
    const el = racine.current;
    const poser = () => {
      setAffiche(dernier.current);
    };
    if (el === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(poser);
      return;
    }
    const sortie = el.animate(
      [
        { opacity: 1, filter: "blur(0)" },
        { opacity: 0, filter: "blur(3px)" },
      ],
      { duration: 110, easing: "ease-out", fill: "forwards" },
    );
    sortieRef.current = sortie;
    let annule = false;
    sortie.finished.then(
      () => {
        if (annule) return;
        entrer.current = true;
        poser();
      },
      () => {
        // Sortie annulée (une autre valeur arrive, ou l'écran part) : la suivante décide.
      },
    );
    return () => {
      annule = true;
    };
  }, [cle, affiche.cle]);

  useLayoutEffect(() => {
    const el = racine.current;
    if (!entrer.current || el === null) return;
    entrer.current = false;
    el.getAnimations().forEach((a) => a.cancel());
    sortieRef.current = null;
    el.animate(
      [
        { opacity: 0, filter: "blur(3px)", transform: "translateY(3px)" },
        { opacity: 1, filter: "blur(0)", transform: "none" },
      ],
      { duration: 220, easing: "cubic-bezier(.23,1,.32,1)" },
    );
  }, [affiche]);

  return (
    <span ref={racine} className="changeant">
      {cle === affiche.cle ? children : affiche.contenu}
    </span>
  );
}
