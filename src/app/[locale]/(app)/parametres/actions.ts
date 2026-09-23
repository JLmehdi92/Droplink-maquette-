"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { SchemaLangue } from "@/i18n/schema";
import { attendrePlancher } from "@/lib/auth/plancher";
import { MotDePasse, refusDuMotDePasse } from "@/lib/auth/mot-de-passe";
import { verifierFuite } from "@/lib/auth/fuites";
import { verifierMotDePasseActuel } from "@/lib/auth/reauthentification";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { verifierQuotaAuth, verifierQuotaMotDePasse } from "@/lib/limitation/quota";
import { origineDuSite } from "@/lib/site";
import { creerClientServeur } from "@/lib/supabase/server";
import { purgerCles } from "@/lib/storage/purge";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";

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
  /**
   * L'activation a commencé : le facteur est ENRÔLÉ, pas vérifié. Le QR code et
   * la clé repassent par l'état parce qu'il faut les montrer une fois — c'est le
   * secret du vendeur lui-même, rendu à sa propre session, et il ne protège
   * encore rien tant qu'un premier code ne l'a pas prouvé.
   */
  | { statut: "enrole"; facteur: string; qr: string; cle: string }
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
        | "mdp_fuite"
        | "mdp_identique"
        | "adresse_identique"
        | "code"
        | "confirmation"
        | "deja_active"
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
  if ((await verifierFuite(analyse.data.nouveau)) === "fuite") {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "mdp_fuite" };
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

/**
 * ACTIVER LA DOUBLE AUTHENTIFICATION — premier temps : enrôler.
 *
 * ⚠️ LE MOT DE PASSE ACTUEL EST EXIGÉ, ET C'EST ICI QU'IL COMPTE LE PLUS. Sans
 * lui, quelqu'un qui tient une session volée enrôlerait SON téléphone : dès le
 * premier code, la base refuserait toute requête aux sessions du propriétaire
 * (migration 156), et le vendeur serait dehors de son propre compte, sans
 * recours. La protection deviendrait l'arme.
 *
 * Un enrôlement abandonné laisse un facteur NON VÉRIFIÉ : il est retiré avant
 * d'en créer un autre, sans quoi le nom du facteur, unique par compte,
 * refuserait la seconde tentative.
 */
const Actuel = z.object({ actuel: MotDePasseActuel });

export async function commencerActivation(
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

  const analyse = Actuel.safeParse({ actuel: donnees.get("actuel") });
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
  const { data: lu, error: erreurLecture } = await supabase.auth.getUser();
  if (erreurLecture !== null || lu.user === null) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "session" };
  }
  const totp = (lu.user.factors ?? []).filter((f) => f.factor_type === "totp");
  if (totp.some((f) => f.status === "verified")) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "deja_active" };
  }
  for (const abandonne of totp) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: abandonne.id });
    if (error !== null) console.error("[parametres] facteur abandonné non retiré — " + error.message);
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DropLink" });
  await attendrePlancher(debut);
  if (error !== null) {
    console.error("[parametres] enrôlement refusé — " + error.message);
    return { statut: "erreur", motif: "indisponible" };
  }
  return { statut: "enrole", facteur: data.id, qr: data.totp.qr_code, cle: data.totp.secret };
}

/**
 * ACTIVER — second temps : le premier code prouve que l'application est réglée.
 *
 * Tant qu'il n'est pas saisi juste, rien ne s'applique : un vendeur qui a mal
 * scanné n'est pas enfermé dehors. Le facteur visé doit appartenir à CE compte
 * et être encore non vérifié — lu chez le serveur d'authentification, jamais cru
 * sur l'identifiant du formulaire. Le quota est celui du mot de passe : un code
 * à six chiffres se devine sans lui.
 */
const Confirmation = z.object({
  facteur: z.string().uuid(),
  code: z
    .string()
    .transform((v) => v.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/)),
});

export async function confirmerActivation(
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

  const analyse = Confirmation.safeParse({ facteur: donnees.get("facteur"), code: donnees.get("code") });
  if (!analyse.success) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "code" };
  }

  const supabase = await creerClientServeur();
  const { data: lu, error: erreurLecture } = await supabase.auth.getUser();
  const facteur = (lu.user?.factors ?? []).find(
    (f) => f.id === analyse.data.facteur && f.factor_type === "totp" && f.status === "unverified",
  );
  if (erreurLecture !== null || facteur === undefined) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "invalide" };
  }

  const quota = await verifierQuotaMotDePasse(profil.email);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    return {
      statut: "erreur",
      motif: quota.motif === "indisponible" ? "indisponible" : "trop_de_tentatives",
    };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: facteur.id,
    code: analyse.data.code,
  });
  await attendrePlancher(debut);
  if (error !== null) {
    return { statut: "erreur", motif: error.status === 429 ? "trop_de_tentatives" : "code" };
  }

  // Cette session vient de passer en `aal2`. Les AUTRES appareils du compte
  // demanderont le code à leur prochaine requête : c'est l'effet voulu.
  revalidatePath("/[locale]/parametres", "page");
  return { statut: "enregistre" };
}

/**
 * DÉSACTIVER LA DOUBLE AUTHENTIFICATION.
 *
 * Supabase exige déjà une session `aal2` pour retirer un facteur vérifié
 * (mesuré), et la garde d'identité en exige autant : une session qui n'a pas
 * saisi son code n'arrive pas jusqu'ici. Le mot de passe actuel est exigé EN
 * PLUS — c'est le geste qui retire la protection, et un poste resté ouvert ne
 * doit pas suffire.
 */
export async function desactiverDeuxEtapes(
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

  const analyse = Actuel.safeParse({ actuel: donnees.get("actuel") });
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
  const { data: lu } = await supabase.auth.getUser();
  const verifies = (lu.user?.factors ?? []).filter(
    (f) => f.factor_type === "totp" && f.status === "verified",
  );
  for (const f of verifies) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error !== null) {
      await attendrePlancher(debut);
      console.error("[parametres] facteur non retiré — " + error.message);
      return { statut: "erreur", motif: "indisponible" };
    }
  }

  await attendrePlancher(debut);
  revalidatePath("/[locale]/parametres", "page");
  return { statut: "enregistre" };
}

/**
 * SUPPRIMER LE COMPTE, OU SES DONNÉES — décision de Wassim du 13/09/2026, option A.
 *
 * ⚠️ TROIS PREUVES AVANT LE GESTE, ET AUCUNE NE SUFFIT SEULE :
 *  - la session, `aal2` si la double authentification est active (la base refuse
 *    sinon, migration 156) ;
 *  - le mot de passe actuel — un poste resté ouvert ne doit pas suffire à
 *    effacer un compte ;
 *  - l'adresse du compte RECOPIÉE, que la fonction SQL revérifie : c'est le geste
 *    qui force à lire quel compte on efface (même raison que la décision 12).
 *
 * La base fait le reste en UNE transaction (migration 157) : conservation d'un
 * an, clés R2 en file, suppression en cascade. La purge des objets est tentée
 * AUSSITÔT, bornée pour tenir dans la durée d'une action ; la veille rejoue la
 * file jusqu'au succès. Un échec de R2 ne ressuscite donc rien et ne perd rien.
 */
const Suppression = z.object({
  confirmation: z.string().max(254),
  actuel: MotDePasseActuel,
  locale: SchemaLangue,
});

/** Au-delà, la veille prend le relais : une action ne doit pas attendre des minutes. */
const PURGE_IMMEDIATE_MAX = 100;

async function preuvesDeSuppression(
  donnees: unknown,
): Promise<
  | { ok: true; profil: NonNullable<Awaited<ReturnType<typeof vendeurActif>>>; confirmation: string; locale: string }
  | { ok: false; etat: EtatParametres }
> {
  const profil = await vendeurActif();
  if (profil === null) return { ok: false, etat: { statut: "erreur", motif: "session" } };
  if (!(donnees instanceof FormData)) return { ok: false, etat: { statut: "erreur", motif: "invalide" } };

  const analyse = Suppression.safeParse({
    confirmation: donnees.get("confirmation"),
    actuel: donnees.get("actuel"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) return { ok: false, etat: { statut: "erreur", motif: "invalide" } };
  const { confirmation, actuel, locale } = analyse.data;

  if (confirmation.trim().toLowerCase() !== profil.email.toLowerCase()) {
    return { ok: false, etat: { statut: "erreur", motif: "confirmation" } };
  }

  const verification = await verifierMotDePasseActuel(profil.email, actuel);
  if (verification !== "ok") {
    return {
      ok: false,
      etat: {
        statut: "erreur",
        motif: verification === "trop_de_tentatives" ? "trop_de_tentatives" : "mot_de_passe_actuel",
      },
    };
  }
  return { ok: true, profil, confirmation, locale };
}

async function purgerAussitot(cles: readonly string[]): Promise<void> {
  try {
    const { echecs } = await purgerCles(cles.slice(0, PURGE_IMMEDIATE_MAX));
    if (echecs > 0) console.error(`[suppression] ${echecs} objet(s) laissé(s) à la veille`);
  } catch (erreur) {
    // La file en base est la garantie ; la purge immédiate n'est qu'un raccourci.
    console.error("[suppression] purge immédiate impossible — " + (erreur instanceof Error ? erreur.message : String(erreur)));
  }
}

export async function supprimerMonCompte(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const debut = Date.now();
  const preuves = await preuvesDeSuppression(donnees);
  if (!preuves.ok) {
    await attendrePlancher(debut);
    return preuves.etat;
  }

  const supabase = await creerClientServeur();
  const { data: cles, error } = await supabase.rpc("supprimer_mon_compte", {
    p_confirmation: preuves.confirmation,
  });
  if (error !== null) {
    await attendrePlancher(debut);
    console.error("[suppression] compte non supprimé — " + error.message);
    return { statut: "erreur", motif: error.code === "DL054" ? "confirmation" : "indisponible" };
  }

  emettreApres(EVENEMENTS.COMPTE_SUPPRIME, { sujet: preuves.profil.profilId }, { objets: (cles ?? []).length });
  await purgerAussitot(cles ?? []);

  // Le compte n'existe plus : la session côté serveur est déjà morte avec lui.
  // `local` efface les cookies de CE navigateur sans rien demander au serveur.
  const { error: erreurSortie } = await supabase.auth.signOut({ scope: "local" });
  if (erreurSortie !== null) console.error("[suppression] cookies non effacés — " + erreurSortie.message);

  await attendrePlancher(debut);
  redirect(`/${preuves.locale}/connexion?info=compte-supprime`);
}

export async function supprimerMesDonnees(
  _precedent: EtatParametres,
  donnees: unknown,
): Promise<EtatParametres> {
  const debut = Date.now();
  const preuves = await preuvesDeSuppression(donnees);
  if (!preuves.ok) {
    await attendrePlancher(debut);
    return preuves.etat;
  }

  const supabase = await creerClientServeur();
  const { data: cles, error } = await supabase.rpc("supprimer_mes_donnees", {
    p_confirmation: preuves.confirmation,
  });
  if (error !== null) {
    await attendrePlancher(debut);
    console.error("[suppression] données non supprimées — " + error.message);
    return { statut: "erreur", motif: error.code === "DL054" ? "confirmation" : "indisponible" };
  }

  emettreApres(EVENEMENTS.DONNEES_SUPPRIMEES, { sujet: preuves.profil.profilId }, { objets: (cles ?? []).length });
  await purgerAussitot(cles ?? []);

  await attendrePlancher(debut);
  revalidatePath("/[locale]", "layout");
  return { statut: "enregistre" };
}
