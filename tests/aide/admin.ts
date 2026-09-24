import type { Client } from "pg";
import { interroger } from "./base";
import { codeTotp } from "./totp";
import type { UtilisateurDeTest } from "./utilisateurs";

/**
 * FAIT D'UN UTILISATEUR DE TEST UN ADMINISTRATEUR — AVEC SA DOUBLE AUTHENTIFICATION.
 *
 * Depuis la migration 186 (23/09/2026), l'administration exige une session
 * `aal2` EN BASE : `est_admin()` et `journaliser_admin()` refusent une session
 * à un seul facteur. Poser le rôle ne suffit donc plus — il faut un vrai facteur
 * TOTP, vérifié avec un vrai code, exactement comme l'administrateur le fait.
 *
 * `challengeAndVerify` élève la session DU CLIENT DE L'UTILISATEUR : c'est
 * `u.client` lui-même qui devient `aal2`, et chaque appel suivant porte le jeton
 * élevé. Aucun raccourci, aucune session fabriquée.
 */
export async function promouvoirAdmin(catalogue: Client, u: UtilisateurDeTest): Promise<void> {
  await interroger(catalogue, "update public.profiles set role = 'admin' where id = $1", [u.profilId]);
  await eleverEnDoubleFacteur(u);
}

/**
 * Enrôle un facteur TOTP réel et élève la session du client en `aal2`.
 *
 * ⚠️ IDEMPOTENTE, ET ELLE NE L'ÉTAIT PAS (audit du 24/09/2026). Le banc de
 * performance promeut son administrateur à CHAQUE mesure : chaque appel enrôlait
 * un facteur de plus, et Supabase refuse au-delà de dix (« Maximum number of
 * verified factors reached ») — deux mesures d'administration tombaient, non pas
 * lentes, mais en erreur. Une session déjà `aal2` n'a rien à prouver de plus.
 */
export async function eleverEnDoubleFacteur(u: UtilisateurDeTest): Promise<void> {
  const { data: niveau } = await u.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.currentLevel === "aal2") return;
  const { data: enrole, error: eEnrole } = await u.client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "admin-" + u.profilId.slice(0, 8) + "-" + String(Date.now()),
  });
  if (eEnrole !== null) throw new Error("enrôlement du facteur admin : " + eEnrole.message);
  const { error: eVerif } = await u.client.auth.mfa.challengeAndVerify({
    factorId: enrole.id,
    code: codeTotp(enrole.totp.secret),
  });
  if (eVerif !== null) throw new Error("vérification du facteur admin : " + eVerif.message);
}

/**
 * Les revendications RÉELLES du jeton de session de l'utilisateur, pour les
 * suites qui simulent une session par `request.jwt.claims` sur une connexion
 * Postgres directe. Depuis la migration 186 la base lit aussi `aal` : recopier
 * seulement `sub` ferait passer un administrateur pour une session à un seul
 * facteur, et écrire `aal2` à la main validerait un niveau que personne n'a
 * présenté.
 */
export async function revendicationsReelles(u: UtilisateurDeTest): Promise<string> {
  const { data } = await u.client.auth.getSession();
  const charge = (data.session?.access_token ?? "").split(".")[1] ?? "";
  if (charge === "") return JSON.stringify({ sub: u.userId });
  return Buffer.from(charge, "base64url").toString("utf8");
}
