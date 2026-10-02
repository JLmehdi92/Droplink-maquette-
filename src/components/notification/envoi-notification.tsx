"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * LE BOUTON DE LA PAGE DE NOTIFICATION (« Confirmer », « Me désinscrire ») — maquette
 * `compte.js` : `est-en-cours` et inerte pendant l'envoi. Le formulaire reste un POST
 * NATIF, écrit dans la page (il marche sans JavaScript, et l'inventaire des formulaires
 * le lit là) ; ce bouton s'accroche à lui pour dire l'attente et refuser un second envoi,
 * qui sinon partait au double clic.
 */
export function BoutonNotification({ children }: { readonly children: ReactNode }) {
  const bouton = useRef<HTMLButtonElement>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    const formulaire = bouton.current?.form;
    if (formulaire === null || formulaire === undefined) return;
    let parti = false;
    const surEnvoi = (e: SubmitEvent): void => {
      if (parti) {
        e.preventDefault();
        return;
      }
      parti = true;
      setEnvoi(true);
    };
    // Revenu par « Précédent » depuis le cache du navigateur, le bouton serait resté figé.
    const surRetour = (e: PageTransitionEvent): void => {
      if (!e.persisted) return;
      parti = false;
      setEnvoi(false);
    };
    formulaire.addEventListener("submit", surEnvoi);
    window.addEventListener("pageshow", surRetour);
    return () => {
      formulaire.removeEventListener("submit", surEnvoi);
      window.removeEventListener("pageshow", surRetour);
    };
  }, []);
  return (
    <button ref={bouton} type="submit" className={"notifp__bouton" + (envoi ? " est-en-cours" : "")} aria-disabled={envoi || undefined}>
      {children}
    </button>
  );
}

/**
 * LE TITRE PREND LE FOCUS QUAND L'ÉTAT VIENT DE CHANGER (maquette : `[data-notif-titre]`
 * focalisé après le résultat) : c'est ce qui fait lire le nouvel état à un lecteur d'écran,
 * la page ayant été rechargée par le POST.
 */
export function TitreNotification({ focaliser, children }: { readonly focaliser: boolean; readonly children: ReactNode }) {
  const titre = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focaliser) titre.current?.focus({ preventScroll: true });
  }, [focaliser]);
  return (
    <h1 ref={titre} tabIndex={-1}>
      {children}
    </h1>
  );
}
