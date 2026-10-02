"use client";

import { useEffect, useRef, useState } from "react";

/**
 * LA BULLE D'ANNONCE DE L'ESPACE VENDEUR ET DE L'ADMINISTRATION (maquette : `.toast`,
 * `coque.js` et `admin.js`) — « Lien de Léa copié », « Média supprimé. », « Lien bloqué… ».
 *
 * Une seule bulle par écran, montée dans la coque ; n'importe quel composant l'appelle par
 * `annoncer(texte)`, sans contexte React à traverser. Elle n'est appelée qu'APRÈS la
 * confirmation de la base (contrainte 8) — jamais en pari. Visible 2,6 s, lue par les
 * lecteurs d'écran (`role="status"`).
 *
 * `annoncerApresRechargement` : pour les gestes qui rechargent la page (administration),
 * le texte traverse le rechargement par `sessionStorage` et s'affiche à l'arrivée.
 */
const EVENEMENT = "droplink:annonce";
const CLE_RECHARGEMENT = "dl-annonce";
const DUREE_MS = 2600;

export function annoncer(texte: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENEMENT, { detail: texte }));
}

export function annoncerApresRechargement(texte: string): void {
  try {
    window.sessionStorage.setItem(CLE_RECHARGEMENT, texte);
  } catch {
    // Stockage refusé (navigation privée stricte) : l'annonce est perdue, pas le geste —
    // la page rechargée montre de toute façon l'état que la base a enregistré.
  }
}

export function Annonce() {
  const [texte, setTexte] = useState("");
  const [visible, setVisible] = useState(false);
  const minuterie = useRef(0);

  useEffect(() => {
    const montrer = (t: string): void => {
      setTexte(t);
      setVisible(true);
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => setVisible(false), DUREE_MS);
    };
    const surAnnonce = (e: Event): void => montrer((e as CustomEvent<string>).detail);
    window.addEventListener(EVENEMENT, surAnnonce);
    let enAttente: string | null = null;
    try {
      enAttente = window.sessionStorage.getItem(CLE_RECHARGEMENT);
      window.sessionStorage.removeItem(CLE_RECHARGEMENT);
    } catch {
      // Stockage illisible : rien n'a pu y être déposé, rien à annoncer.
    }
    // Une image plus tard : la bulle doit ENTRER (transition), pas apparaître posée.
    const image = enAttente === null ? 0 : window.requestAnimationFrame(() => montrer(enAttente));
    return () => {
      window.removeEventListener(EVENEMENT, surAnnonce);
      window.cancelAnimationFrame(image);
      window.clearTimeout(minuterie.current);
    };
  }, []);

  return (
    <p className={"toast" + (visible ? " est-visible" : "")} role="status" aria-live="polite">
      {texte}
    </p>
  );
}
