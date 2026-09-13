import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types-base";
import { clePubliable, urlSupabase } from "./config";

/**
 * LE CLIENT DE VÉRIFICATION D'IDENTITÉ — sans cookies, sans session durable.
 *
 * IL EXISTE POUR UNE SEULE QUESTION : « ce mot de passe est-il bien celui de ce
 * compte ? », posée depuis une session DÉJÀ ouverte, avant un geste sensible —
 * changer d'adresse, de mot de passe, fermer les autres appareils.
 *
 * ⚠️ POURQUOI PAS `server.ts`. Il écrit ses cookies : y rejouer
 * `signInWithPassword` REMPLACERAIT la session en cours par une session neuve,
 * de niveau `aal1`. Le jour où la double authentification existe, vérifier un
 * mot de passe dégraderait donc silencieusement la session du vendeur — le
 * geste qui prouve l'identité retirerait la preuve la plus forte.
 *
 * ⚠️ POURQUOI PAS `anon.ts`. Il est techniquement identique, et c'est
 * précisément pourquoi il ne doit pas servir : sa cloison le réserve à la page
 * publique, et l'élargir pour ce besoin ouvrirait la page publique à tout ce qui
 * s'importerait ensuite par la même dispense. Une cloison par raison.
 *
 * La session que ce client ouvre est FERMÉE aussitôt par l'appelant
 * (`lib/auth/reauthentification.ts`) : elle ne sert qu'à répondre oui ou non.
 */
export function creerClientVerification() {
  return createClient<Database>(urlSupabase(), clePubliable(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
