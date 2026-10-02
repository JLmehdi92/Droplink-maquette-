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
      document.removeEventListener("click", clic, true);
      window.clearTimeout(filet);
    };
  }, [router]);

  return null;
}
