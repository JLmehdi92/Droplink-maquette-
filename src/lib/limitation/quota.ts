import "server-only";
import { cache } from "react";
import { creerClientSysteme } from "@/lib/supabase/system";
import { adresseAppelant, bordDeConfiance, empreinte } from "./empreinte";

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
  /**
   * LA VÉRIFICATION D'UN MOT DE PASSE, par adresse IP. Distincte de `auth-ip`,
   * qui borne l'ENVOI D'UN EMAIL.
   *
   * ⚠️ RÉUTILISER `auth-ip` AURAIT ENFERMÉ DEHORS EXACTEMENT QUI IL PROTÉGEAIT.
   * Son plafond de 30 par heure a été choisi pour des envois d'emails, avec sa
   * raison écrite plus bas : « nul n'a besoin de six liens par heure ». Une
   * tentative de connexion n'est pas un envoi — on se trompe de mot de passe,
   * on recommence, et le fournisseur de Guangzhou passe par un réseau partagé
   * où plusieurs personnes se connectent derrière une seule adresse.
   */
  | "auth-mdp-ip"
  /**
   * La vérification d'un mot de passe, par COUPLE (adresse IP, adresse email).
   *
   * ⚠️ C'EST LE COMPTEUR QUI MORD LE PLUS TÔT, ET C'EST VOULU. Il borne le seul
   * bourrage qui vaille quelque chose — s'acharner sur UN compte depuis UNE
   * source — sans donner à un tiers le moyen d'enfermer quelqu'un dehors :
   * épuiser le couple d'un attaquant ne consomme rien du budget de la victime,
   * qui n'a pas la même adresse IP.
   */
  | "auth-mdp-couple"
  /** La vérification d'un mot de passe, par adresse email : l'acharnement DISTRIBUÉ sur UN compte. */
  | "auth-mdp-email"
  /** Toutes les requêtes de la page publique, par adresse. */
  | "publique-requetes"
  /** Les seules requêtes portant un jeton INCONNU, par adresse. */
  | "publique-inconnu"
  /** La seule ÉCRITURE publique du produit : l'arbitrage QC. */
  | "publique-ecriture"
  /** Les notifications de suivi poussées par le fournisseur. */
  | "suivi-notification"
  /** La demande d'une URL de dépôt de média, par VENDEUR. */
  | "depot"
  /** Toute requête visant la surface d'administration, par adresse. */
  | "admin";

export type Verdict = { autorise: true } | { autorise: false; motif: "quota" | "indisponible" };

/**
 * CE QUE CHAQUE SURFACE FAIT QUAND LE COMPTEUR EST EN PANNE.
 *
 * ⚠️ UNE TABLE, ET NON DES `if` DISPERSÉS. C'est la décision la plus délicate
 * du module — le brief la tranche explicitement — et elle vivait éparpillée
 * dans six fonctions, sous six formulations différentes. Une règle écrite six
 * fois est une règle qu'on applique cinq fois : c'est ainsi que la surface
 * d'administration s'est retrouvée sans compteur du tout, sans que rien ne le
 * signale.
 *
 * Exhaustive PAR LE TYPE : ajouter une valeur à `Surface` sans l'inscrire ici
 * ne compile pas. On ne peut donc pas créer une surface dont personne n'a
 * décidé du comportement en panne.
 *
 * LA RÈGLE, ET SA RAISON :
 *
 *   - `autorise` pour ce que CONSULTE le client d'un vendeur. Refuser
 *     l'affichage de ses photos le prive de ce qu'il vient chercher, pour un
 *     incident qui ne le concerne en rien. Le dommage est porté par quelqu'un
 *     d'étranger à la panne.
 *   - `refuse` partout ailleurs. Pour l'authentification, l'écriture publique
 *     et l'administration, un refus injustifié coûte une nouvelle tentative —
 *     à nous, ou à quelqu'un qui peut réessayer. L'autorisation par défaut,
 *     elle, ouvre une surface sans plafond le jour précis où la base va mal,
 *     c'est-à-dire le jour où le plafond sert le plus.
 */
export const DEGRADATION: Readonly<Record<Surface, "autorise" | "refuse">> = {
  "auth-ip": "refuse",
  "auth-email": "refuse",
  "auth-mdp-ip": "refuse",
  "auth-mdp-couple": "refuse",
  "auth-mdp-email": "refuse",
  "publique-requetes": "autorise",
  "publique-inconnu": "autorise",
  "publique-ecriture": "refuse",
  "suivi-notification": "refuse",
  depot: "refuse",
  admin: "refuse",
};

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
/** Le verdict d'une surface dont le compteur est injoignable. */
export function surPanne(surface: Surface): Verdict {
  return DEGRADATION[surface] === "autorise"
    ? { autorise: true }
    : { autorise: false, motif: "indisponible" };
}

/**
 * Le plafond et la fenêtre d'une surface.
 *
 * EXPORTÉE POUR L'ÉCRAN DE SURVEILLANCE, qui affiche « pic sur plafond ».
 * Recopier ces valeurs côté page les ferait diverger de celles que le compteur
 * applique réellement — et une barre remplie contre un plafond faux est pire
 * qu'une barre absente : elle rassure.
 */
export function seuil(surface: Surface): { plafond: number; fenetreSecondes: number } {
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
    /*
     * ═══════════════════════════════════════════════════════════════════════
     * LES TROIS PLAFONDS DU MOT DE PASSE — ET POURQUOI IL EN FAUT TROIS
     * ═══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ IL N'Y EN AVAIT QUE DEUX, ET J'AVAIS ÉCRIT ICI « aucun verrouillage de
     * compte : bloquer après N échecs transformerait ces compteurs en arme ».
     * LE PLAFOND PAR ADRESSE ÉTAIT DÉJÀ CETTE ARME, simplement horaire au lieu
     * de permanent. Mesuré le 02/09/2026, avec contre-test :
     *
     *     attaquant  198.51.100.1  24 mauvais mots de passe → bascule au 21ᵉ
     *     victime    203.0.113.77  LE BON mot de passe      → REFUS-QUOTA
     *     témoin     203.0.113.77  autre adresse, bon mdp   → passe
     *
     * Vingt requêtes, onze secondes, depuis n'importe où, pour tenir un vendeur
     * hors de son tableau de bord — et réitérable à chaque fenêtre. Sur le
     * persona de Guangzhou, dont l'adresse circule dans le vertical, pendant
     * qu'il traite ses deux cents commandes de la semaine.
     *
     * LA SORTIE N'EST PAS DE CHOISIR ENTRE BOURRAGE ET VERROUILLAGE, c'est de
     * séparer les deux menaces, qui n'ont pas la même signature :
     *
     *   - `auth-mdp-couple` 10/h — s'acharner sur UN compte depuis UNE source.
     *     C'est la forme la plus rentable du bourrage, et c'est la seule que
     *     l'on peut brider serré SANS armer personne : épuiser le couple d'un
     *     attaquant ne touche pas le budget de la victime, qui a une autre IP.
     *   - `auth-mdp-ip` 100/h — balayer PLUSIEURS comptes depuis une source.
     *     Généreux, parce qu'un réseau partagé légitime existe.
     *   - `auth-mdp-email` 60/h — s'acharner sur un compte depuis PLUSIEURS
     *     sources. Il reste nécessaire (sinon mille IP donnent mille × 10), mais
     *     il est relevé de 20 à 60 : enfermer quelqu'un dehors coûte désormais
     *     60 requêtes venues d'au moins SIX adresses IP, au lieu de 20 depuis
     *     une seule. Et personne de légitime ne se trompe soixante fois en une
     *     heure.
     *
     * Le compromis est meilleur des deux côtés : le bourrage ciblé passe de 20
     * à 10 essais par heure, et le déni de service ciblé devient six fois plus
     * cher. Ce qui empire — 60 essais/h au lieu de 20 pour un attaquant
     * DISTRIBUÉ — ne mord pas sur un mot de passe de douze caractères.
     *
     * ⚠️ ET TOUJOURS AUCUN VERROUILLAGE APRÈS N ÉCHECS : la fenêtre glisse
     * toute seule, aucun compte n'est jamais condamné.
     */
    case "auth-mdp-ip":
      return {
        plafond: entierEnv("QUOTA_AUTH_MDP_IP_PAR_HEURE", 100),
        fenetreSecondes: 3600,
      };
    case "auth-mdp-couple":
      return {
        plafond: entierEnv("QUOTA_AUTH_MDP_COUPLE_PAR_HEURE", 10),
        fenetreSecondes: 3600,
      };
    case "auth-mdp-email":
      return {
        plafond: entierEnv("QUOTA_AUTH_MDP_EMAIL_PAR_HEURE", 60),
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
    case "admin":
      /*
       * LA SURFACE D'ADMINISTRATION — compteur DISTINCT de la page publique.
       *
       * DÉFAUT TROUVÉ À L'AUDIT DU 26/08/2026 : cette branche n'existait pas.
       * Le brief exige « deux seuils distincts, EN BASE, compteurs distincts
       * entre page publique et admin », et le module ne contenait pas une seule
       * occurrence du mot « admin ». La moitié de la règle n'avait jamais été
       * écrite.
       *
       * LE SEUIL EST BAS, ET IL PEUT L'ÊTRE. Un administrateur consulte, lit un
       * journal, suspend un compte : trente requêtes par minute couvrent très
       * largement une navigation soutenue, et un humain n'en fait jamais
       * davantage. Ce n'est pas la page publique, où le seuil doit absorber
       * vingt médias chargés d'un coup par un client pressé.
       *
       * CE QU'IL BORNE VRAIMENT : le martèlement ANONYME de `/admin`. Chaque
       * requête y coûte deux allers-retours en base — le profil, puis le rôle —
       * avant même de rendre le 404. Sans plafond, cette surface est le moyen
       * le moins cher de nous faire travailler.
       */
      return {
        plafond: entierEnv("QUOTA_ADMIN_PAR_MINUTE", 30),
        fenetreSecondes: 60,
      };
    case "depot":
      /*
       * LES DÉPÔTS DE MÉDIAS — le troisième seuil du brief, et il MANQUAIT.
       *
       * Le brief nomme trois plafonds par fenêtre d'une minute : 20 sur un
       * jeton inconnu, 120 sur un jeton valide, 60 dépôts. Les deux premiers
       * existaient depuis l'origine ; le troisième n'avait jamais été écrit, et
       * rien ne le signalait — les plafonds PAR COMMANDE (20 médias, 3 vidéos)
       * ressemblent assez à une limite de dépôt pour qu'on croie l'avoir posée.
       * Ils bornent le RÉSULTAT, pas le DÉBIT : un compte pouvait demander des
       * signatures aussi vite qu'il le voulait, chacune coûtant une lecture de
       * `order_media` avant d'être refusée.
       *
       * 60 EST AU-DESSUS DE TOUT USAGE RÉEL : le plafond d'une commande étant
       * de 20 médias, une minute couvre trois commandes remplies d'un coup.
       *
       * ⚠️ LA CLÉ EST LE VENDEUR, PAS L'ADRESSE — à l'inverse des trois
       * surfaces publiques. Le fournisseur en Chine passe par un réseau
       * partagé : compter par adresse ferait partager 60 dépôts par minute à
       * plusieurs comptes légitimes, c'est-à-dire couper précisément le persona
       * qui dépose le plus. Le vendeur, lui, est authentifié : son identité est
       * connue, exacte, et ne se maquille pas.
       */
      return {
        plafond: entierEnv("QUOTA_DEPOT_PAR_MINUTE", 60),
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
 * Les deux seuils d'une VÉRIFICATION DE MOT DE PASSE.
 *
 * Même forme que `verifierQuotaAuth`, compteurs différents — voir le type
 * `Surface` pour la raison. L'ordre est le même, et pour la même raison :
 * consommer le compteur de l'adresse email après avoir déjà refusé sur l'IP
 * ferait payer à une boîte le quota d'une adresse qui n'est pas la sienne, et
 * c'est précisément ce qui permettrait d'enfermer quelqu'un dehors.
 *
 * ⚠️ CONSOMMÉ AVANT L'APPEL, comme partout ailleurs sur cette surface. Après,
 * on saurait qu'on a été balayé sans l'avoir empêché.
 */
export async function verifierQuotaMotDePasse(email: string): Promise<Verdict> {
  // L'adresse est normalisée avant empreinte, sinon « A@B.com » et « a@b.com »
  // recevraient deux budgets distincts pour un seul compte.
  const adresse = email.trim().toLowerCase();
  const ip = await adresseAppelant();

  if (ip !== null) {
    const parIp = await consommer(empreinte(ip), "auth-mdp-ip");
    if (!parIp.autorise) return parIp;

    /*
     * LE COUPLE PASSE AVANT LE COMPTEUR PAR ADRESSE, et l'ordre compte.
     *
     * Le couple est celui qui mord le plus tôt (10/h) : le placer en second
     * ferait consommer le budget de la VICTIME avant de constater que
     * l'attaquant a déjà épuisé le sien. C'est la même règle que partout dans ce
     * module — on s'arrête au premier refus, sinon on fait payer à quelqu'un le
     * quota d'un autre.
     */
    const parCouple = await consommer(empreinte(ip + "|" + adresse), "auth-mdp-couple");
    if (!parCouple.autorise) return parCouple;
  }

  return consommer(empreinte(adresse), "auth-mdp-email");
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
async function verifierQuotaPubliqueSansMemo(): Promise<Verdict> {
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

  // Panne : la table tranche, et on ne consomme rien non plus — un compteur
  // dont on ignore l'état ne doit pas être avancé à l'aveugle.
  if (erreurPeek !== null) return surPanne("publique-inconnu");
  if (deja === true) return { autorise: false, motif: "quota" };

  const verdict = await consommer(cle, "publique-requetes");
  if (!verdict.autorise && verdict.motif === "indisponible") {
    return surPanne("publique-requetes");
  }
  return verdict;
}

/**
 * ⚠️ MÉMOÏSÉE POUR LE RENDU, ET C'EST UNE CORRECTION, PAS UNE OPTIMISATION.
 *
 * DÉFAUT MESURÉ LE 02/09/2026 : chaque chargement de `/p/[token]` consommait
 * **DEUX** unités du plafond au lieu d'une — 2,00 par appel, relevé sur huit
 * chargements avec une adresse neuve, page valide comme jeton inconnu. La
 * mise en page racine appelle cette fonction pour poser le plafond AVANT la
 * dépense qu'il prétend éviter, et la page l'appelle à son tour : deux appels
 * pour une seule requête HTTP.
 *
 * LE PLAFOND RÉEL ÉTAIT DONC DE 60 CHARGEMENTS PAR MINUTE, PAS 120. Et la
 * sanction est un 404 rigoureusement identique à un lien mort : le client
 * conclut que son vendeur lui a envoyé un lien cassé. La cible de cette page
 * est le téléphone en 4G, c'est-à-dire le CGNAT d'un opérateur où des dizaines
 * d'abonnés partagent une adresse — et le persona fournisseur est décrit dans
 * le brief comme partageant la sienne.
 *
 * `cache()` de React ne vit que le temps d'UN rendu : deux requêtes HTTP
 * restent deux comptages, et c'est bien ce qu'on veut compter. Les route
 * handlers (`/vue`, `/media/[id]`) ont chacun leur propre contexte, donc leur
 * propre unité — ils comptent une fois, comme avant.
 *
 * ⚠️ ET L'ÉCRAN DE SURVEILLANCE LISAIT CE CHIFFRE. Il compare le pic au plafond
 * annoncé : un pic doublé contre un plafond de 120 donnait une lecture fausse
 * de la moitié, dans le sens rassurant.
 */
export const verifierQuotaPublique = cache(verifierQuotaPubliqueSansMemo);

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

/**
 * Le quota des DEMANDES D'URL DE DÉPÔT, par vendeur.
 *
 * ELLE REFUSE EN CAS DE PANNE DU COMPTEUR. Le vendeur est devant son écran et
 * un refus lui coûte une nouvelle tentative sur un fichier qu'il a toujours ;
 * rien n'est perdu, seulement retardé. Laisser passer, à l'inverse, ouvrirait
 * pendant toute la panne le seul chemin du produit qui signe des URL d'écriture
 * vers le stockage.
 *
 * Elle NE CONSOMME RIEN quand l'identité manque : sans vendeur il n'y a pas de
 * dépôt à préparer, et l'appel est déjà refusé plus haut par la garde de
 * session.
 */
export async function verifierQuotaDepot(profilId: string): Promise<Verdict> {
  // L'identifiant n'est PAS empreinté, à la différence des adresses. L'empreinte
  // salée existe parce qu'une IPv4 se retrouve par force brute en quelques
  // secondes ; un UUID, non. La garder en clair rend le compteur lisible le jour
  // où l'on cherche quel compte dépose sans arrêt — et c'est le seul moment où
  // cette table sert à quelque chose.
  return consommer(profilId, "depot");
}

/**
 * Le quota de la surface d'administration.
 *
 * ⚠️ ELLE REFUSE EN CAS DE PANNE DU COMPTEUR, et c'est l'inverse exact de la
 * page publique. Le brief tranche la question ainsi, et la raison tient en une
 * phrase : refuser côté public pénaliserait les CLIENTS D'UN VENDEUR pour un
 * incident qui ne les concerne pas ; refuser côté admin ne pénalise QUE NOUS.
 *
 * Le coût d'un refus injustifié est ici qu'un administrateur recharge sa page.
 * Le coût de l'autorisation par défaut est une surface sans plafond le jour
 * précis où la base va mal — c'est-à-dire le jour où elle en a le plus besoin.
 *
 * LA CLÉ EST L'ADRESSE, PAS L'IDENTITÉ. Ce qu'on borne est le martèlement, et
 * il vient d'un visiteur qui n'a précisément aucune identité : la garde
 * `exigerAdmin()` s'exécute AVANT qu'on sache si l'appelant est administrateur.
 * Compter par identité ne bornerait que ceux qui en ont une.
 *
 * SANS ADRESSE EXPLOITABLE, ON REFUSE — encore l'inverse du public. Une clé
 * commune regrouperait tous les administrateurs sous un seul compteur, ce qui
 * serait pire ; et l'administration n'a aucune raison d'être atteinte depuis un
 * chemin qui ne porte pas d'adresse.
 */
/**
 * L'ABSENCE D'ADRESSE SUR LA SURFACE D'ADMINISTRATION SE DIT — UNE FOIS.
 *
 * ⚠️ PIÈGE DE DÉPLOIEMENT RENCONTRÉ LE 27/08/2026. Les six écrans admin
 * rendaient 404 à un compte QUI EST administrateur, en local. La chaîne :
 * `BORD_DE_CONFIANCE` absente → mode strict `cloudflare` → aucun
 * `cf-connecting-ip` → `adresseAppelant()` rend `null` → refus par sécurité →
 * `notFound()`.
 *
 * LE REFUS EST BON, ET IL NE CHANGE PAS. Ce qui était mauvais, c'est qu'il
 * était MUET : un 404 rigoureusement identique à « tu n'es pas administrateur »
 * et à « il n'y a rien ici », sans une ligne nulle part. En production, le jour
 * où le bord cesse de poser son en-tête, l'administration devient injoignable et
 * rien n'explique pourquoi — on chercherait le défaut dans le rôle, dans la
 * session, dans la base, partout sauf là où il est.
 *
 * *Un silence nommé est une information, un silence subi se lit comme une
 * panne.* Le produit applique déjà cette règle au colis immobile ; elle vaut
 * autant pour l'exploitation.
 *
 * UNE SEULE FOIS PAR INSTANCE, et ce n'est pas de l'économie de journal. Ce
 * message décrit une CONFIGURATION, pas une requête : il ne devient pas plus
 * vrai en étant répété dix mille fois, et le répéter ferait deux dégâts —
 * noyer les vraies lignes, et offrir à n'importe quel visiteur anonyme un moyen
 * de remplir nos journaux depuis une surface qui ne lui répond même pas.
 */
let refusSansAdresseSignale = false;

export function signalerAdminSansAdresse(): void {
  if (refusSansAdresseSignale) return;
  refusSansAdresseSignale = true;

  console.error(
    "[admin] REFUS : aucune adresse d'appelant exploitable, bord de confiance « " +
      bordDeConfiance() +
      " ». La surface d'administration refuse par sécurité et rend 404, donc " +
      "indiscernable d'un « vous n'êtes pas administrateur ». Vérifier que le " +
      "bord pose bien « cf-connecting-ip », ou régler BORD_DE_CONFIANCE " +
      "(cloudflare | xff | aucun). Message émis UNE SEULE FOIS par instance.",
  );
}

export async function verifierQuotaAdmin(): Promise<Verdict> {
  const ip = await adresseAppelant();
  if (ip === null) {
    signalerAdminSansAdresse();
    return surPanne("admin");
  }

  const verdict = await consommer(empreinte(ip), "admin");
  if (!verdict.autorise && verdict.motif === "indisponible") return surPanne("admin");
  return verdict;
}
