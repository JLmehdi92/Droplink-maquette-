"use client";

import { useMemo, useState } from "react";
import { suggererCorrection } from "@/lib/email/domaines";

/**
 * LA SUGGESTION DE FAUTE DE FRAPPE, AU RYTHME DE LA MAQUETTE (`acces.js`) : elle n'apparaît
 * qu'à la SORTIE du champ, et n'est recalculée à la frappe que tant qu'elle est affichée.
 * Calculée à chaque frappe, elle surgissait pendant la saisie (« x@gmail.co » proposait
 * gmail.com une lettre avant la fin) et rejouait son entrée — relevé à l'audit du 02/10/2026.
 */
export function useSuggestionAdresse(email: string) {
  const [proposer, setProposer] = useState(false);
  const suggestion = useMemo(() => suggererCorrection(email), [email]);
  // Corrigée à la main, elle disparaît et ne revient qu'à la sortie suivante.
  if (proposer && suggestion === null) setProposer(false);
  return {
    suggestion: proposer ? suggestion : null,
    aLaSortie: (): void => setProposer(true),
  };
}
