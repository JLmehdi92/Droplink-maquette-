"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * UN BOUTON D'ENVOI QUI DIT SON ATTENTE (`aria-busy`) ET NE PART QU'UNE FOIS : désactivé
 * tant que l'action serveur de son formulaire tourne. Pour les « Créer une commande » qui
 * gardent leur propre présentation (actions rapides du tableau de bord) — un second clic
 * créait un second brouillon, décompté du quota à vie (relecture du 03/10/2026). C'est aussi
 * `aria-busy` qui dit à `TransitionsEcran` que l'action est finie.
 */
export function BoutonEnvoiAttente({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-busy={pending} disabled={pending}>
      {children}
    </button>
  );
}
