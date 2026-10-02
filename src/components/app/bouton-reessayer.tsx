"use client";

import { RotateCcw } from "lucide-react";

/**
 * « RÉESSAYER » D'UNE FRONTIÈRE D'ERREUR (maquette, `.etat__bouton`).
 *
 * ⚠️ `retry`, PAS `reset` (Next 16.3) : `reset` ne fait que re-rendre le flux
 * déjà reçu, donc une erreur venue du SERVEUR (une lecture qui a dépassé sa
 * borne) revenait aussitôt, à chaque clic. `retry` relance le rendu serveur.
 * Aucun état « en cours » n'est simulé : `retry` ne dit pas quand il a fini.
 */
export function BoutonReessayer({ libelle, retry }: { readonly libelle: string; readonly retry: () => void }) {
  return (
    <button type="button" className="etat__bouton" onClick={retry}>
      <RotateCcw aria-hidden="true" className="ic" />
      <span>{libelle}</span>
    </button>
  );
}
