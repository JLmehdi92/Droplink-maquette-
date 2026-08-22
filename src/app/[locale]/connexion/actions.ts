"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attendrePlancher } from "@/lib/auth/plancher";
import { fournisseurActif } from "@/lib/auth/fournisseurs";
import { verifierQuotaAuth, verifierQuotaAuthAdresse } from "@/lib/limitation/quota";
import { origineDuSite } from "@/lib/site";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * Envoi du lien de connexion, CÔTÉ SERVEUR.
 *
 * UN SEUL GESTE POUR S'INSCRIRE ET POUR SE CONNECTER. Avec un lien magique, la
 * distinction n'existe pas techniquement : on envoie un lien à une adresse. Deux
 * écrans existent parce que deux intentions existent, mais ils appellent la même
 * action et le serveur se comporte exactement pareil.
 *
 * CE QUI EST DÉLIBÉRÉ ICI, ET POURQUOI.
 *
 * `shouldCreateUser` vaut TOUJOURS `true`. L'alternative — refuser la création
 * sur l'écran de connexion pour dire « aucun compte pour cette adresse » — a été
 * mesurée sur le vrai projet :
 *
 *     email SANS compte : 422 `otp_disabled`      en  49 ms
 *     email AVEC compte : autre code              en 778 ms
 *
 * Deux oracles, pas un. Même en uniformisant les codes d'erreur, l'écart de
 * seize fois sur le délai reste lisible depuis l'extérieur : n'importe qui
 * pourrait balayer des adresses et apprendre lesquelles ont un compte ici. Sur
 * un produit qui sert ce marché, cette liste a une valeur marchande — c'est
 * exactement ce qui a été extrait de Pandabuy.
 *
 * La faute de frappe, elle, est traitée à la SAISIE (`lib/email/domaines`), sans
 * qu'aucune requête ne parte. Les deux besoins ne vivent pas au même endroit, on
 * ne sacrifie donc ni l'un ni l'autre.
 *
 * Le seul endroit où l'on peut dire « tu n'avais pas encore de compte » est
 * l'email lui-même : il n'est lu que par le propriétaire de la boîte.
 */

const Saisie = z.object({
  // La langue voyage avec le formulaire : le lien reçu par email doit ramener
  // l'utilisateur dans la langue où il était, pas dans celle par défaut.
  locale: z.enum(["fr", "en"]),
  // Zod sur toute entrée externe, y compris ce qui « vient de notre
  // formulaire » : le formulaire n'est qu'une suggestion, la requête est ce qui
  // arrive vraiment.
  email: z.string().trim().min(3).max(254).email(),
  // N'influence QUE le libellé affiché. Aucun effet sur le comportement du
  // serveur — sans quoi elle redeviendrait un canal de distinction.
  intention: z.enum(["connexion", "inscription"]).default("connexion"),
});

export type ResultatConnexion =
  | { statut: "inactif" }
  | { statut: "envoye"; email: string }
  | { statut: "erreur"; motif: "email_invalide" | "trop_de_tentatives" | "envoi" };

export async function envoyerLienConnexion(
  _precedent: ResultatConnexion,
  donnees: FormData,
): Promise<ResultatConnexion> {
  const debut = Date.now();

  const analyse = Saisie.safeParse({
    email: donnees.get("email"),
    locale: donnees.get("locale"),
    intention: donnees.get("intention") ?? undefined,
  });
  if (!analyse.success) {
    // Un format d'adresse invalide ne dit rien de l'existence d'un compte : ce
    // refus peut être immédiat sans rien divulguer.
    return { statut: "erreur", motif: "email_invalide" };
  }

  // LE QUOTA EST CONSOMMÉ AVANT L'APPEL À SUPABASE, et c'est tout l'intérêt.
  // Mesuré sur ce projet : une demande crée `auth.users`, `profiles` ET `shops`
  // immédiatement, avant que quiconque ait cliqué. Vérifier après coup laisserait
  // donc les comptes fantômes se créer — on saurait qu'on a été balayé sans
  // l'avoir empêché.
  const quota = await verifierQuotaAuth(analyse.data.email);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    // Le motif est le MÊME dans les deux cas côté utilisateur : lui dire que
    // notre compteur est en panne ne lui apprend rien d'actionnable, et
    // distinguer les deux réponses renseignerait un attaquant sur notre état.
    return { statut: "erreur", motif: "trop_de_tentatives" };
  }

  const origine = await origineDuSite();
  if (origine === null) {
    // Sans origine fiable on ne construit pas d'URL de retour : deviner
    // produirait un lien qui mène ailleurs que là où l'utilisateur se trouve.
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "envoi" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signInWithOtp({
    email: analyse.data.email,
    options: {
      emailRedirectTo: `${origine}/${analyse.data.locale}/auth/retour`,
      shouldCreateUser: true,
    },
  });

  // LE PLANCHER S'APPLIQUE À TOUS LES CHEMINS QUI ONT TOUCHÉ SUPABASE, succès
  // comme échec. L'appliquer au seul succès rendrait l'échec reconnaissable à sa
  // rapidité, ce qui reconstituerait l'oracle qu'on vient de supprimer.
  await attendrePlancher(debut);

  if (error !== null) {
    // On distingue la limite de débit du reste : dire « réessayez » à quelqu'un
    // qui vient d'être limité le ferait réessayer aussitôt, donc échouer à
    // nouveau, et conclure que le produit est cassé. Cette distinction ne
    // dépend pas de l'existence d'un compte, elle ne divulgue donc rien.
    return {
      statut: "erreur",
      motif: error.status === 429 ? "trop_de_tentatives" : "envoi",
    };
  }

  // L'état « envoyé » n'est rendu qu'APRÈS une réponse sans erreur. L'annoncer
  // avant serait un pari sur le serveur, et un pari perdu laisserait
  // l'utilisateur attendre un email qui n'est jamais parti.
  return { statut: "envoye", email: analyse.data.email };
}

/**
 * DÉPART VERS GOOGLE.
 *
 * SERVER ACTION, ET AUCUN JAVASCRIPT CLIENT. Le client Supabase du navigateur
 * saurait faire cette redirection, mais il faudrait alors embarquer un îlot
 * client sur la page de connexion — pour un bouton qui ne fait que naviguer.
 * `skipBrowserRedirect` rend l'URL au lieu de l'emprunter, et le serveur y
 * redirige lui-même.
 *
 * CETTE ACTION PORTE SA PROPRE GARDE. Dans un module `"use server"`, chaque
 * export est un point d'entrée atteignable par une requête forgée : elle n'est
 * pas protégée par le fait que le bouton ne soit pas affiché. Vérifier ici que
 * le fournisseur est réellement configuré évite de lancer un aller-retour vers
 * Google avec des identifiants vides — l'utilisateur atterrirait sur une erreur
 * Google, chez Google, en concluant que c'est nous qui sommes cassés.
 *
 * LE QUOTA EST CELUI DU LIEN MAGIQUE, pas un second. Deux compteurs distincts
 * offriraient un budget doublé à qui alterne les deux chemins.
 */
const DepartExterne = z.object({ locale: z.enum(["fr", "en"]) });

export async function partirVersGoogle(donnees: FormData): Promise<void> {
  const analyse = DepartExterne.safeParse({ locale: donnees.get("locale") });
  const langue = analyse.success ? analyse.data.locale : "fr";

  if (!fournisseurActif("google")) {
    redirect(`/${langue}/connexion?erreur=indisponible`);
  }

  const quota = await verifierQuotaAuthAdresse();
  if (!quota.autorise) {
    redirect(`/${langue}/connexion?erreur=trop`);
  }

  const origine = await origineDuSite();
  if (origine === null) {
    redirect(`/${langue}/connexion?erreur=indisponible`);
  }

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // LA MÊME ROUTE DE RETOUR QUE LE LIEN MAGIQUE. Elle échange déjà le code
      // contre une session, vérifie le profil, refuse un compte suspendu et
      // compte l'inscription au premier passage : dupliquer cette logique pour
      // Google aurait fait diverger les deux chemins, et c'est le second qu'on
      // oublie de corriger.
      redirectTo: `${origine}/${langue}/auth/retour`,
      skipBrowserRedirect: true,
    },
  });

  if (error !== null || data.url === null) {
    redirect(`/${langue}/connexion?erreur=indisponible`);
  }

  redirect(data.url);
}
