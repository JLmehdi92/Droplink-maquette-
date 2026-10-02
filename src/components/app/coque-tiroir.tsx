"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/**
 * LA COQUE DE L'ESPACE VENDEUR ET DE L'ADMINISTRATION : une colonne au bureau,
 * un TIROIR sous 1 020 px.
 *
 * Portée de `design/maquette/src/tiroir.js` (refonte du 02/10/2026, décision n° 1
 * de Mehdi : « un menu hamburger fluide avec une animation fluide »). Il
 * REMPLACE la barre d'onglets du bas, qui ne tenait que cinq destinations sur six
 * (les paramètres en étaient exclus faute de place).
 *
 * Ce que le tiroir fait, et pourquoi :
 * - ouvrir et fermer ne durent pas pareil (380 / 260 ms, en CSS) : on attend une
 *   ouverture, jamais une fermeture ;
 * - le reste de l'écran est `inert` tant qu'il est ouvert, le défilement de la
 *   page est bloqué, le focus va au lien de l'écran courant et REVIENT au bouton
 *   à la fermeture (Échap, voile, croix) ;
 * - le geste du pouce : on le repousse vers la gauche, il suit le doigt, et se
 *   ferme au lâcher au-delà de 32 % de sa largeur OU à plus de 0,45 px/ms ; un
 *   geste vertical reste un défilement ;
 * - il se referme seul au changement d'écran, et au-dessus de 1 020 px.
 *
 * La colonne et le contenu sont rendus par le SERVEUR et passés ici en
 * propriétés : ce composant ne porte que l'état d'ouverture.
 */

interface EtatTiroir {
  readonly ouvert: boolean;
  readonly poser: (ouvrir: boolean, options?: { readonly rendreFocus?: boolean }) => void;
  readonly libelles: { readonly ouvrir: string; readonly fermer: string };
}

const ContexteTiroir = createContext<EtatTiroir | null>(null);

function useTiroir(): EtatTiroir {
  const etat = useContext(ContexteTiroir);
  if (etat === null) throw new Error("useTiroir hors de CoqueTiroir");
  return etat;
}

const ID_BARRE = "barre-navigation";

export function CoqueTiroir({
  barre,
  children,
  libelles,
}: {
  readonly barre: ReactNode;
  readonly children: ReactNode;
  readonly libelles: { readonly ouvrir: string; readonly fermer: string };
}) {
  const [ouvert, setOuvert] = useState(false);
  const refBarre = useRef<HTMLElement>(null);
  const refFeuille = useRef<HTMLDivElement>(null);
  const refVoile = useRef<HTMLDivElement>(null);
  const focusAuRetour = useRef(false);
  const chemin = usePathname();
  // Un lien suivi depuis le tiroir change d'écran sans recharger : on le referme
  // (ajusté pendant le rendu, pas dans un effet qui rendrait deux fois).
  const [cheminVu, setCheminVu] = useState(chemin);
  if (cheminVu !== chemin) {
    setCheminVu(chemin);
    setOuvert(false);
  }

  const poser = useCallback((ouvrir: boolean, options?: { readonly rendreFocus?: boolean }) => {
    focusAuRetour.current = !ouvrir && options?.rendreFocus === true;
    setOuvert(ouvrir);
  }, []);

  // Les effets de bord de l'ouverture, au même endroit que l'état.
  useEffect(() => {
    const racine = document.documentElement;
    racine.classList.toggle("tiroir-ouvert", ouvert);
    if (refFeuille.current) refFeuille.current.inert = ouvert;
    if (ouvert) {
      const barre = refBarre.current;
      const cible =
        barre?.querySelector<HTMLElement>('nav [aria-current="page"]') ??
        barre?.querySelector<HTMLElement>("nav a");
      cible?.focus({ preventScroll: true });
    } else if (focusAuRetour.current) {
      focusAuRetour.current = false;
      document.querySelector<HTMLElement>("[data-menu-app]")?.focus({ preventScroll: true });
    }
  }, [ouvert]);

  // Démontée (déconnexion, changement de surface), la coque ne laisse pas la page bloquée.
  useEffect(() => () => document.documentElement.classList.remove("tiroir-ouvert"), []);


  useEffect(() => {
    const etroit = window.matchMedia("(max-width: 1020px)");
    const surLargeur = (e: MediaQueryListEvent): void => {
      if (!e.matches) setOuvert(false);
    };
    const surTouche = (e: KeyboardEvent): void => {
      // Un menu ouvert DANS le tiroir (le compte) consomme Échap le premier
      // (`DetailsFermable`) : un seul Échap ne ferme qu'une chose.
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (refBarre.current?.classList.contains("est-ouverte")) poser(false, { rendreFocus: true });
    };
    // Le sens d'entrée (`data-sens`) ne vaut que pour l'écran qu'il annonce : une
    // navigation suivante par un autre chemin (alerte, logo, retour) entre par défaut.
    const surFinEntree = (e: AnimationEvent): void => {
      if (e.target instanceof Element && e.target.classList.contains("entree-ecran")) {
        delete document.documentElement.dataset.sens;
      }
    };
    etroit.addEventListener("change", surLargeur);
    window.addEventListener("keydown", surTouche);
    document.addEventListener("animationend", surFinEntree);
    return () => {
      etroit.removeEventListener("change", surLargeur);
      window.removeEventListener("keydown", surTouche);
      document.removeEventListener("animationend", surFinEntree);
    };
  }, [poser]);

  /* ---------- le geste : repousser le tiroir vers la gauche ---------- */
  useEffect(() => {
    const barre = refBarre.current;
    const voile = refVoile.current;
    if (!barre || !voile) return;
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)");
    let depart: { x: number; y: number; t: number; dx: number; axe: "x" | "y" | null; id: number } | null =
      null;

    const appui = (e: PointerEvent): void => {
      if (!barre.classList.contains("est-ouverte") || e.pointerType === "mouse" || reduit.matches) return;
      depart = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, axe: null, id: e.pointerId };
    };
    const glisse = (e: PointerEvent): void => {
      if (!depart || e.pointerId !== depart.id) return;
      const dx = e.clientX - depart.x;
      const dy = e.clientY - depart.y;
      if (depart.axe === null) {
        if (Math.hypot(dx, dy) < 8) return;
        // un geste vertical fait défiler le menu : on le laisse au navigateur
        depart.axe = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (depart.axe === "y") {
          depart = null;
          return;
        }
        barre.setPointerCapture(e.pointerId);
        barre.classList.add("est-tire");
        voile.classList.add("est-tire");
      }
      // vers la droite, une résistance : le tiroir est déjà tout ouvert
      depart.dx = dx < 0 ? dx : dx / 6;
      const part = Math.min(1, Math.max(0, -depart.dx / barre.offsetWidth));
      barre.style.transform = `translateX(${depart.dx}px)`;
      voile.style.opacity = String(1 - part);
    };
    const lache = (e: PointerEvent): void => {
      if (!depart || e.pointerId !== depart.id) return;
      const { dx, t, axe } = depart;
      depart = null;
      if (axe !== "x") return;
      const vitesse = dx / Math.max(1, performance.now() - t); // px/ms, négatif vers la gauche
      barre.classList.remove("est-tire");
      voile.classList.remove("est-tire");
      barre.style.transform = "";
      voile.style.opacity = "";
      if (dx < -barre.offsetWidth * 0.32 || vitesse < -0.45) setOuvert(false);
    };
    barre.addEventListener("pointerdown", appui);
    barre.addEventListener("pointermove", glisse);
    barre.addEventListener("pointerup", lache);
    barre.addEventListener("pointercancel", lache);
    return () => {
      barre.removeEventListener("pointerdown", appui);
      barre.removeEventListener("pointermove", glisse);
      barre.removeEventListener("pointerup", lache);
      barre.removeEventListener("pointercancel", lache);
    };
  }, []);

  return (
    <ContexteTiroir.Provider value={{ ouvert, poser, libelles }}>
      <div className="app">
        {/*
          Un lien suivi depuis le tiroir le referme, MÊME vers le chemin courant
          (« Commandes » depuis `/commandes?statut=…`, le logo depuis le tableau de
          bord) : le routeur ne change alors pas de chemin, et rien d'autre ne le
          refermerait. Le focus revient au bouton du menu, qui reste à l'écran —
          le lien touché, lui, disparaît avec le tiroir.
        */}
        <aside
          ref={refBarre}
          id={ID_BARRE}
          className={"app__barre" + (ouvert ? " est-ouverte" : "")}
          onClick={(e) => {
            if (ouvert && e.target instanceof Element && e.target.closest("a")) poser(false, { rendreFocus: true });
          }}
        >
          {barre}
          <button
            className="app__fermer"
            type="button"
            aria-label={libelles.fermer}
            onClick={() => poser(false, { rendreFocus: true })}
          >
            <X aria-hidden="true" className="ic" />
          </button>
        </aside>
        <div
          ref={refVoile}
          className={"tiroir-voile" + (ouvert ? " est-visible" : "")}
          aria-hidden="true"
          onClick={() => poser(false, { rendreFocus: true })}
        />
        <div ref={refFeuille} className="app__feuille">
          {children}
        </div>
      </div>
    </ContexteTiroir.Provider>
  );
}

/** ☰ → ✕ : trois traits qui se rejoignent, pas une icône qu'on échange. */
export function BoutonTiroir() {
  const { ouvert, poser, libelles } = useTiroir();
  return (
    <button
      className="app__menu"
      type="button"
      data-menu-app
      aria-controls={ID_BARRE}
      aria-expanded={ouvert}
      aria-label={ouvert ? libelles.fermer : libelles.ouvrir}
      onClick={() => poser(!ouvert)}
    >
      <span className="burger" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
