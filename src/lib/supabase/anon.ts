import "server-only";

import { createClient } from "@supabase/supabase-js";
import { fetchBorne } from "@/lib/reseau/fetch-borne";
import type { Database } from "./types-base";
import { clePubliable, urlSupabase } from "./config";

/**
 * Client SERVEUR SANS SESSION — page publique `/p/[token]` UNIQUEMENT.
 *
 * Il existe parce que `server.ts` lit les cookies. Sans lui, le rendu de la
 * page publique dépendrait de la présence d'un cookie, et **un vendeur connecté
 * verrait sa propre page autrement que son client** — sans que personne s'en
 * aperçoive avant que ça compte, c'est-à-dire une fois le lien envoyé.
 *
 * Aucune persistance de session, aucun rafraîchissement de jeton : ce client ne
 * doit avoir aucune mémoire d'un utilisateur, jamais.
 */
export function creerClientAnonyme() {
  return createClient<Database>(urlSupabase(), clePubliable(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    // Aucun appel n'attend sans fin : voir `lib/reseau/fetch-borne`.
    global: { fetch: fetchBorne() },
  });
}
