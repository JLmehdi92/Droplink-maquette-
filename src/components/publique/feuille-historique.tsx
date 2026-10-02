"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { bloquerFond, libererFond } from "@/components/publique/bloquer-fond";

/**
 * LA FEUILLE DE L'HISTORIQUE (maquette v3 de la page client, `.cv-feuille`) : elle monte
 * du bas au téléphone, glisse de la droite au bureau.
 *
 * UN `<dialog>` NATIF, ouvert par `showModal()` : le piège du focus, Échap, le fond
 * rendu inerte et le retour du focus au bouton d'origine viennent du navigateur — pas
 * d'un script écrit ici, sur la page qui a 300 Ko pour tout faire. Fermer passe par un
 * `<form method="dialog">` (sans JavaScript du tout) ou par un clic sur le voile.
 *
 * LE MOUVEMENT DE LA MAQUETTE (`client.js`) : entrée de 420 ms à la courbe des tiroirs
 * (`cubic-bezier(.32,.72,0,1)`, CSS), SORTIE plus rapide (240 ms, voile 220 ms) avant
 * que le dialogue ne se ferme — quel que soit le geste (croix, voile, Échap) —, et au
 * téléphone la poignée se TIRE : au-delà de 110 px, ou plus vite que 0,11 px/ms, la
 * feuille se ferme ; au-dessus de sa position elle résiste (racine du déplacement) au
 * lieu de s'arrêter net ; relâchée trop tôt, elle revient en 260 ms. Le fond ne défile
 * pas tant qu'elle est ouverte (`cl-bloque`).
 *
 * Les boutons qui l'ouvrent vivent ailleurs dans la page (la carte du dernier mouvement,
 * l'aperçu du bureau) : ils portent `data-ouvrir-historique`, et un seul écouteur posé
 * sur le document les sert tous. Sans JavaScript, ils ne font rien — et l'historique
 * reste lisible au bureau dans son aperçu.
 */
const TIROIR = "cubic-bezier(.32,.72,0,1)";

export function FeuilleHistorique({
  titreId,
  children,
}: {
  readonly titreId: string;
  readonly children: ReactNode;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);
  const enSortie = useRef(false);

  useEffect(() => {
    const d = dialogue.current;
    if (d === null) return;
    const reduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bureau = () => window.matchMedia("(min-width: 1024px)").matches;
    const panneau = () => d.querySelector<HTMLElement>(".cv-feuille__panneau");
    // L'état du glisser (pointeur saisi, départ, déplacement), remis à zéro à chaque fermeture.
    let id: number | null = null;
    let y0 = 0;
    let t0 = 0;
    let dy = 0;
    // LA SORTIE EN COURS, et elle seule (relecture du 02/10/2026) : sa fin ne ferme la
    // feuille que si elle est toujours LA sortie courante — une fermeture sèche suivie d'une
    // réouverture dans les 240 ms aurait sinon refermé la feuille qu'on venait de rouvrir.
    let sortie: Animation | null = null;
    const abandonnerSortie = (): void => {
      const a = sortie;
      sortie = null;
      a?.cancel();
    };

    const ouvrir = (evenement: MouseEvent): void => {
      const cible = evenement.target instanceof Element ? evenement.target.closest("[data-ouvrir-historique]") : null;
      if (cible === null || d.open) return;
      abandonnerSortie();
      enSortie.current = false;
      d.classList.remove("sort");
      // Mise en page d'avance (`client.css`), la feuille garde son défilement d'une
      // ouverture à l'autre : elle rouvre sur le mouvement le plus récent.
      const p = panneau();
      if (p !== null) p.scrollTop = 0;
      d.showModal();
      bloquerFond();
    };

    /** La sortie animée, puis la vraie fermeture (qui rend le focus au bouton d'origine). */
    const fermer = (): void => {
      if (!d.open || enSortie.current) return;
      const p = panneau();
      if (reduit() || p === null) {
        d.close();
        return;
      }
      enSortie.current = true;
      d.classList.add("sort");
      const depart = getComputedStyle(p).transform;
      const ici = p.animate([{ transform: depart === "none" ? "none" : depart }, { transform: bureau() ? "translateX(calc(100% + 24px))" : "translateY(100%)" }], {
        duration: 240,
        easing: TIROIR,
        fill: "forwards",
      });
      sortie = ici;
      // Annulée (réouverture, démontage), elle rejette : rien à faire, la feuille a déjà
      // été rendue à son état par celui qui l'a annulée.
      ici.finished.then(
        () => {
          if (sortie === ici && d.open) d.close();
        },
        () => undefined,
      );
    };

    const surFermeture = (): void => {
      // Quel que soit le chemin (sortie animée, mouvement réduit après un glisser), la
      // feuille se rouvrira à sa place : aucun reste du geste précédent.
      abandonnerSortie();
      const p = panneau();
      if (p !== null) {
        p.style.transform = "";
        p.style.transition = "";
      }
      id = null;
      enSortie.current = false;
      d.classList.remove("sort");
      libererFond();
    };
    // Échap : la sortie animée plutôt que la fermeture sèche du navigateur.
    const surAnnulation = (e: Event): void => {
      e.preventDefault();
      fermer();
    };
    // La croix est un `<form method="dialog">` : il fermerait sans sortie.
    const surEnvoi = (e: SubmitEvent): void => {
      if ((e.target as HTMLFormElement | null)?.method !== "dialog") return;
      e.preventDefault();
      fermer();
    };
    const surClic = (e: MouseEvent): void => {
      // Le voile est le dialogue lui-même, hors du panneau.
      if (e.target === d) fermer();
    };

    /* ---------- glisser pour fermer (la poignée n'existe qu'au téléphone) ---------- */
    const poignee = d.querySelector<HTMLElement>(".cv-feuille__poignee");
    const saisir = (e: PointerEvent): void => {
      const p = panneau();
      if (id !== null || p === null || enSortie.current) return;
      id = e.pointerId;
      y0 = e.clientY;
      t0 = performance.now();
      dy = 0;
      p.style.transition = "none";
      try {
        poignee?.setPointerCapture(id);
      } catch {
        // Le pointeur a déjà été relâché (geste très bref) : sans capture, le glisser
        // suit quand même tant que le doigt reste sur la poignée — rien à perdre.
      }
    };
    const tirer = (e: PointerEvent): void => {
      const p = panneau();
      if (e.pointerId !== id || p === null) return;
      const brut = e.clientY - y0;
      dy = brut > 0 ? brut : -Math.sqrt(-brut) * 2;
      p.style.transform = `translateY(${dy}px)`;
    };
    const lacher = (e: PointerEvent): void => {
      const p = panneau();
      if (e.pointerId !== id || p === null) return;
      id = null;
      const vitesse = dy / Math.max(1, performance.now() - t0);
      // La vitesse seule ne suffit pas : un appui qui tremble de 5 px en 30 ms la dépasse.
      if (dy > 110 || (dy > 12 && vitesse > 0.11)) {
        fermer();
        return;
      }
      if (!reduit()) p.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 260, easing: TIROIR });
      p.style.transform = "";
      p.style.transition = "";
    };

    document.addEventListener("click", ouvrir);
    d.addEventListener("close", surFermeture);
    d.addEventListener("cancel", surAnnulation);
    d.addEventListener("submit", surEnvoi);
    d.addEventListener("click", surClic);
    poignee?.addEventListener("pointerdown", saisir);
    poignee?.addEventListener("pointermove", tirer);
    poignee?.addEventListener("pointerup", lacher);
    poignee?.addEventListener("pointercancel", lacher);
    // Une capture perdue sans `pointerup` laisserait `id` posé, et tout glisser suivant ignoré.
    poignee?.addEventListener("lostpointercapture", lacher);
    return () => {
      document.removeEventListener("click", ouvrir);
      d.removeEventListener("close", surFermeture);
      d.removeEventListener("cancel", surAnnulation);
      d.removeEventListener("submit", surEnvoi);
      d.removeEventListener("click", surClic);
      poignee?.removeEventListener("pointerdown", saisir);
      poignee?.removeEventListener("pointermove", tirer);
      poignee?.removeEventListener("pointerup", lacher);
      poignee?.removeEventListener("pointercancel", lacher);
      poignee?.removeEventListener("lostpointercapture", lacher);
      abandonnerSortie();
      libererFond();
    };
  }, []);

  return (
    <dialog ref={dialogue} className="cv-feuille" aria-labelledby={titreId}>
      {children}
    </dialog>
  );
}
