"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * LES SORTIES DE L'ESPACE VENDEUR ET DE L'ADMINISTRATION (maquette, `coque.js` :
 * `aller`, et `commandes.js` / `envois.js` : `rafraichir`).
 *
 * 1. CHANGER D'ÉCRAN : le contenu courant sort (110 ms, `cubic-bezier(.4,0,1,1)`,
 *    6 px dans le sens du menu), PUIS le routeur de Next charge l'écran suivant.
 *    Celui-ci est inséré invisible et n'entre qu'une image plus tard (`TemplateEcran`,
 *    `window.__entreeDifferee`) : sa première image porte toute sa mise en page, et une
 *    entrée qui démarrerait dessus sauterait ses premières images (refonte-design § 6).
 *    Le clic est intercepté AVANT le lien de Next (phase de capture) ; un clic modifié,
 *    un lien externe, une ancre, un lien `target` ou de téléchargement restent des liens.
 *
 * 2. FILTRER UNE LISTE (même écran, autre `?…`) : la table s'estompe à 0,35 en 90 ms
 *    pendant que le serveur relit la liste, puis revient en 160 ms quand la nouvelle
 *    adresse est rendue. La maquette filtre en mémoire ; le produit filtre au serveur
 *    (l'URL reste l'état, § 5) : l'estompe couvre l'attente au lieu d'un échange
 *    instantané. « Charger la suite » ne l'estompe pas (il ajoute, il ne remplace pas).
 *
 * Sous mouvement réduit : aucune sortie, aucune estompe ; l'écran suivant entre en
 * fondu de 140 ms (CSS).
 */

declare global {
  interface Window {
    __entreeDifferee?: boolean;
    /** Un lien vers le même écran, autre `?…` (un onglet, un filtre) vient d'être suivi. */
    __changementSurPlace?: boolean;
  }
}

const SORTIE_MS = 110;

export function TransitionsEcran() {
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams().toString();
  const estompee = useRef<Animation[]>([]);
  const sortieEnCours = useRef<Animation | null>(null);

  /* ---------- arrivé sur un AUTRE écran : le focus va au contenu ----------
     Maquette `coque.js` : `main#contenu`. Sans cela il reste sur le lien d'un menu qui n'a
     pas changé, et le lecteur d'écran ne dit rien de l'écran neuf. Posé quand le nouveau
     chemin est RENDU (un `main` posé plus tôt est remplacé, et le focus retombait sur
     `<body>` — mesuré le 02/10/2026). Pas au premier chargement, ni sur un filtre. */
  // Le chemin du premier rendu (et non un booléen : sous StrictMode l'effet tourne deux
  // fois au montage, et le second passage aurait focalisé dès le chargement).
  const cheminInitial = useRef(chemin);
  useEffect(() => {
    if (chemin === cheminInitial.current) return;
    cheminInitial.current = "";
    const focaliser = (): void => {
      const contenu = document.getElementById("contenu");
      const actif = document.activeElement;
      // ⚠️ UN ÉCRAN QUI A DÉJÀ PLACÉ SON FOCUS LE GARDE (relecture du 02/10/2026) : la fiche
      // d'une commande neuve met le curseur dans « Nom du client » — le lui reprendre
      // forcerait un clic de plus. Seul un focus resté sur `<body>` ou hors de l'écran
      // (le lien du menu) part au contenu.
      if (contenu === null || contenu === actif) return;
      if (actif !== null && actif !== document.body && actif.closest(".entree-ecran") !== null) return;
      if (!contenu.hasAttribute("tabindex")) contenu.setAttribute("tabindex", "-1");
      contenu.focus({ preventScroll: true });
    };
    const image = requestAnimationFrame(focaliser);
    // LE SQUELETTE DE CHARGEMENT PORTE AUSSI `#contenu` : le focus y va d'abord, puis le vrai
    // contenu le remplace et le focus retombe sur `<body>`. Tant que la page se remplit (8 s
    // au plus), un `#contenu` neuf reprend le focus — seulement si personne d'autre ne l'a pris.
    const veille = new MutationObserver(() => {
      if (document.activeElement === null || document.activeElement === document.body) focaliser();
    });
    veille.observe(document.body, { childList: true, subtree: true });
    // Dès que la personne agit, le focus est à elle : la veille s'arrête.
    const arreter = (): void => veille.disconnect();
    document.addEventListener("pointerdown", arreter, { capture: true, once: true });
    document.addEventListener("keydown", arreter, { capture: true, once: true });
    const fin = window.setTimeout(arreter, 8000);
    return () => {
      cancelAnimationFrame(image);
      veille.disconnect();
      document.removeEventListener("pointerdown", arreter, { capture: true });
      document.removeEventListener("keydown", arreter, { capture: true });
      window.clearTimeout(fin);
    };
  }, [chemin]);

  /* ---------- la liste revient quand la nouvelle adresse est rendue ---------- */
  useEffect(() => {
    // L'écran est arrivé : une sortie restée posée sur un élément encore là (navigation
    // abandonnée, retour arrière) est levée, et l'entrée différée ne vaut plus.
    const sortie = sortieEnCours.current;
    if (sortie !== null) {
      sortieEnCours.current = null;
      sortie.cancel();
    }
    window.__entreeDifferee = false;
    // lu par le panneau d'onglet monté dans ce même rendu (avant cet effet) : il ne vaut
    // que pour lui
    window.__changementSurPlace = false;
    const encours = estompee.current;
    if (encours.length === 0) return;
    estompee.current = [];
    document.querySelectorAll<HTMLElement>("[data-table]").forEach((t) =>
      t.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: "ease-out" }),
    );
    encours.forEach((a) => a.cancel());
  }, [chemin, recherche]);

  useEffect(() => {
    const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // LE SENS SUIT L'ORDRE DES ÉCRANS, pour tout lien (maquette `coque.js`, `ORDRE`) — le
    // menu le pose lui-même au clic ; ailleurs (fiche → liste, « Retour », Précédent), on le
    // déduit ici : on remonte l'ordre, le contenu descend.
    const poserSens = (vers: URL, imposer = false): void => {
      // Le menu pose son sens au clic ; un « Précédent » le recalcule toujours (un sens
      // resté d'une navigation abandonnée serait périmé).
      if (!imposer && document.documentElement.dataset.sens !== undefined) return;
      const de = rangEcran(location.pathname);
      const a = rangEcran(vers.pathname);
      if (de === null || a === null || de === a) return;
      document.documentElement.dataset.sens = a < de ? "haut" : "bas";
    };
    // « Précédent » / « Suivant » : aucune sortie possible (le navigateur a déjà changé
    // d'adresse), mais l'écran qui arrive entre dans le bon sens.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const surNavigation = (e: Event): void => {
      const n = e as Event & { navigationType?: string; destination?: { url?: string } };
      if (n.navigationType === "traverse" && n.destination?.url !== undefined) poserSens(new URL(n.destination.url), true);
    };
    navigation?.addEventListener("navigate", surNavigation);
    let enCours = false;
    let filet = 0;

    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!a || a.target || a.hasAttribute("download") || a.closest("[data-sans-transition]")) return;
      const url = new URL(a.href, location.href);
      // seulement les écrans de l'application : `/api/…` (exports) reste un vrai lien
      if (url.origin !== location.origin || !/^\/(fr|en|zh-CN)(\/|$)/.test(url.pathname)) return;
      const ici = new URL(location.href);
      // la même adresse à une ancre près : le navigateur s'en charge
      if (url.pathname === ici.pathname && url.search === ici.search) return;

      /* ---------- même écran, autre filtre : la table s'estompe ---------- */
      if (url.pathname === ici.pathname) {
        window.__changementSurPlace = true;
        if (reduit() || a.classList.contains("liste__suite")) return;
        estompee.current.forEach((x) => x.cancel());
        estompee.current = [...document.querySelectorAll<HTMLElement>("[data-table]")].map((t) =>
          t.animate([{ opacity: 1 }, { opacity: 0.35 }], { duration: 90, easing: "ease-out", fill: "forwards" }),
        );
        // filet : une navigation qui n'aboutit pas ne laisse pas la liste estompée
        window.clearTimeout(filet);
        filet = window.setTimeout(() => {
          estompee.current.forEach((x) => x.cancel());
          estompee.current = [];
        }, 8000);
        return;
      }

      /* ---------- un autre écran : le contenu sort, puis le routeur charge ---------- */
      if (reduit()) {
        window.__entreeDifferee = true;
        return; // le lien de Next fait la navigation ; l'entrée en fondu suit
      }
      const ecran = document.querySelector<HTMLElement>(".app__feuille > .entree-ecran");
      if (ecran === null) return;
      e.preventDefault();
      if (enCours) return;
      enCours = true;
      // le sens est posé par le menu dans son propre gestionnaire de clic, qui passe
      // APRÈS celui-ci : la sortie part à la tâche suivante, quand il est connu
      window.setTimeout(() => {
        poserSens(url);
        const sens = document.documentElement.dataset.sens === "haut" ? -1 : 1;
        const sortie = ecran.animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: `translateY(${-6 * sens}px)` },
          ],
          { duration: SORTIE_MS, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
        );
        sortieEnCours.current = sortie;
        const partir = () => {
          window.__entreeDifferee = true;
          router.push(url.pathname + url.search + url.hash);
          enCours = false;
          // filet : un écran qui n'arrive pas (erreur réseau) ne reste pas effacé
          window.setTimeout(() => {
            if (ecran.isConnected) sortie.cancel();
          }, 6000);
        };
        sortie.finished.then(partir, partir);
      }, 0);
    };

    document.addEventListener("click", clic, true);
    return () => {
      navigation?.removeEventListener("navigate", surNavigation);
      document.removeEventListener("click", clic, true);
      window.clearTimeout(filet);
    };
  }, [router]);

  return null;
}

/** Le rang d'un écran dans l'ordre de la maquette (`coque.js`), ou `null` hors de cet ordre. */
const ORDRE_ECRANS = [/^\/tableau-de-bord$/, /^\/commandes$/, /^\/commandes\/[^/]+$/, /^\/envois$/, /^\/analyses$/, /^\/marque$/, /^\/parametres$/, /^\/passer-pro$/];
function rangEcran(chemin: string): number | null {
  const sansLangue = chemin.replace(/^\/(fr|en|zh-CN)(?=\/|$)/, "");
  const i = ORDRE_ECRANS.findIndex((m) => m.test(sansLangue));
  return i < 0 ? null : i;
}
