import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types-base";
import { clePubliable, urlSupabase } from "./config";

/**
 * Client NAVIGATEUR, clé publiable.
 *
 * Le seul des cinq qui a le droit d'exister dans un bundle client. Il ne porte
 * aucun secret : la clé publiable est destinée à être vue, et c'est la RLS qui
 * protège les données derrière elle.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ IL N'EST APPELÉ NULLE PART, ET C'EST PRÉCISÉMENT LE PROBLÈME (L-029)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Relevé à l'audit du 02/09/2026 : zéro site d'appel dans tout le dépôt. C'était
 * donné pour rassurant — « aucun accès Supabase ne part du navigateur, donc les
 * cookies de session n'ont jamais besoin d'être lisibles en JavaScript ». Mais
 * une protection qui tient à une ABSENCE n'est pas une protection : la phrase
 * juste était « ce serait ouvert si quelqu'un appelait cette fonction ».
 *
 * CE QUE LE PREMIER APPEL AURAIT COÛTÉ. `@supabase/ssr` pose ses défauts à
 * `httpOnly:false` et ne pose `secure` nulle part. Ce constructeur était le seul
 * des trois à ne pas porter `OPTIONS_COOKIES` : au premier usage, il aurait
 * réécrit `sb-…-auth-token` PAR-DESSUS le cookie bien fermé par le serveur —
 * jeton d'accès ET jeton de rafraîchissement redevenus lisibles par n'importe
 * quel script, pour quatre cents jours.
 *
 * ⚠️ ET `httpOnly` NE SE RATTRAPE PAS ICI. Un cookie posé par `document.cookie`
 * ne peut pas être `httpOnly` — c'est la définition même du drapeau. Il n'existe
 * donc AUCUNE façon d'appeler ce constructeur sans dégrader la session.
 *
 * D'où le refus explicite plutôt qu'une correction cosmétique : la fonction
 * existe encore — la retirer ferait disparaître du dépôt la trace de la
 * décision — mais elle échoue bruyamment, au premier appel, chez celui qui
 * l'écrit. Le jour où un besoin réel apparaît, il faudra d'abord décider ce
 * qu'on fait de la session, et ce refus force cette décision.
 */
export function creerClientNavigateur() {
  throw new Error(
    "creerClientNavigateur() est délibérément fermé : un client Supabase dans " +
      "le navigateur réécrirait les cookies de session sans `httpOnly` — " +
      "impossible à poser depuis `document.cookie` — et les rendrait lisibles " +
      "par n'importe quel script pendant 400 jours. Passer par une Server " +
      "Action ou un route handler. Voir `lib/supabase/client.ts`.",
  );

  // Conservé pour que la forme du client reste sous les yeux de qui rouvrira ce
  // fichier, et pour que le type de retour ne devienne pas `never`.
  return createBrowserClient<Database>(urlSupabase(), clePubliable());
}
