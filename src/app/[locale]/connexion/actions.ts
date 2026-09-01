"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attendrePlancher } from "@/lib/auth/plancher";
import { fournisseurActif } from "@/lib/auth/fournisseurs";
import { MotDePasse, refusDuMotDePasse } from "@/lib/auth/mot-de-passe";
import { cheminDeRefus, suivreApresSession } from "@/lib/comptes/apres-session";
import {
  verifierQuotaAuth,
  verifierQuotaAuthAdresse,
  verifierQuotaMotDePasse,
} from "@/lib/limitation/quota";
import { origineDuSite } from "@/lib/site";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * L'ACCÈS AU COMPTE — email et mot de passe.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI A CHANGÉ LE 01/09/2026, ET CE QUI N'A PAS CHANGÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier n'avait qu'une action, `envoyerLienConnexion`, et son en-tête
 * expliquait pourquoi l'inscription et la connexion ne pouvaient PAS être
 * distinguées : avec un lien magique, il n'y a qu'un geste — on envoie un lien
 * à une adresse. Deux écrans, une action, et une propriété `intention` qui ne
 * changeait QUE le libellé du bouton.
 *
 * Avec un mot de passe, ce sont deux gestes différents : l'un vérifie, l'autre
 * crée. Le fork qui n'existait pas est ici.
 *
 * CE QUI SURVIT INTACT, ET QUI COMPTE PLUS QUE LE RESTE : le refus de laisser
 * fuir l'existence d'un compte. La mesure qui l'avait imposé tient toujours —
 * un chemin qui court-circuite répond seize fois plus vite qu'un chemin qui
 * travaille, et le chronomètre parle même quand les messages se taisent. Le
 * plancher de 1 200 ms s'applique donc à TOUTES les sorties de TOUTES les
 * actions de ce fichier, succès compris.
 *
 * Avec le mot de passe, la raison devient encore plus littérale : le hachage ne
 * s'exécute QUE si le compte existe. Sans plancher, « adresse inconnue » et
 * « mot de passe faux » se distingueraient au millième de seconde près, quel
 * que soit le soin mis à écrire le même message pour les deux.
 *
 * ⚠️ UNE EXCEPTION, ASSUMÉE ET ÉCRITE AU §9 DU BRIEF : L'INSCRIPTION — MAIS
 * SEULEMENT DANS UN DES DEUX RÉGLAGES.
 *
 * Ce paragraphe a d'abord dit « la confirmation d'email étant désactivée
 * (décision de Wassim) ». C'était le réglage VOULU, pas le réglage EN VIGUEUR :
 * mesuré, la confirmation est ACTIVE (`mailer_autoconfirm: false`, et
 * `signInWithPassword` sur un compte non confirmé rend `email_not_confirmed`).
 * Un commentaire qui affirme un état que personne n'a exécuté est exactement ce
 * que ce projet traque, et celui-ci décrivait comme ouvert un trou déjà fermé.
 *
 *   - confirmation ACTIVE (aujourd'hui) : `signUp` sur une adresse déjà
 *     inscrite rend un utilisateur OBFUSQUÉ sans session, et n'envoie rien. Le
 *     doublon est indiscernable d'une inscription réussie. Pas d'oracle.
 *   - confirmation DÉSACTIVÉE (ce que Wassim a tranché) : elle rend « User
 *     already registered ». L'oracle existe alors, il n'est pas rattrapable ici
 *     — une inscription réussie ouvre une session, un doublon non — et il est
 *     BORNÉ par les compteurs.
 *
 * Ce fichier gère les deux, parce qu'il ne peut pas savoir lequel est en
 * vigueur : le réglage vit dans le tableau de bord, hors du dépôt.
 */

const Langue = z.enum(["fr", "en"]);

/*
 * Zod sur toute entrée externe, y compris ce qui « vient de notre formulaire » :
 * le formulaire n'est qu'une suggestion, la requête est ce qui arrive vraiment.
 */
const Identifiants = z.object({
  locale: Langue,
  email: z.string().trim().min(3).max(254).email(),
  // AUCUNE CONTRAINTE DE LONGUEUR À LA CONNEXION, et c'est voulu. Refuser ici un
  // mot de passe trop court dirait qu'il ne peut pas être le bon — donc que le
  // compte, s'il existe, en a un plus long. On laisse le serveur d'auth
  // répondre, toujours la même chose.
  motDePasse: z.string().min(1).max(1024),
});

const Inscription = z.object({
  locale: Langue,
  email: z.string().trim().min(3).max(254).email(),
  motDePasse: MotDePasse,
});

const Adresse = z.object({
  locale: Langue,
  email: z.string().trim().min(3).max(254).email(),
});

export type ResultatConnexion =
  | { statut: "inactif" }
  | {
      statut: "erreur";
      motif: "identifiants" | "email_invalide" | "trop_de_tentatives" | "indisponible";
    };

export type ResultatInscription =
  | { statut: "inactif" }
  | {
      statut: "erreur";
      motif:
        | "email_invalide"
        | "mdp_trop_court"
        | "mdp_trop_long"
        | "mdp_contient_email"
        | "deja_inscrit"
        | "trop_de_tentatives"
        | "indisponible";
    };

export type ResultatReinitialisation =
  | { statut: "inactif" }
  | { statut: "envoye" }
  | { statut: "erreur"; motif: "email_invalide" | "trop_de_tentatives" };

/**
 * SE CONNECTER.
 *
 * UN SEUL MESSAGE D'ÉCHEC POUR TOUTES LES CAUSES D'IDENTIFIANTS : adresse
 * inconnue, mot de passe faux, compte non confirmé. Les trois se corrigent de la
 * même façon du point de vue de qui possède le compte, et les distinguer
 * renseignerait qui ne le possède pas.
 */
export async function seConnecter(
  _precedent: ResultatConnexion,
  donnees: unknown,
): Promise<ResultatConnexion> {
  const debut = Date.now();

  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "indisponible" };

  const analyse = Identifiants.safeParse({
    email: donnees.get("email"),
    motDePasse: donnees.get("motDePasse"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) {
    // Une adresse mal FORMÉE ne dit rien de l'existence d'un compte : ce refus
    // peut être immédiat sans rien divulguer.
    return { statut: "erreur", motif: "email_invalide" };
  }

  const { email, motDePasse, locale } = analyse.data;

  // LE QUOTA EST CONSOMMÉ AVANT L'APPEL. Vérifier après coup laisserait le
  // bourrage se dérouler : on saurait qu'on a été balayé sans l'avoir empêché.
  const quota = await verifierQuotaMotDePasse(email);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    // Le motif est le MÊME que le compteur ait dit « plein » ou soit tombé :
    // dire qu'il est en panne ne donne rien d'actionnable à un utilisateur, et
    // renseigne un attaquant sur notre état.
    return { statut: "erreur", motif: "trop_de_tentatives" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });

  /*
   * LE PLANCHER EST ATTENDU ICI, INCONDITIONNELLEMENT, AVANT TOUT BRANCHEMENT.
   *
   * Le répéter dans chaque branche donnerait le même résultat aujourd'hui et
   * serait faux demain : la branche qu'on ajoute est celle qu'on oublie. La
   * sonde structurelle exige donc cet ordre — appel, plancher, branchement — et
   * c'est elle qui a rattrapé la première version de cette action.
   */
  await attendrePlancher(debut);

  if (error !== null) {
    return {
      statut: "erreur",
      // On distingue la limite de débit du reste, et seulement elle : dire
      // « réessayez » à quelqu'un que le serveur d'auth vient de limiter le
      // ferait réessayer aussitôt, échouer à nouveau, et conclure que le
      // produit est cassé. Cette distinction ne dépend pas de l'existence d'un
      // compte, elle ne divulgue donc rien.
      motif: error.status === 429 ? "trop_de_tentatives" : "identifiants",
    };
  }

  const suite = await suivreApresSession(locale, supabase);

  /*
   * ⚠️ `redirect()` LÈVE — c'est ainsi qu'il fonctionne en Next 15. Il est donc
   * hors de tout `try` : un `catch` qui l'entourerait avalerait la redirection
   * et laisserait l'utilisateur sur le formulaire, connecté sans le savoir.
   */
  redirect(suite.ok ? suite.chemin : cheminDeRefus(locale, suite.motif));
}

/**
 * CRÉER UN COMPTE.
 *
 * ⚠️ LE COMPTE NAÎT AVEC SA BOUTIQUE, PAR UN DÉCLENCHEUR EN BASE
 * (`creer_profil_et_shop` sur `auth.users`). Rien n'est à créer ici, et surtout
 * rien ne doit l'être : un second chemin de création ferait naître, le jour où
 * il divergerait, un compte sans boutique — et tout l'espace vendeur suppose
 * qu'il en a une.
 */
export async function sInscrire(
  _precedent: ResultatInscription,
  donnees: unknown,
): Promise<ResultatInscription> {
  const debut = Date.now();

  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "indisponible" };

  const brutEmail = donnees.get("email");
  const brutMotDePasse = donnees.get("motDePasse");

  const analyse = Inscription.safeParse({
    email: brutEmail,
    motDePasse: brutMotDePasse,
    locale: donnees.get("locale"),
  });

  if (!analyse.success) {
    /*
     * LE REFUS EST NOMMÉ, PAS GÉNÉRIQUE. Un mot de passe refusé sans qu'on dise
     * lequel des trois motifs a mordu se corrige au hasard — et le troisième
     * (« contient votre adresse ») ne se devine pas du tout.
     *
     * Aucun de ces motifs ne dit quoi que ce soit sur l'existence d'un compte :
     * ils portent tous sur ce que la personne vient de taper.
     */
    if (typeof brutEmail !== "string" || !Adresse.shape.email.safeParse(brutEmail).success) {
      return { statut: "erreur", motif: "email_invalide" };
    }
    if (typeof brutMotDePasse !== "string") {
      return { statut: "erreur", motif: "mdp_trop_court" };
    }
    const refus = refusDuMotDePasse(brutMotDePasse, brutEmail.trim());
    if (refus.includes("trop_long")) return { statut: "erreur", motif: "mdp_trop_long" };
    return { statut: "erreur", motif: "mdp_trop_court" };
  }

  const { email, motDePasse, locale } = analyse.data;

  // LE CONTRÔLE QUI A BESOIN DES DEUX CHAMPS, donc qui ne peut pas vivre dans le
  // schéma : un mot de passe qui contient l'identité qu'il protège.
  const refus = refusDuMotDePasse(motDePasse, email);
  if (refus.includes("contient_email")) {
    return { statut: "erreur", motif: "mdp_contient_email" };
  }

  /*
   * LE COMPTEUR D'ENVOI D'EMAIL, PAS CELUI DU MOT DE PASSE.
   *
   * Deux raisons, et la seconde est la vraie. La première : selon le réglage du
   * projet, `signUp` envoie un email de confirmation — c'est donc bien la
   * surface « envoi ». La seconde : ce compteur est ce qui BORNE l'oracle
   * d'existence de compte décrit en tête de fichier. 6 essais par heure et par
   * adresse, 30 par heure et par adresse IP : de quoi créer son compte, pas de
   * quoi balayer une liste.
   */
  const quota = await verifierQuotaAuth(email);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "trop_de_tentatives" };
  }

  const origine = await origineDuSite();
  if (origine === null) {
    // Sans origine fiable on ne construit pas d'URL de retour : deviner
    // produirait un lien qui mène ailleurs que là où la personne se trouve.
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "indisponible" };
  }

  const supabase = await creerClientServeur();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    options: {
      // Sert UNIQUEMENT si la confirmation d'email est réactivée un jour. La
      // poser maintenant coûte une ligne ; l'oublier ce jour-là enverrait les
      // gens sur la racine du site avec un code qu'aucune route ne consomme.
      emailRedirectTo: `${origine}/${locale}/auth/retour`,
    },
  });

  // Même règle que la connexion : plancher inconditionnel, puis branchement.
  await attendrePlancher(debut);

  if (error !== null) {
    /*
     * ⚠️ LE 429 DU SERVEUR D'AUTHENTIFICATION EST UN ORACLE ICI AUSSI, EN SENS
     * INVERSE — et je l'avais laissé passer en « trop de tentatives ».
     *
     * MESURÉ LE 02/09/2026, budget d'emails épuisé :
     *
     *     adresse AVEC compte → obfusquée, aucun envoi → 303 vers `confirmez`
     *     adresse SANS compte → un envoi est TENTÉ    → 429 → « trop de tentatives »
     *
     * Discrimination binaire parfaite, et elle ne se referme PAS en rejouant sur
     * la confirmation d'email : elle est structurelle au fait qu'un envoi n'est
     * tenté que pour les adresses NEUVES. Le seul moyen de la fermer est de ne
     * pas laisser la classe d'erreur d'envoi transparaître dans la forme de la
     * réponse — donc d'emprunter la MÊME sortie que l'adresse déjà inscrite.
     *
     * Le compte a bel et bien été créé dans ce cas : seul l'email de
     * confirmation manque. Le libellé de `confirmez` couvre les trois cas sans
     * dire lequel s'applique, et le journal, lui, porte la vraie cause.
     */
    if (error.status === 429) {
      console.error("[auth] confirmation d'inscription non envoyée — " + error.message);
      redirect(`/${locale}/connexion?erreur=confirmez`);
    }
    /*
     * ⚠️ ICI VIT L'ORACLE, ET IL EST NOMMÉ PLUTÔT QUE MAQUILLÉ.
     *
     * Le message est reconnu sur le CODE quand il existe, et sur le texte
     * sinon — le serveur d'authentification n'a pas toujours porté de code
     * pour ce cas. Se contenter du texte serait fragile ; l'ignorer
     * renverrait « une erreur est survenue » à quelqu'un dont le seul tort est
     * d'avoir déjà un compte, et qui ne saurait pas qu'il lui suffit de se
     * connecter.
     */
    const dejaInscrit =
      error.code === "user_already_exists" || /already\s+(registered|exists)/i.test(error.message);
    return { statut: "erreur", motif: dejaInscrit ? "deja_inscrit" : "indisponible" };
  }

  if (data.session === null) {
    /*
     * PAS DE SESSION : LA CONFIRMATION D'EMAIL EST ACTIVE SUR LE PROJET.
     *
     * C'est la façon documentée de le savoir depuis le client, sans clé de
     * service. Wassim a tranché « pas de confirmation », donc ce cas ne devrait
     * pas se produire — mais le réglage vit dans le tableau de bord, hors du
     * dépôt, et personne ici ne peut le garantir.
     *
     * ⚠️ CETTE BRANCHE COUVRE DEUX CAS QU'ON NE DOIT PAS DISTINGUER, et c'est
     * un défaut trouvé en pilotant le produit au navigateur :
     *
     *   1. l'adresse était libre : le compte est créé, un email est parti ;
     *   2. l'adresse avait DÉJÀ un compte : le serveur d'authentification rend
     *      un utilisateur OBFUSQUÉ, sans session, et n'envoie RIEN.
     *
     * Les deux sont indiscernables ici, exprès — c'est la protection contre
     * l'énumération que la confirmation d'email apporte. Le message affichait
     * pourtant « votre compte est créé, ouvrez l'email que nous venons de vous
     * envoyer » : faux dans le second cas, où rien n'a été créé ni envoyé.
     * L'interface n'affirme jamais ce que la base n'a pas enregistré.
     *
     * Le libellé couvre donc les deux sans dire lequel s'applique.
     */
    redirect(`/${locale}/connexion?erreur=confirmez`);
  }

  const suite = await suivreApresSession(locale, supabase);

  redirect(suite.ok ? suite.chemin : cheminDeRefus(locale, suite.motif));
}

/**
 * DEMANDER UNE RÉINITIALISATION.
 *
 * ⚠️ LA RÉPONSE EST LA MÊME QUE L'ADRESSE EXISTE OU NON. C'est ici que le lien
 * par email revient dans le produit, et c'est le nouveau vecteur de prise de
 * compte : il devient le seul recours en cas d'oubli, donc la seule chose qui
 * sépare un compte de quelqu'un qui saurait lire sa boîte.
 *
 * Le serveur d'authentification rend d'ailleurs déjà « succès » pour une adresse
 * inconnue. On ne s'en remet pas à lui : le plancher couvre le délai, et le
 * message est écrit une seule fois, pour les deux cas.
 */
export async function demanderReinitialisation(
  _precedent: ResultatReinitialisation,
  donnees: unknown,
): Promise<ResultatReinitialisation> {
  const debut = Date.now();

  if (!(donnees instanceof FormData)) return { statut: "erreur", motif: "email_invalide" };

  const analyse = Adresse.safeParse({
    email: donnees.get("email"),
    locale: donnees.get("locale"),
  });
  if (!analyse.success) return { statut: "erreur", motif: "email_invalide" };

  const { email, locale } = analyse.data;

  const quota = await verifierQuotaAuth(email);
  if (!quota.autorise) {
    await attendrePlancher(debut);
    return { statut: "erreur", motif: "trop_de_tentatives" };
  }

  const origine = await origineDuSite();
  if (origine === null) {
    await attendrePlancher(debut);
    // MÊME RÉPONSE QUE LE SUCCÈS, et c'est délibéré : dire « indisponible »
    // ici distinguerait une panne de notre côté d'une adresse inconnue pour
    // quelqu'un qui teste les deux. Le journal, lui, portera la vraie cause.
    console.error("[auth] réinitialisation impossible : aucune origine fiable");
    return { statut: "envoye" };
  }

  const supabase = await creerClientServeur();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // La route de retour échange le code contre une session de récupération,
    // puis renvoie vers l'écran de saisie. La MÊME route que Google : dupliquer
    // l'échange aurait fait diverger les deux, et c'est le second qu'on oublie
    // de corriger.
    redirectTo: `${origine}/${locale}/auth/retour?suite=mot-de-passe`,
  });

  await attendrePlancher(debut);

  if (error !== null) {
    /*
     * ⚠️ AUCUNE ERREUR D'ENVOI NE REMONTE À L'ÉCRAN, PAS MÊME LA LIMITE DE DÉBIT.
     *
     * DÉFAUT RÉEL, MESURÉ LE 02/09/2026, ET IL M'A ÉCHAPPÉ À L'ÉCRITURE. Je
     * laissais passer `429` en « trop de tentatives », en me disant que ce motif
     * « ne dépend pas de l'existence d'un compte ». C'EST FAUX ICI, et pour une
     * raison qui ne se voit qu'en observant le serveur d'authentification :
     *
     *     adresse AVEC compte  → un envoi est TENTÉ → 429 (budget épuisé)
     *     adresse SANS compte  → aucun envoi tenté  → 200 muet
     *
     * L'envoi n'est tenté que pour une CLASSE d'adresses. Son refus est donc un
     * oracle parfait dès que le budget d'emails du projet est plein — état
     * courant, puisqu'il vaut quelques messages par heure sans SMTP dédié, et
     * qu'un attaquant le force en deux requêtes. Relevé : 10 adresses mêlées,
     * 10/10 correctement classées à la longueur du corps.
     *
     * UNE SEULE ISSUE, DONC, quoi qu'il arrive après le plancher. La limite de
     * débit qui PEUT être dite est celle de NOS compteurs, plus haut : elle est
     * consommée avant l'appel, donc avant que l'existence du compte ait pu jouer
     * le moindre rôle.
     */
    console.error("[auth] envoi de réinitialisation en échec — " + error.message);
  }

  return { statut: "envoye" };
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
 * LE QUOTA EST CELUI DES ENVOIS, pas un troisième. Deux compteurs distincts
 * offriraient un budget doublé à qui alterne les chemins.
 */
const DepartExterne = z.object({ locale: Langue });

export async function partirVersGoogle(donnees: unknown): Promise<void> {
  const analyse = DepartExterne.safeParse({
    locale: donnees instanceof FormData ? donnees.get("locale") : null,
  });
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
      // LA MÊME ROUTE DE RETOUR QUE LA RÉINITIALISATION. Elle échange déjà le
      // code contre une session, vérifie le profil, refuse un compte suspendu
      // et compte l'inscription au premier passage.
      redirectTo: `${origine}/${langue}/auth/retour`,
      skipBrowserRedirect: true,
    },
  });

  if (error !== null || data.url === null) {
    redirect(`/${langue}/connexion?erreur=indisponible`);
  }

  redirect(data.url);
}
