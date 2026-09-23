import "server-only";

import { createServerClient } from "@supabase/ssr";
import { fetchBorne } from "@/lib/reseau/fetch-borne";
import { OPTIONS_COOKIES } from "@/lib/auth/cookies";
import { cookies, headers } from "next/headers";
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
  const [magasin, enTetes] = await Promise.all([cookies(), headers()]);
  const agent = (enTetes.get("user-agent") ?? "").slice(0, 400);

  return createServerClient<Database>(urlSupabase(), clePubliable(), {
    /*
     * ⚠️ L'AGENT UTILISATEUR DU NAVIGATEUR, TRANSMIS AU SERVEUR D'AUTHENTIFICATION.
     *
     * Une session s'ouvre depuis une Server Action : c'est donc NOTRE serveur
     * qui appelle Supabase, et Supabase enregistre SON agent. Mesuré le
     * 13/09/2026 dans `auth.sessions` : « node » pour chaque session, quel que
     * soit l'appareil. « Voir les sessions » aurait rendu « Appareil non
     * reconnu » sur chaque ligne, à chaque vendeur — une liste qui ne permet de
     * reconnaître aucun appareil ne permet pas de décider lequel déconnecter.
     *
     * L'en-tête vient du navigateur du vendeur et ne décrit que lui ; il n'ouvre
     * rien et ne prouve rien. Borné à 400 caractères comme sa lecture.
     */
    // Aucun appel n'attend sans fin : voir `lib/reseau/fetch-borne`. Le mandataire
    // du navigateur n'est transmis que s'il existe.
    global: {
      fetch: fetchBorne(),
      ...(agent === "" ? {} : { headers: { "user-agent": agent } }),
    },
    // Les jetons de session ne doivent JAMAIS être lisibles en JavaScript :
    // la bibliothèque les pose `httpOnly:false` par défaut.
    cookieOptions: OPTIONS_COOKIES,
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
