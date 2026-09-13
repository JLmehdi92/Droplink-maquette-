"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SchemaLangue } from "@/i18n/schema";
import { attendrePlancher } from "@/lib/auth/plancher";
import { MotDePasse, refusDuMotDePasse } from "@/lib/auth/mot-de-passe";
import { verifierMotDePasseActuel } from "@/lib/auth/reauthentification";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { verifierQuotaAuth } from "@/lib/limitation/quota";
import { origineDuSite } from "@/lib/site";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * LES GESTES DE L'ÉCRAN « PARAMÈTRES ».
 *
 * CHAQUE EXPORT EST UN POINT D'ENTRÉE PUBLIC — un module `"use server"` n'a pas
 * d'export interne. Chaque action porte donc SA garde, lue en base sous RLS
 * (`lireProfilVendeur`), et refuse un compte suspendu : la suspension doit
 * couper l'espace vendeur entier, pas seulement ses pages.
 *
 * ⚠️ TOUT CE QUI PROTÈGE LE COMPTE EXIGE LE MOT DE PASSE ACTUEL. Adresse, mot de
 * passe, fermeture des autres appareils : une session ne suffit pas, un cookie
 * volé en est une. Voir `lib/auth/reauthentification.ts`, et le défaut déjà payé
 * sur `nouveau-mot-de-passe`.
 *
 * ⚠️ ET CES TROIS GESTES ATTENDENT UN PLANCHER DE TEMPS, SUCCÈS COMPRIS. Sans lui,
 * le chronomètre dirait ce que le message tait : un mot de passe faux se refuse
 * plus vite qu'un bon ne se vérifie puis s'applique.
 */

export type EtatParametres =
  | { statut: "inactif" }
  | { statut: "enregistre" }
  | {
      statut: "erreur";
      motif:
        | "session"
        | "invalide"
        | "mot_de_passe_actuel"
        | "trop_de_tentatives"
        | "mdp_trop_court"
        | "mdp_trop_long"
        | "mdp_contient_email"
        | "mdp_identique"
        | "adresse_identique"
        | "indisponible";
    };

const MotDePasseActuel = z.string().min(1).max(1024);

/** La garde commune : une identité vérifiée EN BASE, active. */
async function vendeurActif() {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut === "suspended") return null;
  return profil;
}

/**
 * LE NOM AFFICHÉ.
 *
 * Aucun mot de passe ici : ce nom ne protège rien et ne sort pas de l'espace du
 * vendeur. La colonne est bornée en base ; Zod dit la même borne pour pouvoir
 * refuser avec un motif plutôt qu'avec une erreur de contrainte.
 */
const Nom = z.object({
  nom: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(80)),
});

export async function enregistrerNom(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const profil = await vendeurActif();
  if (profil === null) return { statut: "erreur", motif: "session" };
  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "invalide" };

  const analyse = Nom.safeParse({ nom: donnees.get("nom") });
  if (!analyse.success) return { statut: "erreur", motif: "invalide" };

  const supabase = await creerClientServeur();
  // LE FILTRE N'EST PAS LA PROTECTION : la RLS limite la mise à jour à la ligne
  // du vendeur connecté, et le privilège de colonne à ce seul champ. Il sert à
  // ne viser qu'une ligne, pas à décider laquelle on a le droit de viser.
  const { error } = await supabase
    .from("profiles")
    .update({ nom_affiche: analyse.data.nom === "" ? null : analyse.data.nom })
    .eq("id", profil.profilId);

  if (error !== null) {
    console.error("[parametres] nom non enregistré — " + error.message);
    return { statut: "erreur", motif: "indisponible" };
  }

  revalidatePath("/[locale]", "layout");
  return { statut: "enregistre" };
}

/**
 * LE MOT DE PASSE, DEPUIS UNE SESSION OUVERTE.
 *
 * ⚠️ L'ANCIEN EST EXIGÉ, ET VÉRIFIÉ AVANT TOUT AUTRE CONTRÔLE. Refuser d'abord
 * un nouveau mot de passe trop court, puis seulement vérifier l'ancien, ferait
 * de cet écran un moyen de tester l'ancien sans jamais le donner juste.
 *
 * LES AUTRES SESSIONS SONT FERMÉES ENSUITE : changer son mot de passe est ce
 * qu'on fait quand on soupçonne un intrus, et laisser vivre ses sessions
 * viderait le geste de son sens.
 */
const ChangementMotDePasse = z.object({
  actuel: MotDePasseActuel,
  nouveau: MotDePasse,
});

export async function changerMotDePasseCompte(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const debut = Date.now();
  const profil = await vendeurActif();
  if (profil === null) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }
  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "invalide" };

  const actuel = donnees.get("actuel");
  const nouveau = donnees.get("nouveau");
  if (typeof actuel !== "string" || !MotDePasseActuel.safeParse(actuel).success) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "mot_de_passe_actuel" };
  }

  const verification = await verifierMotDePasseActuel(profil.email, actuel);
  if (verification !== "ok") {
    await attendrePlancher(debut);
    return {
      statut: "erreur",
      motif: verification === "trop_de_tentatives" ? "trop_de_tentatives" : "mot_de_passe_actuel",
    };
  }

  const analyse = ChangementMotDePasse.safeParse({ actuel, nouveau });
  if (!analyse.success || typeof nouveau !== "string") {
    await attendrePlancher(debut);
    const refus = typeof nouveau === "string" ? refusDuMotDePasse(nouveau, profil.email) : [];
    return { statut: "erreur", motif: refus.includes("trop_long") ? "mdp_trop_long" : "mdp_trop_court" };
  }
  if (refusDuMotDePasse(analyse.data.nouveau, profil.email).includes("contient_email")) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "mdp_contient_email" };
  }
  if (analyse.data.nouveau === actuel) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "mdp_identique" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.updateUser({ password: analyse.data.nouveau });
  if (error !== null) {
    await attendrePlancher(debut);
    console.error("[parametres] mot de passe refusé par le serveur d'authentification — " + error.message);
    return { statut: "erreur", motif: "indisponible" };
  }

  const { error: erreurAutres } = await supabase.auth.signOut({ scope: "others" });
  if (erreurAutres !== null) {
    // Le mot de passe est DÉJÀ changé : refuser maintenant ferait croire que
    // rien n'a été fait. Le journal porte la trace.
    console.error("[parametres] autres sessions non fermées — " + erreurAutres.message);
  }

  revalidatePath("/[locale]/parametres", "page");
  await attendrePlancher(debut);
  return { statut: "enregistre" };
}

/**
 * L'ADRESSE DU COMPTE.
 *
 * ⚠️ RIEN NE CHANGE AVANT QUE LA NOUVELLE ADRESSE SOIT PROUVÉE. `updateUser`
 * n'écrit pas l'adresse : il envoie un lien de confirmation, et l'adresse ne
 * bascule qu'une fois ce lien suivi — le déclencheur de la migration 154 recopie
 * alors la nouvelle dans `profiles`. Une adresse que personne n'a prouvée ne
 * remplace jamais l'ancienne.
 *
 * ⚠️ LA RÉPONSE EST LA MÊME QUE L'ADRESSE SOIT LIBRE OU DÉJÀ PRISE. Le serveur
 * d'authentification refuse une adresse qui appartient à un autre compte : le
 * dire ferait de cet écran un annuaire, borné seulement par le quota. On répond
 * « un lien a été envoyé si l'adresse peut le recevoir », pour les deux cas.
 *
 * LE COMPTEUR EST CELUI DES ENVOIS, indexé sur la NOUVELLE adresse : c'est elle
 * qu'on bombarderait de liens.
 */
const ChangementAdresse = z.object({
  actuel: MotDePasseActuel,
  adresse: z.string().trim().toLowerCase().min(3).max(254).email(),
  locale: SchemaLangue,
});

export async function changerAdresseCompte(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const debut = Date.now();
  const profil = await vendeurActif();
  if (profil === null) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }
  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "invalide" };

  const analyse = ChangementAdresse.safeParse({
    actuel: donnees.get("actuel"),
    adresse: donnees.get("adresse"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "invalide" };
  }
  const { actuel, adresse, locale } = analyse.data;

  if (adresse === profil.email.toLowerCase()) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "adresse_identique" };
  }

  const verification = await verifierMotDePasseActuel(profil.email, actuel);
  if (verification !== "ok") {
    await attendrePlancher(debut);
    return {
      statut: "erreur",
      motif: verification === "trop_de_tentatives" ? "trop_de_tentatives" : "mot_de_passe_actuel",
    };
  }

  const quota = await verifierQuotaAuth(adresse);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "trop_de_tentatives" };
  }

  const origine = await origineDuSite();
  if (origine === null) {
    await attendrePlancher(debut);
    console.error("[parametres] changement d'adresse impossible : aucune origine fiable");
    return { statut: "erreur", motif: "indisponible" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.updateUser(
    { email: adresse },
    { emailRedirectTo: `${origine}/${locale}/auth/retour?suite=adresse` },
  );

  await attendrePlancher(debut);

  if (error !== null) {
    // AUCUNE ERREUR NE REMONTE : « déjà prise » et « budget d'envoi épuisé »
    // renseigneraient chacune sur une adresse. Le journal porte la vraie cause.
    console.error("[parametres] demande de changement d'adresse en échec — " + error.message);
  }
  return { statut: "enregistre" };
}

/**
 * FERMER LES AUTRES APPAREILS.
 *
 * Le mot de passe est exigé ici aussi, et pour la raison inverse de ce qu'on
 * croirait : sans lui, quelqu'un qui tient une session volée pourrait éjecter
 * le propriétaire de tous ses autres appareils — le laisser seul maître du
 * compte le temps que le vendeur se reconnecte.
 */
const FermetureAutres = z.object({ actuel: MotDePasseActuel });

export async function fermerAutresSessions(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const debut = Date.now();
  const profil = await vendeurActif();
  if (profil === null) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }
  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "invalide" };

  const analyse = FermetureAutres.safeParse({ actuel: donnees.get("actuel") });
  if (!analyse.success) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "mot_de_passe_actuel" };
  }

  const verification = await verifierMotDePasseActuel(profil.email, analyse.data.actuel);
  if (verification !== "ok") {
    await attendrePlancher(debut);
    return {
      statut: "erreur",
      motif: verification === "trop_de_tentatives" ? "trop_de_tentatives" : "mot_de_passe_actuel",
    };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  await attendrePlancher(debut);

  if (error !== null) {
    console.error("[parametres] autres sessions non fermées — " + error.message);
    return { statut: "erreur", motif: "indisponible" };
  }
  // La liste « Voir les sessions » est rendue par le serveur : sans relecture,
  // elle montrerait encore les appareils qu'on vient de déconnecter.
  revalidatePath("/[locale]/parametres", "page");
  return { statut: "enregistre" };
}

/**
 * LA LANGUE DE L'INTERFACE.
 *
 * Elle est écrite dans le profil ET portée par l'URL : la langue affichée est
 * celle du chemin, et le profil sert à ce qui n'a pas de chemin — les emails.
 * On redirige donc vers le même écran, dans la langue choisie.
 */
const ChoixLangue = z.object({ langue: SchemaLangue });

export async function changerLangueInterface(donnees: unknown): Promise<void> {
  const profil = await vendeurActif();
  const analyse = ChoixLangue.safeParse({
    langue: donnees instanceof FormData ? donnees.get("langue") : null,
  });
  if (profil === null || !analyse.success) {
    redirect(`/${profil?.langue ?? "fr"}/parametres`);
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase
    .from("profiles")
    .update({ locale: analyse.data.langue })
    .eq("id", profil.profilId);
  if (error !== null) {
    console.error("[parametres] langue non enregistrée — " + error.message);
  }

  redirect(`/${analyse.data.langue}/parametres`);
}
