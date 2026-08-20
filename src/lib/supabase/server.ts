import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types-base";
import { clePubliable, urlSupabase } from "./config";

/**
 * Client SERVEUR AVEC SESSION. RLS active. C'est le client PAR DÉFAUT.
 *
 * Toute lecture ou écriture faite au nom d'un vendeur connecté passe par ici.
 * S'il vous vient l'envie d'utiliser `admin.ts` « juste pour cette requête »,
 * c'est le signe qu'une policy manque, pas qu'il faut contourner l'isolation.
 */
export async function creerClientServeur() {
  const magasin = await cookies();

  return createServerClient<Database>(urlSupabase(), clePubliable(), {
    cookies: {
      getAll() {
        return magasin.getAll();
      },
      setAll(aPoser) {
        try {
          for (const { name, value, options } of aPoser) {
            magasin.set(name, value, options);
          }
        } catch {
          // Écriture depuis un Server Component : Next l'interdit, et c'est
          // normal — le middleware a déjà rafraîchi la session en amont. On
          // n'avale donc pas un échec d'écriture, on constate un cas prévu.
          //
          // Ce `catch` est intentionnellement non vide de sens : il ne masque
          // aucune erreur qu'on saurait traiter ici.
        }
      },
    },
  });
}
