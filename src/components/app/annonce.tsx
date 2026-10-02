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

/** `duree` : 2 600 ms dans l'espace vendeur (`coque.js`), 2 800 dans l'administration (`admin.js`). */
export function Annonce({ duree = DUREE_MS }: { readonly duree?: number }) {
  const [texte, setTexte] = useState("");
  const [visible, setVisible] = useState(false);
  const minuterie = useRef(0);

  useEffect(() => {
    const montrer = (t: string): void => {
      setTexte(t);
      setVisible(true);
      window.clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => setVisible(false), duree);
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
  }, [duree]);

  return (
    <p className={"toast" + (visible ? " est-visible" : "")} role="status" aria-live="polite">
      {texte}
    </p>
  );
}

/**
 * Une annonce dite À L'ARRIVÉE sur l'écran (un résultat porté par l'adresse, après un POST
 * natif : « 3 commandes traitées. »). Une image plus tard, pour que la bulle de la coque
 * écoute déjà.
 */
export function AnnonceAuChargement({
  texte,
  retirer = [],
}: {
  readonly texte: string;
  /** Les paramètres d'adresse qui portent ce résultat : retirés une fois dit, sans quoi un
   *  « Précédent » ou un rechargement ré-annoncerait un geste ancien. */
  readonly retirer?: readonly string[];
}) {
  // Une clé stable : la liste est un littéral recréé à chaque rendu.
  const aRetirer = retirer.join(",");
  useEffect(() => {
    const image = window.requestAnimationFrame(() => {
      annoncer(texte);
      if (aRetirer === "") return;
      const url = new URL(window.location.href);
      aRetirer.split(",").forEach((p) => url.searchParams.delete(p));
      // `history.replaceState` est relayé au routeur de Next : l'adresse change, rien ne se recharge.
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    });
    return () => window.cancelAnimationFrame(image);
  }, [texte, aRetirer]);
  return null;
}
