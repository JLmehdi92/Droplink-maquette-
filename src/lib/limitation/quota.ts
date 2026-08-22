import "server-only";
import { creerClientSysteme } from "@/lib/supabase/system";
import { adresseAppelant, empreinte } from "./empreinte";

/**
 * Limitation de débit — côté application.
 *
 * Le compteur vit EN BASE (migration 005). Ce module ne fait que composer les
 * clés et décider quoi faire d'un refus. Il appelle la fonction par le client
 * SYSTÈME, seul rôle à qui l'exécution est accordée : ni `anon` ni
 * `authenticated` ne peuvent l'appeler, sans quoi n'importe qui pourrait épuiser
 * le quota d'un tiers dont il connaît la clé.
 *
 * C'est aussi le bon client au sens du brief : `system.ts` sert les chemins sans
 * humain. Compter une requête n'est pas lire les données de quelqu'un, ça n'a
 * donc rien à faire dans un audit — l'y mettre noierait les vraies consultations
 * humaines.
 */

/** Ce que le compteur protège. Les surfaces ne partagent JAMAIS leurs compteurs. */
export type Surface =
  | "auth-ip"
  | "auth-email"
  /** Toutes les requêtes de la page publique, par adresse. */
  | "publique-requetes"
  /** Les seules requêtes portant un jeton INCONNU, par adresse. */
  | "publique-inconnu"
  /** La seule ÉCRITURE publique du produit : l'arbitrage QC. */
  | "publique-ecriture"
  /** Les notifications de suivi poussées par le fournisseur. */
  | "suivi-notification";

export type Verdict = { autorise: true } | { autorise: false; motif: "quota" | "indisponible" };

function entierEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || !/^\d+$/.test(brut.trim())) return defaut;
  const v = Number.parseInt(brut.trim(), 10);
  return v > 0 ? v : defaut;
}

/**
 * Seuils, par surface.
 *
 * DEUX DIMENSIONS PLUTÔT QU'UNE, et leurs valeurs ne se ressemblent pas parce
 * qu'elles ne défendent pas contre la même chose :
 *
 *   - `auth-ip` borne le BALAYAGE d'adresses. Le seuil est volontairement
 *     généreux : le fournisseur en Chine passe souvent par un réseau partagé,
 *     et un seuil serré bloquerait plusieurs personnes légitimes derrière une
 *     seule adresse IP — c'est-à-dire exactement le persona qui n'a aucune
 *     autre porte d'entrée que l'email.
 *   - `auth-email` borne le HARCÈLEMENT d'une boîte précise, et peut donc être
 *     strict sans gêner personne : nul n'a besoin de six liens par heure.
 *
 * Un seuil unique obligerait à choisir entre les deux, et le compromis serait
 * mauvais des deux côtés.
 */
function seuil(surface: Surface): { plafond: number; fenetreSecondes: number } {
  switch (surface) {
    case "auth-ip":
      return {
        plafond: entierEnv("QUOTA_AUTH_IP_PAR_HEURE", 30),
        fenetreSecondes: 3600,
      };
    case "auth-email":
      return {
        plafond: entierEnv("QUOTA_AUTH_EMAIL_PAR_HEURE", 6),
        fenetreSecondes: 3600,
      };
    case "publique-requetes":
      return {
        plafond: entierEnv("QUOTA_PUBLIQUE_PAR_MINUTE", 120),
        fenetreSecondes: 60,
      };
    case "publique-inconnu":
      return {
        plafond: entierEnv("QUOTA_PUBLIQUE_INCONNU_PAR_MINUTE", 20),
        fenetreSecondes: 60,
      };
    case "publique-ecriture":
      // Dix par minute : un client approuve ou refuse une fois, éventuellement
      // se ravise. Personne n'a besoin de dix arbitrages par minute, et le
      // seuil reste largement au-dessus de tout usage réel.
      return {
        plafond: entierEnv("QUOTA_PUBLIQUE_ECRITURE_PAR_MINUTE", 10),
        fenetreSecondes: 60,
      };
    case "suivi-notification":
      /*
       * VOLONTAIREMENT GÉNÉREUX, et il faut dire pourquoi.
       *
       * Cette surface n'a qu'un appelant légitime, le fournisseur de suivi, et
       * toutes ses notifications arrivent de la même poignée d'adresses. Un
       * seuil serré ne bornerait donc pas un abus, il couperait une rafale
       * normale — le fournisseur pousse par paquets quand un vol atterrit et
       * que trois cents colis sont scannés dans la même minute.
       *
       * Le rejeu, lui, n'est PAS arrêté ici : il l'est par l'empreinte de la
       * notification, qui le reconnaît quel que soit son débit. Ce seuil-ci ne
       * couvre qu'une chose : empêcher qu'on nous fasse calculer des signatures
       * à l'infini. Six cents par minute est très au-dessus de tout trafic réel
       * et très en dessous de ce qu'il faudrait pour saturer.
       */
      return {
        plafond: entierEnv("QUOTA_SUIVI_NOTIFICATION_PAR_MINUTE", 600),
        fenetreSecondes: 60,
      };
  }
}

async function consommer(cle: string, surface: Surface): Promise<Verdict> {
  const { plafond, fenetreSecondes } = seuil(surface);
  const systeme = creerClientSysteme();

  const { data, error } = await systeme.rpc("consommer_quota", {
    p_cle: `${surface}:${cle}`,
    p_plafond: plafond,
    p_fenetre_secondes: fenetreSecondes,
  });

  if (error !== null) {
    // FERMÉ EN CAS DE PANNE DU COMPTEUR, sur cette surface précisément.
    //
    // Le brief tranche l'inverse pour la page publique — y refuser pénaliserait
    // les clients d'un vendeur pour un incident qui ne les concerne pas. Ici le
    // raisonnement s'inverse pour une raison concrète : le compteur vit dans le
    // MÊME Postgres que `profiles` et `shops`, dont la création du compte
    // dépend. S'il est indisponible, l'inscription échouerait de toute façon.
    // Refuser ne coûte donc aucune inscription qui aurait réussi, et borne
    // l'abus pendant l'incident.
    return { autorise: false, motif: "indisponible" };
  }

  return data === true ? { autorise: true } : { autorise: false, motif: "quota" };
}

/**
 * Vérifie les deux seuils d'une demande de lien de connexion.
 *
 * Les compteurs sont consommés dans l'ordre IP puis email, et l'on s'arrête au
 * premier refus : consommer le second après avoir déjà refusé ferait payer à une
 * adresse email le quota d'une IP qui n'est pas la sienne.
 */
/**
 * Le quota d'authentification quand aucune adresse n'est en jeu.
 *
 * Le départ vers un fournisseur externe ne connaît pas d'email : c'est le
 * fournisseur qui le révélera au retour. Seule la dimension ADRESSE IP
 * s'applique donc — et elle emploie EXACTEMENT le même compteur que le lien
 * magique. Un compteur distinct offrirait un second budget à qui balaie : il
 * suffirait d'alterner les deux chemins pour doubler sa cadence.
 */
export async function verifierQuotaAuthAdresse(): Promise<Verdict> {
  const ip = await adresseAppelant();
  // AUCUNE ADRESSE LISIBLE : on laisse passer. C'est la règle de la surface
  // publique — refuser ici pénaliserait des utilisateurs légitimes derrière un
  // intermédiaire mal configuré, pour un incident qui ne les concerne pas. La
  // barrière qui fait autorité reste la liste d'autorisation de Supabase.
  if (ip === null) return { autorise: true };
  return consommer(empreinte(ip), "auth-ip");
}

export async function verifierQuotaAuth(email: string): Promise<Verdict> {
  const ip = await adresseAppelant();
  if (ip !== null) {
    const parIp = await consommer(empreinte(ip), "auth-ip");
    if (!parIp.autorise) return parIp;
  }

  // L'adresse est normalisée avant empreinte, sinon « A@B.com » et « a@b.com »
  // recevraient deux quotas distincts pour une seule boîte.
  return consommer(empreinte(email.trim().toLowerCase()), "auth-email");
}

/**
 * L'entrée de la page publique.
 *
 * TROIS TEMPS, parce que la validité du jeton n'est connue qu'APRÈS la lecture
 * qu'on cherche justement à éviter :
 *
 *   1. consulter le compteur des jetons inconnus SANS le consommer — celui qui
 *      a déjà brûlé ses vingt essais est refusé avant toute lecture ;
 *   2. consommer le compteur des requêtes (120/min) ;
 *   3. une fois le jeton révélé inconnu, appeler `signalerJetonInconnu()`.
 *
 * EN CAS DE PANNE DU COMPTEUR, ON AUTORISE. C'est l'inverse de la surface
 * d'authentification, et c'est délibéré : refuser ici pénaliserait les clients
 * d'un vendeur pour un incident qui ne les concerne pas. Le seul dommage d'un
 * refus injustifié est porté par quelqu'un qui n'a rien à voir avec l'incident.
 */
export async function verifierQuotaPublique(): Promise<Verdict> {
  const ip = await adresseAppelant();
  // Sans adresse exploitable, il n'y a rien à compter — et compter tout le monde
  // sous une clé commune reviendrait à laisser un seul balayeur couper la page
  // de tous les vendeurs.
  if (ip === null) return { autorise: true };

  const cle = empreinte(ip);
  const systeme = creerClientSysteme();
  const seuilInconnu = seuil("publique-inconnu");

  const { data: deja, error: erreurPeek } = await systeme.rpc("quota_depasse", {
    p_cle: `publique-inconnu:${cle}`,
    p_plafond: seuilInconnu.plafond,
    p_fenetre_secondes: seuilInconnu.fenetreSecondes,
  });

  // Panne : on autorise, et on ne consomme rien non plus — un compteur dont on
  // ignore l'état ne doit pas être avancé à l'aveugle.
  if (erreurPeek !== null) return { autorise: true };
  if (deja === true) return { autorise: false, motif: "quota" };

  const verdict = await consommer(cle, "publique-requetes");
  if (!verdict.autorise && verdict.motif === "indisponible") return { autorise: true };
  return verdict;
}

/**
 * Comptabilise un jeton inconnu. Appelée APRÈS la lecture, jamais avant.
 *
 * Elle ne rend rien : le refus qu'elle prépare est celui de la requête
 * SUIVANTE. Refuser celle-ci n'aurait aucun sens — la lecture est déjà payée, et
 * le visiteur qui se trompe une fois de lien mérite sa page « introuvable »
 * comme les autres.
 */
export async function signalerJetonInconnu(): Promise<void> {
  const ip = await adresseAppelant();
  if (ip === null) return;
  await consommer(empreinte(ip), "publique-inconnu");
}

/**
 * L'unique ÉCRITURE publique : l'arbitrage QC.
 *
 * ELLE REFUSE EN CAS DE PANNE DU COMPTEUR, et c'est l'inverse de la lecture de
 * la même page. La règle « la page publique autorise » protège la CONSULTATION :
 * refuser d'afficher ses photos à quelqu'un le prive de ce qu'il est venu
 * chercher, pour un incident qui ne le concerne pas.
 *
 * Ici l'arbitrage est REJOUABLE — le visiteur reclique et rien n'est perdu — et
 * ce qui serait perdu dans l'autre sens ne l'est pas : un chemin d'écriture sans
 * plafond laisse une seule adresse remplir le journal de n'importe quelle
 * commande dont elle détient le lien. Le coût d'un refus injustifié est de
 * quelques secondes ; celui d'une écriture sans borne est permanent.
 */
export async function verifierQuotaEcriturePublique(): Promise<Verdict> {
  const ip = await adresseAppelant();
  // Sans adresse exploitable il n'y a rien à compter — et regrouper tout le
  // monde sous une clé commune laisserait un seul abuseur bloquer l'arbitrage de
  // tous les clients de tous les vendeurs.
  if (ip === null) return { autorise: true };

  return consommer(empreinte(ip), "publique-ecriture");
}

/**
 * Le point de réception des notifications de suivi.
 *
 * IL REFUSE EN CAS DE PANNE DU COMPTEUR. Le brief tranche l'inverse pour la page
 * publique, et le raisonnement ne s'applique pas ici : personne n'attend devant
 * son écran. Un fournisseur qui n'obtient pas de réponse RÉÉMET — c'est même le
 * comportement qui a rendu le rejeu atteignable — donc un refus temporaire ne
 * perd aucune information, il la retarde. Accepter à l'aveugle, à l'inverse,
 * ouvrirait une écriture non bornée sur les colis de tous les vendeurs pendant
 * exactement la période où l'on ne voit plus rien.
 */
export async function verifierQuotaNotificationSuivi(): Promise<Verdict> {
  const ip = await adresseAppelant();
  // Sans adresse exploitable, on compte quand même — sous une clé commune. Cette
  // surface n'a qu'un appelant légitime : regrouper les anonymes ne prive donc
  // personne de service, alors que les laisser passer offrirait un contournement
  // à qui sait masquer son adresse.
  return consommer(ip === null ? "sans-adresse" : empreinte(ip), "suivi-notification");
}
