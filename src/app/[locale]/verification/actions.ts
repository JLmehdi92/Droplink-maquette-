"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SchemaLangue } from "@/i18n/schema";
import { attendrePlancher } from "@/lib/auth/plancher";
import { cheminDeRefus, suivreApresSession } from "@/lib/comptes/apres-session";
import { verifierQuotaMotDePasse } from "@/lib/limitation/quota";
import { poserPreuveAppareil } from "@/lib/auth/appareil-fiable";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * LE SECOND TEMPS DE LA CONNEXION : le code à 6 chiffres.
 *
 * ⚠️ L'IDENTITÉ VIENT DU SERVEUR D'AUTHENTIFICATION, PAS DU PROFIL. À cet instant
 * la session est `aal1` et la base refuse toute lecture (migration 156) :
 * `lireProfilVendeur` rendrait `null`. `getUser()` valide le jeton auprès de
 * Supabase et rend les facteurs à jour ; le facteur visé en vient, jamais du
 * formulaire, sans quoi on pourrait viser le facteur d'un autre compte.
 *
 * ⚠️ LE QUOTA EST CELUI DU MOT DE PASSE, consommé AVANT la vérification. Un code
 * à 6 chiffres n'a qu'un million de valeurs, dont trois valides à la fois :
 * sans compteur, il se devine. Le même budget que la connexion — et non un
 * second — parce qu'alterner les deux essais ne doit pas doubler le nombre de
 * tentatives offertes à celui qui connaît déjà le mot de passe.
 *
 * Et le plancher de temps couvre tout, succès compris : un code juste ne doit
 * pas répondre plus vite ou plus lentement qu'un code faux.
 */

export type ResultatVerification =
  | { statut: "inactif" }
  | { statut: "erreur"; motif: "code" | "invalide" | "trop" | "indisponible" }
  /**
   * Le code est ACCEPTÉ, et la suite est connue. Rendu seulement à un formulaire
   * hydraté (`js=1`) : il pose les cases en vert (maquette, `compte.js`) PUIS
   * navigue. Sans JavaScript, ou avant l'hydratation, l'action redirige comme
   * avant — un formulaire qui recevrait ce résultat sans script resterait sur place.
   * Le vert suit la réponse du serveur, il ne la précède jamais (contrainte 8).
   */
  | { statut: "valide"; chemin: string };

const Saisie = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/)),
  locale: SchemaLangue,
  // `admin` : retour à l'administration une fois la session passée à deux facteurs.
  suite: z.enum(["mot-de-passe", "admin"]).optional(),
  // La case « se souvenir de cet appareil » (203) : présente seulement à la
  // connexion ordinaire, absente du flux de réinitialisation.
  souvenir: z.enum(["on"]).optional(),
  // Posé par le formulaire une fois hydraté : il sait alors naviguer lui-même.
  js: z.enum(["1"]).optional(),
});

export async function verifierCode(
  _precedent: ResultatVerification,
  donnees: unknown,
): Promise<ResultatVerification> {
  const debut = Date.now();
  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "invalide" };

  const suiteBrute = donnees.get("suite");
  const souvenirBrut = donnees.get("souvenir");
  const jsBrut = donnees.get("js");
  const analyse = Saisie.safeParse({
    // LES SIX CASES PORTENT TOUTES `name="code"` : sans JavaScript, ou avant
    // l'hydratation, le navigateur envoie les six valeurs, recollées ici. Un
    // seul champ caché rempli par React laissait un compte à double facteur
    // (l'administration, depuis la 186) sans moyen de se connecter.
    code: donnees
      .getAll("code")
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .join(""),
    locale: donnees.get("locale"),
    suite: typeof suiteBrute === "string" && suiteBrute !== "" ? suiteBrute : undefined,
    souvenir: typeof souvenirBrut === "string" && souvenirBrut !== "" ? souvenirBrut : undefined,
    js: typeof jsBrut === "string" && jsBrut !== "" ? jsBrut : undefined,
  });
  if (!analyse.success) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "invalide" };
  }
  const { code, locale, suite, souvenir, js } = analyse.data;

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.getUser();
  if (error !== null || data.user === null) {
    await attendrePlancher(debut);
    redirect(`/${locale}/connexion?erreur=session`);
  }

  const facteur = (data.user.factors ?? []).find(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  if (facteur === undefined) {
    // Rien à vérifier : le compte n'a pas (ou plus) de facteur. La suite
    // ordinaire décide, comme après toute connexion.
    const destination = await suivreApresSession(locale, supabase);
    await attendrePlancher(debut);
    redirect(destination.ok ? destination.chemin : cheminDeRefus(locale, destination.motif));
  }

  const quota = await verifierQuotaMotDePasse(data.user.email ?? data.user.id);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: quota.motif === "indisponible" ? "indisponible" : "trop" };
  }

  const { error: erreurCode } = await supabase.auth.mfa.challengeAndVerify({
    factorId: facteur.id,
    code,
  });
  if (erreurCode !== null) {
    await attendrePlancher(debut);
    // La limite du serveur d'authentification ne dépend pas du code essayé : la
    // nommer ne renseigne personne. Tout le reste est « code incorrect ».
    return { statut: "erreur", motif: erreurCode.status === 429 ? "trop" : "code" };
  }

  // ⚠️ « SE SOUVENIR DE CET APPAREIL » (203) : la session est maintenant aal2,
  // seul moment où la base accepte d'émettre une preuve. Best-effort : si elle
  // échoue, la connexion réussit quand même, l'appareil n'est simplement pas
  // retenu. JAMAIS dans le flux de réinitialisation : l'UI n'y montre pas la
  // case, mais l'action l'exclut aussi — un document qui affirme un état doit
  // l'exécuter, pas s'en remettre à l'UI (L-014).
  if (souvenir === "on" && suite !== "mot-de-passe") {
    await poserPreuveAppareil(supabase);
  }

  // Toutes les suites d'un code ACCEPTÉ passent par ici : un formulaire hydraté
  // reçoit le chemin (cases vertes, puis navigation), les autres sont redirigés.
  const aboutir = (chemin: string): ResultatVerification => {
    if (js === "1") return { statut: "valide", chemin };
    redirect(chemin);
  };

  if (suite === "mot-de-passe") {
    await attendrePlancher(debut);
    return aboutir(`/${locale}/nouveau-mot-de-passe`);
  }
  if (suite === "admin") {
    // La session est maintenant `aal2` : c'est `exigerAdmin`, à l'arrivée, qui
    // relit le rôle en base — cette redirection n'accorde rien.
    await attendrePlancher(debut);
    return aboutir(`/${locale}/admin`);
  }

  const destination = await suivreApresSession(locale, supabase);
  await attendrePlancher(debut);
  return aboutir(destination.ok ? destination.chemin : cheminDeRefus(locale, destination.motif));
}
