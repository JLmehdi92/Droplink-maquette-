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
        if (!fixe) return;
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
