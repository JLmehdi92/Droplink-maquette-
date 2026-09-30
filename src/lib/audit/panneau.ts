import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { lectureIllisible } from "@/lib/reseau/panne";

/**
 * LE PANNEAU D'ADMINISTRATION.
 *
 * LES ALERTES AVANT LES COMPTEURS. Un panneau qui enterre ses alertes sous des
 * chiffres oblige à chercher ce qui devrait sauter aux yeux — et l'ordre est
 * porté par la donnée, pas par le gabarit, pour qu'un écran futur doive le
 * changer exprès.
 *
 * LE STOCKAGE EST « INDISPONIBLE » TANT QU'ON NE SAIT PAS LE MESURER, jamais
 * « 0 o ». Zéro affirme qu'on a mesuré ; l'absence de mesure n'affirme rien.
 * Et la décision vient de la CONFIGURATION, pas de la valeur : déduire
 * « zéro donc indisponible » deviendrait faux le jour où un compte a réellement
 * zéro octet, ce qui est le cas de tout compte neuf.
 *
 * C'est l'inverse de la règle de la page publique, et c'est voulu : là-bas une
 * information absente est OMISE, ici elle est NOMMÉE. Un client consulte, un
 * administrateur décide — omettre le stockage lui ferait croire qu'il n'y a rien
 * à surveiller.
 */

/** Seuils par défaut, employés tant qu'aucun paramètre n'a été écrit. */
export const SEUIL_COLIS_DEFAUT = 1_200;
export const RETARD_VEILLEUR_MINUTES_DEFAUT = 90;

/**
 * Le plafond mensuel de commandes par compte.
 *
 * Il vivait EN DUR dans le corps du declencheur, ce qui en faisait le seul
 * seuil capable de refuser une ecriture a un utilisateur legitime, et le seul
 * qu on ne pouvait pas changer sans migration.
 *
 * 3 000 : le fournisseur type du brief cree environ 870 commandes par mois
 * (200 par semaine), soit une marge de 3,4 fois. Ce plafond ne bride pas
 * l usage normal — il fait couter une erreur, et non une facture, a un
 * emballement de script.
 */
export const PLAFOND_COMMANDES_MENSUEL_DEFAUT = 3_000;

/**
 * Le nombre TOTAL de prises en charge que le palier du fournisseur de suivi
 * autorise — sur la vie du compte, pas par mois.
 *
 * ⚠️ C'EST LE SEUL BUDGET DU PRODUIT QUI NE SE RECHARGE PAS, et le seul qu'aucun
 * plafond par compte ne protège : `plafond_commandes_mensuel` et le plafond de
 * colis bornent UN vendeur, quand celui-ci est une SOMME sur tous. Dix comptes
 * parfaitement dans les clous l'épuisent sans qu'aucun garde ne s'oppose à rien.
 *
 * 200 parce que c'est ce que le palier donne. Il en restait 191 le 20/09/2026 —
 * et c'est ce chiffre qui a motivé l'alerte Discord à chaque unité dépensée.
 */
export const BUDGET_SUIVI_TOTAL_DEFAUT = 200;

/**
 * Les prises en charge PAYÉES au fournisseur dont la ligne n'existe plus chez
 * nous.
 *
 * ⚠️ 0 PAR DÉFAUT, ET CE N'EST PAS UNE VALEUR NEUTRE : c'est l'aveu que notre
 * base ne peut PAS connaître ce chiffre. Elle compte ce qu'elle a GARDÉ, le
 * fournisseur facture ce qu'il a PRIS EN CHARGE. Mesuré le 20/09/2026 : la
 * production comptait 2 unités consommées, le fournisseur en annonçait 9. Les
 * sept manquantes ont été brûlées avant le 06/09 par des suites qui visaient
 * encore la production, et leurs lignes effacées — l'argent, lui, était parti.
 *
 * La valeur se relit sur le tableau de bord du fournisseur, qui fait autorité.
 */
export const BUDGET_SUIVI_DEJA_CONSOMME_DEFAUT = 0;

/**
 * Le nombre total de commandes qu'un compte GRATUIT peut créer sur sa vie.
 *
 * 5 depuis le 30/09/2026 (décision de Mehdi : « 5 suivis et 5 commandes » — le
 * stock 17TRACK commun, ~191 prises en charge à vie, se vidait en 13 inscrits à
 * 15 colis ; migration 210). 15 avant, décision de Wassim du 20/09/2026, et le
 * « à vie » est le coeur de la
 * décision : un plafond mensuel se contourne en attendant, un plafond à vie se
 * contourne en recréant un compte — ce qui laisse une trace que l'administration
 * voit (les comptes en doublon). Le premier contournement est gratuit et
 * invisible, le second coûte un effort et se repère.
 *
 * ⚠️ Un compte `pro` n'est PAS concerné : il retrouve le plafond MENSUEL, parce
 * qu'un abonnement se renouvelle. Et aucun paiement ne passe par le produit —
 * le plan est un état du compte, posé à la main dans l'administration.
 */
export const PLAFOND_COMMANDES_GRATUIT_A_VIE_DEFAUT = 5;

export interface Alerte {
  readonly genre: string;
  readonly gravite: "critique" | "attention";
  readonly sujet: string;
  readonly valeur: number;
  readonly seuil: number;
}

export interface CompteursAdmin {
  readonly comptes: number;
  readonly comptesActifs: number;
  readonly comptesSuspendus: number;
  readonly comptesSansType: number;
  readonly colisPrisEnChargeCeMois: number;
  readonly colisAbandonnesCeMois: number;
  readonly commandesCreeesCeMois: number;
  /**
   * Les boutiques, et celles qui portent un NOM.
   *
   * ⚠️ DEUX CHIFFRES, PAS UN. Une boutique naît à l'inscription : il y en a
   * donc exactement autant que de comptes, et le seul total afficherait
   * « 20 boutiques » pour vingt comptes dont dix-huit n'ont jamais rien
   * configuré. Celui qui informe est le second — combien de vendeurs sont
   * allés jusqu'à se donner une identité.
   */
  readonly boutiques: number;
  readonly boutiquesNommees: number;
}

/**
 * L'état d'une tâche de fond. TROIS états, pas deux.
 *
 * `jamais-deploye` n'apparaît dans aucune ligne : c'est l'ABSENCE de ligne qui
 * le signifie, et l'appelant le déduit. Sans ce troisième état, un veilleur
 * jamais mis en service se présenterait comme « en retard », et l'on chercherait
 * une panne dans un mécanisme inexistant.
 */
export interface EtatTache {
  readonly source: string;
  readonly dernierBattement: string;
  readonly minutes: number;
  readonly etat: "actif" | "en_retard";
}

/**
 * ⚠️ CHAQUE SECTION PEUT VALOIR `null` — « pas lisible en ce moment », et le
 * TYPE l'exige de tout consommateur.
 *
 * TROIS FOIS LE MÊME DÉFAUT SUR CET ÉCRAN, chaque fois corrigé sur la seule
 * lecture qui venait de tomber : le stockage le 02/09, l'aperçu du journal le
 * 04/09, l'état des tâches une heure plus tard. C'est L-025 en série — *un
 * garde écrit après coup hérite du champ de vision de la CORRECTION, pas du
 * problème* — et la quatrième occurrence était garantie tant qu'on traitait
 * une lecture à la fois.
 *
 * `null` ET NON UNE VALEUR NEUTRE, sur les trois. Le brief l'écrit pour les
 * alertes : *un panneau qui affiche zéro alerte au lieu d'une erreur ferait
 * conclure que tout va bien.* Zéro sur les compteurs affirmerait qu'on a
 * compté. Et une liste de tâches vide se confondrait avec « jamais déployé »,
 * qui envoie chercher une panne dans un mécanisme inexistant.
 *
 * C'est la règle de l'administration, l'inverse de celle de la page publique :
 * ici une information absente est NOMMÉE, jamais omise. Un client consulte, un
 * administrateur décide.
 */
export interface Panneau {
  readonly alertes: readonly Alerte[] | null;
  readonly compteurs: CompteursAdmin | null;
  readonly taches: readonly EtatTache[] | null;
  /**
   * Vrai quand AUCUNE tâche n'a jamais battu.
   *
   * Ce n'est pas une alerte, c'est un CONSTAT : rien n'a été déployé. Le
   * distinguer d'un retard évite d'envoyer chercher une panne là où il n'y a
   * simplement rien à trouver.
   *
   * ⚠️ FAUX QUAND `taches` VAUT `null`. Une lecture qui n'a pas abouti ne dit
   * rien du déploiement : affirmer « rien n'a jamais tourné » sur cette foi-là
   * serait la pire des trois lectures possibles, puisqu'elle enverrait chercher
   * une panne inexistante au moment précis où le réseau en cache une vraie.
   */
  readonly aucuneTacheDeployee: boolean;
  /**
   * Le stockage est-il mesurable ?
   *
   * LA RÉPONSE VIENT DE LA CONFIGURATION, jamais d'une valeur observée. Elle est
   * passée à vrai avec la migration 049, qui installe les compteurs par
   * boutique : il existe désormais un mécanisme qui relève les octets. Tant
   * qu'il n'existait pas, l'écran écrivait « indisponible » — et surtout jamais
   * « 0 o », qui aurait affirmé qu'on avait mesuré.
   *
   * Le raisonnement inverse — « le total vaut zéro, donc ce n'est pas mesuré » —
   * serait faux pour toute installation neuve, c'est-à-dire dès le premier jour.
   */
  readonly stockageMesurable: boolean;
  /** Octets occupés, tous comptes confondus. `null` si non mesurable. */
  readonly stockageOctets: number | null;
}

export type ClientAdmin = SupabaseClient<Database>;

/** La répartition des commandes de la plateforme, par statut. */
export interface RepartitionAdmin {
  readonly total: number;
  readonly preparation: number;
  readonly expedie: number;
  readonly enTransit: number;
  readonly livre: number;
}

/**
 * La répartition des commandes par statut, sur TOUTE la plateforme.
 *
 * ⚠️ ELLE NE PASSE PAS PAR `compter_commandes_par_etat`, ET C'EST LE POINT.
 * Celle-là est `security invoker` : elle compte les commandes DE L'APPELANT, ce
 * qui est exactement ce qu'il faut pour l'écran du vendeur et exactement ce
 * qu'il ne faut pas pour celui de la plateforme. L'appeler ici rendrait les
 * commandes de l'administrateur — c'est-à-dire zéro — sur un panneau qui prétend
 * décrire tout le produit. Un chiffre faux et parfaitement crédible.
 *
 * ⚠️ ELLE NE REND QUE DES NOMBRES, donc elle n'écrit aucun audit. Compter n'est
 * pas consulter : aucun pseudo de client, aucune référence, aucune boutique n'en
 * sort. C'est ce qui la distingue du tableau « Dernières commandes » du kit, que
 * le brief obligerait à auditer À CHAQUE OUVERTURE du panneau — et qui noierait
 * les consultations délibérées que le journal existe pour retrouver.
 *
 * `null` sur une panne de TRANSPORT, comme les quatre autres lectures : la
 * section se nomme indisponible, l'écran se rend.
 */
export async function lireRepartition(
  supabase: ClientAdmin,
): Promise<RepartitionAdmin | null> {
  const reponse = await supabase.rpc("repartir_commandes_admin");
  if (lectureIllisible(reponse, "de la répartition")) return null;
  if (reponse.error !== null) {
    throw new Error("lecture de la répartition impossible : " + reponse.error.message);
  }
  const r = (reponse.data ?? [])[0];
  if (r === undefined) return null;
  return {
    total: Number(r.total),
    preparation: Number(r.preparation),
    expedie: Number(r.expedie),
    enTransit: Number(r.en_transit),
    livre: Number(r.livre),
  };
}

/**
 * Les comptes inscrits sur une fenêtre glissante.
 *
 * ⚠️ LA BORNE EST INCLUSIVE, ET C'EST LE PIÈGE DE BORNE PRIS PAR L'AUTRE BOUT.
 * « depuis le 14 août » doit compter le 14 août : une borne exclusive effacerait
 * le premier jour de la fenêtre, exactement comme « jusqu'à aujourd'hui »
 * effacerait la journée en cours.
 *
 * `null` sur une panne de TRANSPORT : la tuile se nomme indisponible, l'écran se
 * rend — la règle de l'administration, où une information absente est NOMMÉE.
 */
export async function lireInscriptionsRecentes(
  supabase: ClientAdmin,
  maintenant: Date,
  jours: number,
): Promise<number | null> {
  const depuis = new Date(maintenant);
  depuis.setUTCDate(depuis.getUTCDate() - (jours - 1));

  const reponse = await supabase.rpc("compter_inscriptions_admin", {
    p_depuis: depuis.toISOString().slice(0, 10),
  });
  if (lectureIllisible(reponse, "des inscriptions récentes")) return null;
  if (reponse.error !== null) {
    throw new Error("lecture des inscriptions impossible : " + reponse.error.message);
  }
  return Number(reponse.data);
}

/** Un jour de la courbe des commandes de la plateforme. */
export interface JourDeCommandes {
  /** `AAAA-MM-JJ`, tel que la base le rend. */
  readonly jour: string;
  readonly total: number;
}

/**
 * Les commandes créées jour par jour, sur toute la plateforme.
 *
 * ⚠️ LA FENÊTRE VIENT DE L'APPELANT, ET ELLE EST CALCULÉE ICI PLUTÔT QU'EN BASE, et ce n'est pas un détail de
 * confort : une fonction qui poserait elle-même ses bornes empêcherait de les
 * déplacer sans migration, et surtout elle rendrait le jeu de mesure
 * irreproductible — la sonde ne pourrait plus figer la période qu'elle décrit.
 *
 * ⚠️ LA COURBE S'ARRÊTE AUJOURD'HUI, BORNE COMPRISE. C'est le piège de borne
 * haute du dashboard, rencontré sur les filtres de période : « jusqu'à
 * aujourd'hui » vaut minuit, donc une borne exclusive effacerait toute la
 * journée en cours — précisément celle qu'on regarde.
 *
 * `null` sur une panne de TRANSPORT, comme les autres lectures du panneau : la
 * section se nomme indisponible, l'écran se rend.
 */
export async function lireCommandesParJour(
  supabase: ClientAdmin,
  maintenant: Date,
  jours: number,
): Promise<readonly JourDeCommandes[] | null> {
  const jusqua = new Date(maintenant);
  const depuis = new Date(maintenant);
  depuis.setUTCDate(depuis.getUTCDate() - (jours - 1));

  const reponse = await supabase.rpc("compter_commandes_par_jour_admin", {
    p_depuis: enJour(depuis),
    p_jusqu_a: enJour(jusqua),
  });
  if (lectureIllisible(reponse, "de la courbe des commandes")) return null;
  if (reponse.error !== null) {
    throw new Error("lecture de la courbe impossible : " + reponse.error.message);
  }
  return (reponse.data ?? []).map((j) => ({ jour: j.jour, total: Number(j.total) }));
}

/**
 * `Date` → `AAAA-MM-JJ`, en UTC.
 *
 * ⚠️ PAS `toLocaleDateString`, ET PAS UN FUSEAU LOCAL. Le serveur peut tourner
 * n'importe où — Railway a servi ce produit depuis US West pendant trois jours —
 * et une borne décalée d'un fuseau ferait commencer la fenêtre la veille pour la
 * moitié des lecteurs, sans qu'aucun chiffre paraisse faux.
 */
function enJour(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Les seuls compteurs de comptes, sans le reste du panneau.
 *
 * `compteurs_admin` est declaree `stable` : elle n'ecrit rien, donc l'appeler
 * depuis un autre ecran n'ajoute aucune trace. C'est ce qui la distingue de
 * `alertes_admin`, qui rend des adresses et doit donc etre auditee.
 */
export async function lireCompteurs(supabase: ClientAdmin): Promise<CompteursAdmin> {
  const { data, error } = await supabase.rpc("compteurs_admin");
  if (error !== null) {
    throw new Error("lecture des compteurs impossible : " + error.message);
  }
  const c = (data ?? [])[0];
  if (c === undefined) throw new Error("compteurs illisibles : aucune ligne");

  return {
    comptes: Number(c.comptes),
    comptesActifs: Number(c.comptes_actifs),
    comptesSuspendus: Number(c.comptes_suspendus),
    comptesSansType: Number(c.comptes_sans_type),
    colisPrisEnChargeCeMois: Number(c.colis_pris_en_charge_ce_mois),
    colisAbandonnesCeMois: Number(c.colis_abandonnes_ce_mois),
    commandesCreeesCeMois: Number(c.commandes_creees_ce_mois),
    boutiques: Number(c.boutiques),
    boutiquesNommees: Number(c.boutiques_nommees),
  };
}

export async function lirePanneau(
  supabase: ClientAdmin,
  seuils: { colis: number; retardMinutes: number },
): Promise<Panneau> {
  // Les trois lectures sont indépendantes : les enchaîner tripleraient la
  // latence du premier écran que voit un administrateur.
  const [alertes, compteurs, taches, stockage] = await Promise.all([
    supabase.rpc("alertes_admin", {
      p_seuil_colis: seuils.colis,
      p_retard_minutes: seuils.retardMinutes,
    }),
    supabase.rpc("compteurs_admin"),
    supabase.rpc("etat_veilleur", { p_retard_minutes: seuils.retardMinutes }),
    supabase.rpc("stockage_total_admin"),
  ]);

  /**
   * UNE SEULE RÈGLE POUR LES QUATRE LECTURES — c'est le point de cette
   * fonction, et ce n'était pas le cas jusqu'au 04/09/2026.
   *
   * Panne de TRANSPORT : la section devient `null`, l'écran se rend, et
   * l'indisponibilité est nommée. Tout le reste : on lève. Dégrader une erreur
   * applicative ferait vivre un panneau « indisponible » pour toujours sans que
   * personne cherche pourquoi — c'est le défaut symétrique, et il est pire,
   * parce qu'il est définitif.
   *
   * ⚠️ JAMAIS DE `catch` MUET. Ce n'en est pas un : la panne est ÉCRITE dans le
   * journal du serveur et NOMMÉE à l'écran. Un panneau qui afficherait zéro
   * alerte au lieu d'une erreur ferait conclure que tout va bien.
   */
  const alertesIllisibles = lectureIllisible(alertes, "des alertes");
  const compteursIllisibles = lectureIllisible(compteurs, "des compteurs");
  const tachesIllisibles = lectureIllisible(taches, "des tâches");
  /*
   * ⚠️ UNE COUPURE DE TRANSPORT NE DOIT PAS EMPORTER TOUT LE PANNEAU.
   *
   * DÉFAUT MESURÉ LE 02/09/2026, pendant une passe de portes : la sonde a lu un
   * 500 sur `/fr/admin` pour un administrateur légitime, et la trace du serveur
   * a nommé la cause — `lecture du stockage impossible : TypeError: fetch
   * failed`. Ce `throw` faisait tomber l'écran ENTIER : les alertes, les
   * compteurs et l'état des tâches partaient avec le stockage.
   *
   * C'est le pire moment possible pour perdre cet écran. Une coupure réseau est
   * exactement la circonstance où on l'ouvre, et le brief le range en tête :
   * « les alertes avant les compteurs — un panneau qui les enterre oblige à
   * chercher ce qui devrait sauter aux yeux ». Un 500 les enterre toutes.
   *
   * LE BRIEF AVAIT DÉJÀ TRANCHÉ CE CAS, et le champ existait pour le dire : le
   * stockage s'affiche « indisponible » tant qu'il n'est pas mesurable, JAMAIS
   * « 0 o » — parce que zéro affirmerait qu'on a mesuré. Une lecture qui n'a
   * pas abouti est exactement « pas mesurable en ce moment ».
   *
   * ⚠️ ET SEULEMENT POUR UNE PANNE DE TRANSPORT. Une erreur applicative — droit
   * manquant, fonction absente, contrainte violée — continue de lever : la
   * dégrader silencieusement ferait vivre un panneau qui affiche
   * « indisponible » pour toujours sans que personne ne cherche pourquoi.
   */
  const stockageMesurable = !lectureIllisible(stockage, "du stockage");

  const c = (compteurs.data ?? [])[0];
  // UNE LECTURE QUI ABOUTIT SANS LIGNE RESTE UNE ERREUR : la fonction en base
  // en rend toujours une. Ce n'est pas le cas d'une lecture qui n'a pas abouti,
  // laquelle est déjà nommée juste au-dessus.
  if (!compteursIllisibles && c === undefined) {
    throw new Error("compteurs illisibles : aucune ligne");
  }

  const lignesTaches: EtatTache[] | null = tachesIllisibles
    ? null
    : (taches.data ?? []).map((t) => ({
        source: t.source,
        dernierBattement: t.dernier_battement,
        minutes: Number(t.minutes),
        etat: t.etat === "en_retard" ? "en_retard" : "actif",
      }));

  return {
    alertes: alertesIllisibles
      ? null
      : (alertes.data ?? []).map((a) => ({
          genre: a.genre,
          gravite: a.gravite === "critique" ? "critique" : "attention",
          sujet: a.sujet,
          valeur: Number(a.valeur),
          seuil: Number(a.seuil),
        })),
    compteurs:
      c === undefined
        ? null
        : {
            comptes: Number(c.comptes),
            comptesActifs: Number(c.comptes_actifs),
            comptesSuspendus: Number(c.comptes_suspendus),
            comptesSansType: Number(c.comptes_sans_type),
            colisPrisEnChargeCeMois: Number(c.colis_pris_en_charge_ce_mois),
            colisAbandonnesCeMois: Number(c.colis_abandonnes_ce_mois),
            commandesCreeesCeMois: Number(c.commandes_creees_ce_mois),
            boutiques: Number(c.boutiques),
            boutiquesNommees: Number(c.boutiques_nommees),
          },
    taches: lignesTaches,
    // ⚠️ `false` QUAND LA LECTURE N'A PAS ABOUTI. « Aucune tâche déployée »
    // enverrait chercher une panne dans un mécanisme inexistant, sur la foi
    // d'une lecture qui n'a rien rapporté du tout.
    aucuneTacheDeployee: lignesTaches !== null && lignesTaches.length === 0,
    // LE MÉCANISME EXISTE DEPUIS LA 049 : les octets sont tenus à l'écriture,
    // boutique par boutique, à partir de la taille RELUE CÔTÉ SERVEUR au dépôt.
    // C'est ce qui autorise à afficher un chiffre plutôt qu'« indisponible ».
    // Il reste vrai EN CONFIGURATION ; ce qui peut le faire basculer, c'est une
    // lecture qui n'aboutit pas — voir le bloc de transport plus haut.
    stockageMesurable,
    stockageOctets: stockageMesurable ? Number(stockage.data ?? 0) : null,
  };
}

/** Lit les seuils configurés, ou rend les défauts. */
export async function lireSeuils(
  supabase: ClientAdmin,
): Promise<{ colis: number; retardMinutes: number }> {
  // Le plafond de commandes n'est plus lu ici (200) : la fiche d'un compte reçoit
  // son quota À LA RÈGLE DE SON PLAN de `lire_compte_admin`, et aucun autre écran
  // ne l'affichait.
  const [colis, retard] = await Promise.all([
    supabase.rpc("lire_parametre_entier", {
      p_cle: "seuil_colis_par_compte",
      p_defaut: SEUIL_COLIS_DEFAUT,
    }),
    supabase.rpc("lire_parametre_entier", {
      p_cle: "retard_veilleur_minutes",
      p_defaut: RETARD_VEILLEUR_MINUTES_DEFAUT,
    }),
  ]);

  // UNE LECTURE EN ÉCHEC RETOMBE SUR LE DÉFAUT plutôt que de casser l'écran :
  // un seuil est un réglage, pas une autorisation. Le raisonnement serait
  // inverse pour une garde, où l'échec doit refuser.
  return {
    colis: colis.error === null && colis.data !== null ? Number(colis.data) : SEUIL_COLIS_DEFAUT,
    retardMinutes:
      retard.error === null && retard.data !== null
        ? Number(retard.data)
        : RETARD_VEILLEUR_MINUTES_DEFAUT,
  };
}
