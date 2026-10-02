"use client";

import { useEffect } from "react";

/**
 * LA LIGNE QU'ON ARCHIVE SE REPLIE (maquette, `commandes.js` : `archiver`, `.est-partie`
 * — 240 ms de hauteur, 180 ms d'opacité), PUIS le formulaire part.
 *
 * Les gestes de la liste restent des POST natifs (`lib/commandes/geste-liste.ts`) : ce
 * composant ne fait que retarder l'envoi de 260 ms, le temps du repli, et le relance à
 * l'identique (`requestSubmit` avec le même bouton). Sans JavaScript, ou sous mouvement
 * réduit, l'envoi part tout de suite. Une ligne n'est repliée qu'à l'envoi, jamais avant
 * — et c'est la page relue après le POST qui dit ce que la base a fait.
 */
export function RepliArchivage() {
  useEffect(() => {
    const surEnvoi = (e: SubmitEvent) => {
      const f = e.target;
      if (!(f instanceof HTMLFormElement) || e.defaultPrevented) return;
      if (f.dataset.replie === "1") {
        delete f.dataset.replie;
        return;
      }
      const geste = f.querySelector<HTMLInputElement>('input[name="geste"]')?.value;
      // Un geste de la liste recharge la page (POST natif, puis la liste relue) : ce
      // n'est pas une arrivée, l'entrée du premier chargement ne se rejoue pas.
      // Pas sous mouvement réduit : aucune entrée n'y joue, et le drapeau resterait posé
      // jusqu'à sauter celle d'un écran bien plus tard.
      if (
        (geste === "archiver" || geste === "lot" || geste === "dupliquer") &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        try {
          sessionStorage.setItem("dl-sans-entree", "1");
        } catch {
          // Sans stockage, l'entrée se rejoue : un défaut de confort, rien de plus.
        }
      }
      if (f.dataset.repliEnCours === "1") {
        // Un second clic pendant le repli ne fait pas partir un second POST.
        e.preventDefault();
        return;
      }
      const ids =
        geste === "archiver"
          ? [f.querySelector<HTMLInputElement>('input[name="id"]')?.value ?? ""]
          : geste === "lot"
            ? [...f.querySelectorAll<HTMLInputElement>('input[name="selection"]:checked')].map((c) => c.value)
            : [];
      if (ids.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rangees = ids
        .map((id) => document.querySelector(`.liste input[name="selection"][value="${CSS.escape(id)}"]`)?.closest(".rangee"))
        .filter((r): r is Element => r instanceof Element);
      if (rangees.length === 0) return;
      e.preventDefault();
      const bouton = e.submitter instanceof HTMLElement ? e.submitter : null;
      rangees.forEach((r) => r.classList.add("est-partie"));
      f.dataset.repliEnCours = "1";
      window.setTimeout(() => {
        delete f.dataset.repliEnCours;
        f.dataset.replie = "1";
        f.requestSubmit(bouton);
      }, 260);
    };
    // Revenu par « Précédent » sur la page quittée (cache de navigation) : les lignes
    // repliées ne disent rien de ce que la base a fait — elles se rouvrent.
    const surRetour = (e: PageTransitionEvent) => {
      if (e.persisted) document.querySelectorAll(".rangee.est-partie").forEach((r) => r.classList.remove("est-partie"));
    };
    document.addEventListener("submit", surEnvoi, true);
    window.addEventListener("pageshow", surRetour);
    return () => {
      document.removeEventListener("submit", surEnvoi, true);
      window.removeEventListener("pageshow", surRetour);
    };
  }, []);
  return null;
}
