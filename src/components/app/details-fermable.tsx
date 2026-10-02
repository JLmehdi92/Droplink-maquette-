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
  children,
}: {
  readonly className?: string;
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
    document.addEventListener("pointerdown", surClic);
    window.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("pointerdown", surClic);
      window.removeEventListener("keydown", surTouche);
    };
  }, []);

  return (
    <details
      ref={ref}
      className={className}
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
