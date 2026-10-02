"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * CONNEXION ⇄ INSCRIPTION SANS RECHARGER (maquette, `acces.js` : `naviguer`).
 *
 * Le formulaire sort (170 ms, flou de 4 px), l'autre entre (420 ms), l'adresse déjà
 * tapée suit, et le film de l'une se fond dans celui de l'autre (520 ms). Le produit
 * n'a pas besoin du `fetch` + `DOMParser` de la maquette : le routeur de Next charge
 * la page (préchargée par ses liens) ; ce composant ne porte que la chorégraphie.
 *
 * L'état de la bascule traverse la navigation par `window.__basculeAcces` : la page
 * qui part l'écrit, celle qui arrive le lit (une fois, s'il a moins de 3 s). Sans
 * JavaScript, ou sur un clic modifié (nouvel onglet), le lien reste un lien.
 */

const FRAIS_MS = 3000;

interface Bascule {
  readonly adresse: string;
  readonly quand: number;
  entree: boolean;
  /** Vers « Mot de passe oublié » : l'adresse suit, mais ni le film ne se fond (la
   *  maquette ne quitte pas sa page), ni la bascule ne rejoue d'entrée. */
  readonly versOubli?: boolean;
}

declare global {
  interface Window {
    __basculeAcces?: Bascule;
  }
}

function recente(): Bascule | null {
  if (typeof window === "undefined") return null;
  const b = window.__basculeAcces;
  return b !== undefined && performance.now() - b.quand < FRAIS_MS ? b : null;
}

/** La bascule vient-elle d'avoir lieu ? (le film entrant se fond alors dans le sortant) */
export function basculeRecente(): boolean {
  const b = recente();
  return b !== null && b.versOubli !== true;
}

/** L'arrivée sur « Mot de passe oublié » depuis la connexion (une fois) : son titre prend
 *  le focus, comme le panneau de la maquette. */
export function arriveeVersOubli(): boolean {
  const b = recente();
  if (b === null || b.versOubli !== true || b.entree) return false;
  b.entree = true;
  return true;
}

/**
 * L'adresse tapée sur la page qu'on vient de quitter, pour l'état initial du champ.
 * Lue au premier rendu côté CLIENT seulement : au premier chargement d'un document,
 * il n'y a jamais de bascule, donc le rendu serveur et l'hydratation s'accordent.
 */
export function adresseTransmise(): string {
  return recente()?.adresse ?? "";
}

/**
 * L'adresse suit aussi vers « Mot de passe oublié » (maquette : `depuis.value` recopié) —
 * sans chorégraphie : cette page a sa propre coque, l'écart de panneau est déclaré.
 * `versOubli` : personne ne rejoue d'entrée ni de fondu de film à l'arrivée.
 */
export function transmettreAdresse(adresse: string): void {
  window.__basculeAcces = { adresse: adresse.trim(), quand: performance.now(), entree: false, versOubli: true };
}

const CHEMIN_BASCULE = /^\/[^/]+\/(connexion|inscription)$/;

/** Demande au film de la page qui part de s'arrêter sur sa dernière image. */
export const EVENEMENT_FIGER_FILM = "droplink:figer-film";

export function BasculeAcces() {
  const router = useRouter();

  useEffect(() => {
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minuteurs: number[] = [];
    const plus = (f: () => void, ms: number) => minuteurs.push(window.setTimeout(f, ms));

    /* ---------- l'arrivée : le formulaire entre, le film sortant s'efface ---------- */
    const arrivee = recente();
    if (arrivee !== null && !arrivee.entree && arrivee.versOubli !== true) {
      arrivee.entree = true;
      const corps = document.querySelector(".acces__corps");
      const legal = document.querySelector(".acces__legal");
      if (!reduit) {
        corps?.classList.add("v4-entre");
        legal?.classList.add("v4-entre");
      }
      corps?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
      // `v4-entre` reste posée : la retirer rendrait la main à l'entrée `monte` du
      // chargement, qui se rejouerait (la maquette le fait, à 800 ms : le formulaire
      // disparaissait une seconde fois). Chaque page d'accès est un nœud neuf.
    }

    /* ---------- le départ : intercepté avant le lien de Next ---------- */
    let enCours = false;
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || !a.closest(".acces__corps") || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !CHEMIN_BASCULE.test(url.pathname) || url.pathname === location.pathname) return;
      e.preventDefault();
      if (enCours) return;
      enCours = true;
      const corps = document.querySelector(".acces__corps");
      const legal = document.querySelector(".acces__legal");
      const adresse = corps?.querySelector<HTMLInputElement>('input[type="email"]')?.value.trim() ?? "";
      window.__basculeAcces = { adresse, quand: performance.now(), entree: false };
      // le film sortant s'arrête tout de suite et s'efface sur sa dernière image
      // (520 ms) ; le nouveau entrera en fondu une fois la page arrivée
      window.dispatchEvent(new Event(EVENEMENT_FIGER_FILM));
      if (!reduit) document.querySelector(".acces__vitrine--film .film-hote")?.classList.add("est-entrant");
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: reduit ? "auto" : "smooth" });
      const partir = () => router.push(url.pathname + url.search);
      if (reduit) {
        partir();
        plus(() => window.location.assign(url.href), 4000);
        return;
      }
      corps?.classList.add("v4-sort");
      legal?.classList.add("v4-sort");
      plus(partir, 170);
      // filet (maquette : « si le chargement échoue, le lien reste un lien ») : une
      // page qui n'est pas arrivée en 4 s est chargée comme un lien ordinaire
      plus(() => window.location.assign(url.href), 4000);
    };
    // « Précédent » / « Suivant » entre connexion et inscription : la maquette rejoue la
    // bascule. L'adresse suit et le formulaire qui arrive entre ; la sortie, elle, ne peut
    // pas attendre — le navigateur a déjà changé d'adresse. ⚠️ Mesuré le 02/10/2026 : à
    // `popstate`, Next a DÉJÀ rendu la page d'arrivée (son champ, vide de ce qu'on avait
    // tapé, et ce composant démonté). L'événement `navigate` de la Navigation API part
    // AVANT : c'est lui qu'on écoute. Sans elle (Safari < 18.2), le retour reste un retour sec.
    const noter = (chemin: string): void => {
      if (!CHEMIN_BASCULE.test(chemin) || chemin === location.pathname) return;
      const adresse = document.querySelector<HTMLInputElement>('.acces__corps input[type="email"]')?.value.trim() ?? "";
      window.__basculeAcces = { adresse, quand: performance.now(), entree: false };
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const surNavigation = (e: Event): void => {
      const n = e as Event & { navigationType?: string; destination?: { url?: string } };
      if (n.navigationType !== "traverse" || n.destination?.url === undefined) return;
      noter(new URL(n.destination.url).pathname);
    };
    navigation?.addEventListener("navigate", surNavigation);
    document.addEventListener("click", clic, true);
    return () => {
      navigation?.removeEventListener("navigate", surNavigation);
      document.removeEventListener("click", clic, true);
      minuteurs.forEach((m) => window.clearTimeout(m));
    };
  }, [router]);

  return null;
}
