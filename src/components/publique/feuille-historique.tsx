"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * LA FEUILLE DE L'HISTORIQUE (maquette v3 de la page client, `.cv-feuille`) : elle monte
 * du bas au téléphone, glisse de la droite au bureau.
 *
 * UN `<dialog>` NATIF, ouvert par `showModal()` : le piège du focus, Échap, le fond
 * rendu inerte et le retour du focus au bouton d'origine viennent du navigateur — pas
 * d'un script écrit ici, sur la page qui a 300 Ko pour tout faire. Fermer passe par un
 * `<form method="dialog">` (sans JavaScript du tout) ou par un clic sur le voile.
 *
 * Les boutons qui l'ouvrent vivent ailleurs dans la page (la carte du dernier mouvement,
 * l'aperçu du bureau) : ils portent `data-ouvrir-historique`, et un seul écouteur posé
 * sur le document les sert tous. Sans JavaScript, ils ne font rien — et l'historique
 * reste lisible au bureau dans son aperçu.
 */
export function FeuilleHistorique({
  titreId,
  children,
}: {
  readonly titreId: string;
  readonly children: ReactNode;
}) {
  const dialogue = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const ouvrir = (evenement: MouseEvent): void => {
      const cible = evenement.target instanceof Element ? evenement.target.closest("[data-ouvrir-historique]") : null;
      if (cible === null || dialogue.current === null || dialogue.current.open) return;
      dialogue.current.showModal();
    };
    document.addEventListener("click", ouvrir);
    return () => document.removeEventListener("click", ouvrir);
  }, []);

  return (
    <dialog
      ref={dialogue}
      className="cv-feuille"
      aria-labelledby={titreId}
      onClick={(evenement) => {
        // Le voile est le dialogue lui-même, hors du panneau.
        if (evenement.target === evenement.currentTarget) evenement.currentTarget.close();
      }}
    >
      {children}
    </dialog>
  );
}
