import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchBorne } from "@/lib/reseau/fetch-borne";
import type { Database } from "./types-base";
import { cleServiceRole, urlSupabase } from "./config";

/**
 * Client SERVICE-ROLE pour les chemins SANS HUMAIN. RLS contournée.
 *
 * Webhooks de suivi, tâches planifiées, envois d'emails. Distinct de `admin.ts`
 * pour une raison de fond et non de style : le client admin impose un audit,
 * parce qu'un humain y lit les données d'un tiers. **Un webhook n'est
 * personne.** L'auditer produirait des milliers de lignes machine qui
 * noieraient les quelques consultations humaines — c'est-à-dire exactement
 * celles qu'on veut pouvoir retrouver en cas de litige.
 *
 * Réunir les deux dans un seul client rendrait ce choix invisible, et le
 * premier webhook écrit ensuite trancherait par accident.
 */
export function creerClientSysteme() {
  return createClient<Database>(urlSupabase(), cleServiceRole(), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Aucun appel n'attend sans fin : voir `lib/reseau/fetch-borne`.
    global: { fetch: fetchBorne() },
  });
}
