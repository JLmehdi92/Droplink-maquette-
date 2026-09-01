import "server-only";
import type { creerClientServeur } from "@/lib/supabase/server";

/**
 * CETTE SESSION VIENT-ELLE D'UN LIEN REÇU PAR EMAIL ?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUI A MOTIVÉ CE MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'écran « nouveau mot de passe » n'exigeait qu'UNE SESSION, pas une session de
 * RÉCUPÉRATION. Mesuré le 02/09/2026 avec le cookie d'une session ordinaire —
 * quelqu'un connecté par mot de passe, sans aucun lien reçu :
 *
 *   GET  /fr/nouveau-mot-de-passe          → 200, formulaire rendu
 *   POST changerMotDePasse (forgé)         → 303 → /fr/commandes
 *   connexion avec le NOUVEAU mot de passe → session ouverte
 *   connexion avec l'ANCIEN                → refusée
 *
 * Donc : quiconque tenait une session valide — cookie volé, poste déverrouillé,
 * téléphone prêté — changeait le mot de passe SANS connaître l'ancien.
 *
 * ⚠️ ET L'EFFET BOULE DE NEIGE RETOURNAIT NOTRE PROPRE PROTECTION CONTRE LE
 * PROPRIÉTAIRE : le changement enchaîne `signOut({scope:"others"})`, posé pour
 * couper un intrus. Mesuré avec contre-test : après le changement, le cookie du
 * VRAI propriétaire ne rouvre plus rien, pendant que celui de l'attaquant
 * survit. Un accès temporaire devenait une prise de compte définitive.
 *
 * Mon commentaire d'origine affirmait « ce qui sépare cet écran de n'importe qui
 * est la possession de la boîte mail ». C'était faux : c'était la possession de
 * la SESSION.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI SÉPARE VRAIMENT LES DEUX, ET COMMENT ON LE LIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le jeton d'accès porte la revendication `amr` — *authentication methods
 * references* —, qui dit COMMENT la session a été obtenue. Mesuré sur ce projet,
 * même compte, deux sessions ouvertes à la suite :
 *
 *     mot de passe   amr = [{"method":"password","timestamp":…}]
 *     récupération   amr = [{"method":"otp","timestamp":…}]
 *
 * ELLE EST DANS LE JETON SIGNÉ, donc infalsifiable depuis le navigateur : la
 * réécrire invaliderait la signature, et le serveur d'authentification comme
 * PostgREST refuseraient le jeton entier.
 *
 * ⚠️ `otp` COUVRE TOUT CE QUI PROUVE LA POSSESSION DE LA BOÎTE — un lien de
 * récupération aujourd'hui, un lien magique si l'on en remettait un demain. Et
 * c'est correct : la propriété qu'on exige ici n'est pas « ce lien-ci », c'est
 * « cette personne a ouvert un email envoyé à cette adresse ». Un compte pris
 * par un cookie volé, lui, porte `password` ou `oauth`, et sera refusé.
 */
export async function sessionParEmail(
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
): Promise<boolean> {
  /*
   * ⚠️ CETTE LECTURE DÉCODE LE JETON LOCAL, elle ne le revalide pas — et c'est
   * suffisant ICI, mais seulement ici. Les deux appelants ont déjà passé
   * `lireProfilVendeur`, qui interroge le serveur d'authentification : un jeton
   * dont la signature ne tient pas, ou dont la session est révoquée, n'arrive
   * jamais jusqu'à cette ligne. Et `amr` vit DANS la partie signée : la
   * réécrire invaliderait la signature, donc ferait échouer cette validation-là.
   *
   * L'ordre est la protection. Appeler cette fonction sans avoir validé la
   * session d'abord reviendrait à croire un cookie sur parole.
   */
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  /*
   * ÉCHOUE FERMÉE. Si l'on ne peut pas établir COMMENT la session a été
   * obtenue, on refuse : la seule chose que cette fonction protège est le
   * changement de mot de passe sans l'ancien, et l'accorder « dans le doute »
   * reviendrait à ne rien protéger du tout.
   */
  if (error !== null) return false;

  /*
   * DEUX FORMES POSSIBLES, et la version installée les déclare toutes les deux :
   * `AMREntry[]` (objets datés) ou `string[]` (forme RFC 8176). Ne traiter que
   * la première rendrait `false` en silence le jour où le serveur d'auth passe à
   * l'autre — et un refus silencieux sur ce chemin enfermerait dehors quelqu'un
   * qui vient précisément récupérer son compte.
   */
  return data.currentAuthenticationMethods.some(
    (methode) => (typeof methode === "string" ? methode : methode.method) === "otp",
  );
}
