"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * « APPLIQUER » N'EST ACTIF QUE SI LA LANGUE A CHANGÉ (maquette, `parametres.js`). Rendu
 * actif par le serveur — sans JavaScript, le formulaire marche toujours —, puis tenu ici
 * par le DOM seul : un `select` qui change, un bouton qui suit.
 */
export function BoutonAppliquerLangue({ initiale, children }: { readonly initiale: string; readonly children: ReactNode }) {
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const b = bouton.current;
    const choix = b?.form?.querySelector<HTMLSelectElement>('select[name="langue"]');
    if (b === null || choix === null || choix === undefined) return;
    const suivre = (): void => {
      b.disabled = choix.value === initiale;
    };
    suivre();
    choix.addEventListener("change", suivre);
    return () => choix.removeEventListener("change", suivre);
  }, [initiale]);
  return (
    <button ref={bouton} type="submit" className="bouton-app bouton-app--plein">
      {children}
    </button>
  );
}
