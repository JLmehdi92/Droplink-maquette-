import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types-base";
import { clePubliable, urlSupabase } from "./config";

/**
 * Client NAVIGATEUR, clé publiable.
 *
 * Le seul des cinq qui a le droit d'exister dans un bundle client. Il ne porte
 * aucun secret : la clé publiable est destinée à être vue, et c'est la RLS qui
 * protège les données derrière elle.
 */
export function creerClientNavigateur() {
  return createBrowserClient<Database>(urlSupabase(), clePubliable());
}
