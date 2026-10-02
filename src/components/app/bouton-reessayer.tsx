"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

/**
 * « RÉESSAYER » D'UNE FRONTIÈRE D'ERREUR (maquette, `.etat__bouton`). L'attente
 * affichée est celle de la VRAIE relance — `reset` dans une transition, dont
 * `isPending` dit quand le segment a fini de se rendre —, jamais un délai fixe.
 */
export function BoutonReessayer({ libelle, reset }: { readonly libelle: string; readonly reset: () => void }) {
  const [enCours, demarrer] = useTransition();
  return (
    <button type="button" className="etat__bouton" aria-busy={enCours} disabled={enCours} onClick={() => demarrer(reset)}>
      <RotateCcw aria-hidden="true" className="ic" />
      <span>{libelle}</span>
    </button>
  );
}
