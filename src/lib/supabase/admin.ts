import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types-base";
import { cleServiceRole, urlSupabase } from "./config";

/**
 * Client SERVICE-ROLE pour les lectures ADMIN. RLS contournée.
 *
 * ⚠️ NE DOIT JAMAIS ÊTRE IMPORTÉ HORS DE `src/lib/audit/`.
 *
 * Ce n'est pas une convention de rangement : ce client sert quand un HUMAIN lit
 * les données d'un tiers, et cet accès doit être audité ATOMIQUEMENT avec la
 * lecture qu'il trace. L'enfermer derrière `lib/audit/` rend l'audit
 * structurellement inévitable plutôt que dépendant de la mémoire de celui qui
 * écrit le prochain écran.
 *
 * La restriction est appliquée par ESLint (porte bloquante) ET inventoriée par
 * une sonde. Un garde qui tient à ce que personne n'y pense n'est pas un garde.
 *
 * Pour un chemin SANS humain — webhook, tâche planifiée, envoi — utiliser
 * `system.ts` : un webhook n'est personne, et l'auditer noierait les vraies
 * consultations humaines sous du bruit machine.
 */
export function creerClientAdmin() {
  return createClient<Database>(urlSupabase(), cleServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
