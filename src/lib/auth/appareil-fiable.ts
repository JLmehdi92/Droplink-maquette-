import "server-only";
import { cookies, headers } from "next/headers";
import { OPTIONS_COOKIES } from "@/lib/auth/cookies";
import type { creerClientServeur } from "@/lib/supabase/server";

/**
 * L'APPAREIL FIABLE, CÔTÉ SERVEUR — le pendant de la migration 203.
 *
 * Après un vrai second facteur, on demande à la base une PREUVE signée et on la
 * pose en cookie `httpOnly`. À la reconnexion, on présente cette preuve à la base
 * qui, si elle est valide, marque la session comme fiable — la garde 156 laisse
 * alors passer l'espace vendeur, jamais l'administration.
 *
 * ⚠️ TOUT EST BEST-EFFORT SUR LE CHEMIN DE CONNEXION : un appareil qui ne
 * devient pas fiable renvoie simplement vers l'écran du code, comme avant. Une
 * erreur ne doit jamais bloquer la connexion.
 */

type ClientServeur = Awaited<ReturnType<typeof creerClientServeur>>;

const NOM_COOKIE = "dl_appareil";
const TRENTE_JOURS_S = 30 * 24 * 60 * 60;

/** La charge n'a pas de point, la signature non plus : un seul « . » les sépare. */
const SEPARATEUR = ".";

/**
 * Demande une preuve d'appareil fiable et la pose en cookie. À N'APPELER
 * qu'après un second facteur réellement validé (session `aal2`) : la base refuse
 * d'émettre sinon.
 *
 * On stocke l'AGENT BRUT, jamais une étiquette déjà traduite : « Paramètres » le
 * localise au rendu par `decrireAppareil`, exactement comme la liste des
 * sessions. Une chaîne « Chrome sur Windows » écrite en base serait figée dans
 * une langue.
 */
export async function poserPreuveAppareil(supabase: ClientServeur): Promise<void> {
  const enTetes = await headers();
  const agent = enTetes.get("user-agent") ?? "";

  const { data, error } = await supabase.rpc("emettre_preuve_appareil", { p_agent: agent });
  if (error !== null || data === null) {
    // On ne bloque rien : l'appareil ne sera simplement pas retenu.
    console.warn("[appareil-fiable] émission de preuve impossible — " + (error?.message ?? "réponse vide"));
    return;
  }

  const preuve = data as { charge?: unknown; signature?: unknown };
  if (typeof preuve.charge !== "string" || typeof preuve.signature !== "string") return;

  const magasin = await cookies();
  magasin.set(NOM_COOKIE, preuve.charge + SEPARATEUR + preuve.signature, {
    ...OPTIONS_COOKIES,
    maxAge: TRENTE_JOURS_S,
  });
}

/**
 * Si un cookie de preuve est présent, tente de rendre la session courante fiable.
 * Rend `true` si la session est désormais fiable. Best-effort : toute panne rend
 * `false`, et la connexion continue vers l'écran du code.
 */
export async function confirmerAppareilSiPresent(supabase: ClientServeur): Promise<boolean> {
  const magasin = await cookies();
  const brut = magasin.get(NOM_COOKIE)?.value;
  if (brut === undefined || brut === "") return false;

  const sep = brut.lastIndexOf(SEPARATEUR);
  if (sep <= 0) return false;
  const charge = brut.slice(0, sep);
  const signature = brut.slice(sep + 1);

  const { data, error } = await supabase.rpc("confirmer_appareil_fiable", {
    p_charge: charge,
    p_signature: signature,
  });
  if (error !== null) {
    console.warn("[appareil-fiable] confirmation impossible — " + error.message);
    return false;
  }
  // Une preuve refusée (cookie périmé, appareil révoqué) : on efface le cookie
  // mort pour ne pas le représenter à chaque connexion.
  if (data !== true) {
    magasin.delete(NOM_COOKIE);
    return false;
  }
  return true;
}
