"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Un `<details>` qui se referme quand on clique ailleurs ou qu'on tape Échap.
 *
 * LE MENU RESTE UN `<details>`, ET C'EST VOULU : il s'ouvre sans JavaScript, et
 * son contenu (des liens, un formulaire POST de déconnexion) est rendu par le
 * serveur. Ce composant n'ajoute que les deux gestes de fermeture de la maquette
 * (`coque.js`) : un menu qui ne se ferme qu'en recliquant sur son bouton reste
 * ouvert par-dessus l'écran qu'on voulait lire.
 */
export function DetailsFermable({
  className,
  name,
  fixe = false,
  children,
}: {
  readonly className?: string;
  /** Un `name` partagé : ouvrir un menu ferme celui qui l'était (groupe exclusif). */
  readonly name?: string;
  /**
   * Le panneau (`.pop`) est posé en position FIXE sous son bouton, et le menu se
   * ferme au défilement. Pour les menus de ligne : la liste rogne ce qui déborde
   * (`overflow: clip`), et le menu de la DERNIÈRE ligne serait coupé.
   */
  readonly fixe?: boolean;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const chemin = usePathname();

  // La coque survit au changement d'écran : un lien suivi depuis le menu le
  // laisserait ouvert sur l'écran d'arrivée.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [chemin]);

  // Ouvert AVANT l'hydratation (il s'ouvre sans JavaScript), le `toggle` n'est pas rejoué :
  // l'état annoncé s'aligne donc aussi au montage (relecture du 03/10/2026).
  useEffect(() => {
    const resume = ref.current?.querySelector("summary");
    if (resume?.hasAttribute("aria-controls")) resume.setAttribute("aria-expanded", String(ref.current?.open === true));
  }, []);

  useEffect(() => {
    const surClic = (e: PointerEvent): void => {
      const details = ref.current;
      if (details?.open && e.target instanceof Node && !details.contains(e.target)) details.open = false;
    };
    const surTouche = (e: KeyboardEvent): void => {
      const details = ref.current;
      if (e.key !== "Escape" || !details?.open) return;
      // Consommé ici : le tiroir qui contient ce menu ne se ferme pas du même Échap.
      e.preventDefault();
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    // Au téléphone, l'inertie d'un défilement ou la barre d'adresse refermaient
    // le menu à peine ouvert : les défilements des 300 premières ms sont ignorés.
    const surDefilement = (): void => {
      const d = ref.current;
      if (d?.open && performance.now() - Number(d.dataset.ouvertLe ?? 0) > 300) d.open = false;
    };
    const surRedimension = (): void => {
      if (ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", surClic);
    window.addEventListener("keydown", surTouche);
    if (fixe) {
      window.addEventListener("scroll", surDefilement, { passive: true });
      window.addEventListener("resize", surRedimension);
    }
    return () => {
      document.removeEventListener("pointerdown", surClic);
      window.removeEventListener("keydown", surTouche);
      window.removeEventListener("scroll", surDefilement);
      window.removeEventListener("resize", surRedimension);
    };
  }, [fixe]);

  return (
    <details
      ref={ref}
      className={className}
      name={name}
      onToggle={(e) => {
        const d = e.currentTarget;
        // Un bouton qui nomme son panneau (`aria-controls`, la cloche — maquette `coque.html`)
        // dit aussi s'il est ouvert, quel que soit le geste qui l'a ouvert ou fermé.
        const resume = d.querySelector("summary");
        if (resume?.hasAttribute("aria-controls")) resume.setAttribute("aria-expanded", String(d.open));
        // MAQUETTE (`commandes.js:228`, `envois.js:180`) : à l'ouverture, le focus va dans le
        // panneau — l'option choisie d'abord, sinon le premier champ ou bouton. Seulement si
        // le focus était sur le bouton du menu : une ouverture par programme ne le vole pas.
        // Appelé APRÈS le placement d'un menu `fixe` : avant, son panneau est encore en
        // `visibility: hidden`, et `focus()` n'y fait rien (relecture du 03/10/2026).
        const focaliserDedans = (): void => {
          if (!d.open || d.querySelector("summary") !== document.activeElement) return;
          const pop = d.querySelector<HTMLElement>(".pop");
          const cible =
            pop?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"], [aria-selected="true"]') ??
            pop?.querySelector<HTMLElement>("select, input:not([type=hidden]), button, a[href]");
          cible?.focus({ preventScroll: true });
        };
        if (!fixe) {
          focaliserDedans();
          return;
        }
        if (!d.open) {
          delete d.dataset.place;
          return;
        }
        d.dataset.ouvertLe = String(performance.now());
        const bouton = d.querySelector("summary")?.getBoundingClientRect();
        const pop = d.querySelector<HTMLElement>(".pop");
        if (!bouton || !pop) return;
        pop.style.top = `${Math.round(Math.min(window.innerHeight - pop.offsetHeight - 12, bouton.bottom + 6))}px`;
        pop.style.left = `${Math.round(Math.max(12, bouton.right - pop.offsetWidth))}px`;
        d.dataset.place = "1";
        focaliserDedans();
      }}
      onClick={(e) => {
        // Un lien suivi depuis le menu le referme, même vers le chemin courant
        // (`/commandes` → `/commandes?tri=jamais-ouvert`) : le chemin ne change pas.
        if (e.target instanceof Element && e.target.closest("a") && ref.current) ref.current.open = false;
      }}
    >
      {children}
    </details>
  );
}
