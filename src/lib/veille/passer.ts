import "server-only";
import type { Expediteur } from "@/lib/email/port";
import { expediteurResend } from "@/lib/email/resend";
import { creerClientSysteme } from "@/lib/supabase/system";
import { purgerCles } from "@/lib/storage/purge";
import type { Json } from "@/lib/supabase/types-base";
import { decider, type Alerte, type BattementVu } from "./decision";
import { TACHE_VEILLE, TACHES_ATTENDUES } from "./taches";

/**
 * LE PASSAGE DE VEILLE — la partie qui parle à la base et au fournisseur.
 *
 * Elle ne décide rien : `decision.ts` est pur et éprouvable sans réseau. Ce
 * fichier ne fait que quatre choses — lire le seuil, lire les battements,
 * réserver, envoyer — et l'ordre de ces quatre choses est tout ce qui compte.
 *
 * ── L'ORDRE RÉSERVER → ENVOYER → LIBÉRER-SI-ÉCHEC ──────────────────────────
 *
 * Réserver AVANT d'envoyer départage deux passages concurrents : sans cela, la
 * cadence et la veille constatant la même panne enverraient chacune leur email.
 *
 * Mais réserver avant une opération qui peut échouer est le piège n°1 du brief
 * (§11) : « un compteur incrémenté AVANT une opération qui peut échouer perd
 * des événements définitivement ». Ici l'événement perdu serait l'alerte
 * elle-même, tue pendant toute la durée du repos — c'est-à-dire pendant la
 * panne qu'elle décrivait. D'où la libération sur échec : le passage suivant
 * réessaie. On préfère alerter deux fois que se taire une fois.
 *
 * ── POURQUOI AUCUN ÉVÉNEMENT POSTHOG N'EST ÉMIS ICI ────────────────────────
 *
 * `NOTIFICATION_ENVOYEE` et `NOTIFICATION_ECHOUEE` existent, et les réutiliser
 * serait tentant. Ce serait une faute de mesure : ces deux-là comptent les
 * notifications envoyées AUX VENDEURS, et l'instrumentation d'usage est le
 * livrable réel de la phase de validation. Y verser nos propres alertes
 * d'exploitation mélangerait deux populations dans un même compteur — « un
 * fait, un point d'émission ». Une alerte d'exploitation se lit dans le
 * journal du serveur et dans la boîte de l'exploitant, pas dans les métriques
 * de verdict du produit.
 */

export interface BilanVeille {
  /** Tâches examinées, l'observateur exclu. */
  readonly observees: number;
  /** Alertes que la décision a produites. */
  readonly alertes: number;
  readonly envoyees: number;
  /** Alertes déjà envoyées récemment : le repos n'était pas écoulé. */
  readonly enRepos: number;
  /** Alertes réservées puis LIBÉRÉES parce que l'envoi a échoué. */
  readonly echecs: number;
  /** Vrai si l'expéditeur n'est pas configuré. Le dire, ne pas le taire. */
  readonly nonConfigure: boolean;
}

/**
 * Combien de temps avant de redire la même chose.
 *
 * Aligné sur le seuil de retard : redire toutes les heures qu'une tâche est en
 * retard depuis une heure n'apprend rien de plus, et le volume est ce qui
 * apprend à ignorer une alerte. Plancher d'une heure pour qu'un seuil réglé
 * bas ne transforme pas le veilleur en émetteur.
 */
function reposMinutes(retardMinutes: number): number {
  return Math.max(60, retardMinutes);
}

/** Ce qu'il faut pour envoyer une alerte : sa clé de repos, son sujet, son texte. */
type AlerteEnvoyable = Pick<Alerte, "cle" | "sujet" | "texte">;
type IssueAlerte = "envoyee" | "repos" | "echec" | "non_configure";

/**
 * UNE alerte, dans l'ordre réserver → envoyer → libérer-si-échec (voir l'en-tête).
 * Partagée par la veille des tâches et par les alertes de purge : deux chemins
 * qui recopieraient cet ordre finiraient par ne plus le suivre tous les deux.
 */
async function envoyerAlerte(
  systeme: ReturnType<typeof creerClientSysteme>,
  expediteur: Expediteur,
  alerte: AlerteEnvoyable,
  repos: number,
): Promise<IssueAlerte> {
  const { data: obtenue, error: erreurReservation } = await systeme.rpc("reserver_alerte", {
    p_cle: alerte.cle,
    p_repos_minutes: repos,
  });
  if (erreurReservation !== null) {
    // Ne PAS envoyer sans réservation : sans elle, chaque passage enverrait.
    console.error("[veille] réservation impossible — " + erreurReservation.message);
    return "echec";
  }
  if (obtenue !== true) return "repos";

  // Pas de destinataire dans l'appel : il vient de la configuration. Voir
  // `email/port.ts` — une alerte dont l'appelant choisit la destination est
  // une alerte qu'on peut détourner.
  const resultat = await expediteur.envoyer({ sujet: alerte.sujet, texte: alerte.texte });

  if (resultat.statut === "envoye") {
    console.warn(`[veille] alerte envoyée (${alerte.cle}) — message ${resultat.id}`);
    return "envoyee";
  }

  // ÉCHEC : on rend la réservation, sinon l'alerte se tait pour toute la
  // durée du repos.
  const { error: erreurLiberation } = await systeme.rpc("liberer_alerte", { p_cle: alerte.cle });
  if (erreurLiberation !== null) {
    // L'INVERSE EXACT DE L'INTENTION (audit du 20/09/2026) : la réservation reste posée, et
    // l'alerte se tait pour toute la durée du repos alors qu'elle n'est jamais partie.
    console.error(
      `[veille] alerte ${alerte.cle} non envoyée ET non rendue : elle se taira jusqu'à la fin du repos — ` +
        erreurLiberation.message,
    );
  }

  if (resultat.statut === "non_configure") {
    /*
     * BRUYANT, ET DÉLIBÉRÉMENT.
     *
     * C'est le seul endroit où l'on peut encore apprendre que le veilleur
     * est muet. Un message discret ferait de ce produit exactement ce que
     * L-022 décrit : un mécanisme dont on croit qu'il alerte. La liste de ce
     * qui manque est nommée, parce que savoir QUE ce n'est pas configuré ne
     * suffit pas à le configurer.
     */
    console.error(
      `[veille] ALERTE NON ENVOYÉE, EXPÉDITEUR NON CONFIGURÉ — ${alerte.cle}. ` +
        `Variables manquantes ou non substituées : ${resultat.manquant.join(", ")}. ` +
        `Tant qu'elles manquent, AUCUNE alerte ne part : le veilleur constate et se tait.`,
    );
    return "non_configure";
  }
  console.error(`[veille] alerte refusée (${alerte.cle}) — ${resultat.motif}`);
  return "echec";
}

/**
 * LES PURGES QUI ÉCHOUENT SE DISENT PAR E-MAIL (audit ECC du 29/09/2026).
 *
 * Jusque-là leur échec n'allait que dans le détail du battement — que NI
 * l'écran de surveillance NI la veille mutuelle ne lisent : le battement reste
 * « à l'heure », puisqu'il est écrit. Une purge RGPD en panne (206 absente en
 * production, par exemple) aurait donc manqué indéfiniment aux durées que la
 * politique de confidentialité PROMET, sans un signal. C'est une obligation
 * légale, pas une statistique.
 *
 * Fonction PURE : elle dit quoi alerter, `passerLaVeille` envoie.
 */
export function alertesDePurge(purge: {
  readonly comptes: string | null;
  readonly durees: string | null;
}): AlerteEnvoyable[] {
  const alertes: AlerteEnvoyable[] = [];
  if (purge.comptes !== null) {
    alertes.push({
      cle: "veille:purge:comptes",
      sujet: "[DropLink] Purge des comptes supprimés en échec",
      texte:
        "La purge des médias et de la conservation d'un an des comptes supprimés a échoué " +
        `(migration 157). Elle sera rejouée au prochain passage.\n\nErreur : ${purge.comptes}`,
    });
  }
  if (purge.durees !== null) {
    alertes.push({
      cle: "veille:purge:durees",
      sujet: "[DropLink] Purge RGPD en échec — durées de conservation non tenues",
      texte:
        "La purge des durées promises par la politique de confidentialité a échoué : demandes " +
        "d'e-mail non confirmées (24 h), vues (13 mois), archives de paiement (3 ans). Tant " +
        "qu'elle échoue, ces données sont gardées au-delà de ce que la page annonce. Vérifier " +
        `que la migration 206 est appliquée.\n\nErreur : ${purge.durees}`,
    });
  }
  return alertes;
}

/**
 * Six heures entre deux alertes de purge : la veille passe tous les quarts
 * d'heure, et redire la même panne 24 fois par jour apprend surtout à l'ignorer.
 */
const REPOS_PURGE_MINUTES = 360;

/**
 * Un passage de veille, mené par `veilleur`, qui regarde toutes les AUTRES
 * tâches attendues.
 *
 * LÈVE si l'état est illisible. C'est voulu : un passage qui n'a pas pu lire
 * n'a pas veillé, et le dire par un 200 reviendrait à certifier un travail qui
 * n'a pas eu lieu. Le planificateur doit voir du rouge. L'appelant qui a un
 * autre travail à protéger — la cadence — attrape lui-même.
 *
 * `expediteur` est injectable pour que la suite puisse éprouver l'ordre
 * réserver/envoyer/libérer sans joindre Resend. Le défaut est le vrai.
 */
export async function veillerSur(
  veilleur: string,
  maintenant: Date,
  expediteur: Expediteur = expediteurResend(),
): Promise<BilanVeille> {
  const systeme = creerClientSysteme();

  const { data: retardBrut, error: erreurSeuil } = await systeme.rpc(
    "lire_retard_veilleur_minutes",
  );
  if (erreurSeuil !== null) {
    throw new Error("veille : seuil de retard illisible — " + erreurSeuil.message);
  }
  const retardMinutes = Number(retardBrut);

  const { data, error } = await systeme.rpc("etat_veille", {
    p_sources: [...TACHES_ATTENDUES],
    p_retard_minutes: retardMinutes,
  });
  if (error !== null || data === null) {
    throw new Error("veille : état illisible — " + (error?.message ?? "réponse vide"));
  }

  const battements: BattementVu[] = data.map((b) => ({
    source: b.source,
    // L'état vient de la base, qui applique le seuil ; on ne le recalcule pas
    // ici sous peine d'avoir deux règles pour une seule question.
    etat: b.etat === "en_retard" ? "en_retard" : b.etat === "jamais_vue" ? "jamais_vue" : "actif",
    minutes: b.minutes === null ? null : Number(b.minutes),
    premierBattement: b.premier_battement,
  }));

  const alertes = decider({ veilleur, battements, maintenant, retardMinutes });

  let envoyees = 0;
  let enRepos = 0;
  let echecs = 0;
  let nonConfigure = false;

  for (const alerte of alertes) {
    const issue = await envoyerAlerte(systeme, expediteur, alerte, reposMinutes(retardMinutes));
    if (issue === "envoyee") envoyees += 1;
    else if (issue === "repos") enRepos += 1;
    else {
      echecs += 1;
      if (issue === "non_configure") nonConfigure = true;
    }
  }

  return {
    observees: battements.filter((b) => b.source !== veilleur).length,
    alertes: alertes.length,
    envoyees,
    enRepos,
    echecs,
    nonConfigure,
  };
}

/**
 * LE PASSAGE COMPLET DU SECOND PLANIFICATEUR : veiller, PUIS battre.
 *
 * ⚠️ POURQUOI `veillerSur` NE BAT PAS ELLE-MÊME.
 *
 * Parce qu'elle a deux appelants qui n'ont pas la même identité. La cadence
 * l'appelle sous le nom `cadence-suivi` et écrit ENSUITE son propre battement,
 * chargé de son bilan (colis examinés, interrogés, abandonnés, purge). Si
 * `veillerSur` battait, elle écraserait ce détail par le sien, et l'écran de
 * surveillance perdrait la seule trace qui permet de relire pourquoi une
 * journée n'a rien suivi.
 *
 * Chaque source écrit donc son propre battement, à la fin de son propre
 * passage. C'est la règle qui rend le battement crédible : il est écrit par
 * celui qui a fait le travail, et seulement s'il l'a fait.
 */
export async function passerLaVeille(
  maintenant: Date,
  expediteur?: Expediteur,
): Promise<BilanVeille> {
  const bilan = await veillerSur(TACHE_VEILLE, maintenant, expediteur);

  // APRÈS, et seulement si la veille a abouti : `veillerSur` lève quand l'état
  // est illisible, et l'on n'arrive alors jamais ici. Un passage qui n'a pas
  // veillé ne doit pas certifier l'avoir fait.
  const systeme = creerClientSysteme();
  const purge = await purgerLaFile(systeme);
  const durees = await purgerLesDurees(systeme);
  const issuesPurge: IssueAlerte[] = [];
  for (const alerte of alertesDePurge({ comptes: purge.erreur, durees: durees.erreur })) {
    issuesPurge.push(await envoyerAlerte(systeme, expediteur ?? expediteurResend(), alerte, REPOS_PURGE_MINUTES));
  }
  const { error: erreurBattement } = await systeme.rpc("battre", {
    p_source: TACHE_VEILLE,
    p_detail: {
      observees: bilan.observees,
      alertes: bilan.alertes,
      envoyees: bilan.envoyees,
      en_repos: bilan.enRepos,
      echecs: bilan.echecs,
      // ÉCRIT DANS LE BATTEMENT : c'est ce qui permet de lire, depuis l'écran
      // d'administration, qu'un veilleur tourne bel et bien mais qu'il est
      // MUET. Sans cela, une veille non configurée et une veille sans rien à
      // signaler produisent exactement la même trace.
      non_configure: bilan.nonConfigure,
      // LA PURGE DES COMPTES SUPPRIMÉS, dans le même battement : une file qui ne
      // se vide jamais se lit ici, et nulle part ailleurs.
      purge_objets: purge.purgees,
      purge_echecs: purge.echecs,
      purge_erreur: purge.erreur,
      conservations_effacees: purge.conservationsEffacees,
      // LES DURÉES DE CONSERVATION (206) : ce que la politique de confidentialité
      // promet d'effacer, compté ici pour qu'une purge muette se voie.
      durees_effacees: durees.effacees,
      durees_erreur: durees.erreur,
      // Ce que sont devenues les alertes de purge : « repos » ou « echec » se lisent ici.
      purge_alertes: issuesPurge,
    },
  });
  // UN BATTEMENT PERDU FAIT CROIRE À UNE TÂCHE MORTE (audit du 20/09/2026). On le dit ici.
  if (erreurBattement !== null) {
    console.error("[veille] battement non écrit — " + erreurBattement.message);
  }

  return bilan;
}

/**
 * LA FILE DE PURGE R2 ET LA FIN DE LA CONSERVATION D'UN AN (migration 157).
 *
 * La suppression d'un compte met ses clés en file DANS sa transaction et tente
 * la purge aussitôt ; la veille la REJOUE ici jusqu'au succès, tous les quarts
 * d'heure. Une clé ne sort de la file qu'une fois tout ce qu'elle emporte
 * réellement supprimé (`purgerCles`).
 *
 * ⚠️ UN ÉCHEC ICI N'EMPÊCHE PAS LE BATTEMENT. La veille surveille les tâches ;
 * la faire tomber parce que R2 répond mal ferait croire que le VEILLEUR est en
 * panne, et l'alerte désignerait le mauvais coupable. L'échec est écrit dans le
 * battement, lisible depuis l'écran de surveillance.
 */
async function purgerLaFile(systeme: ReturnType<typeof creerClientSysteme>): Promise<{
  purgees: number;
  echecs: number;
  erreur: string | null;
  conservationsEffacees: number;
}> {
  try {
    const { data: cles, error } = await systeme.rpc("cles_a_purger", { p_limite: 200 });
    if (error !== null) throw new Error(error.message);
    const { purgees, echecs } = await purgerCles(cles ?? []);
    if (purgees.length > 0) {
      const { error: eSortie } = await systeme.rpc("purges_effectuees", { p_cles: [...purgees] });
      if (eSortie !== null) throw new Error(eSortie.message);
    }
    const { data: effacees, error: eConservation } = await systeme.rpc("purger_comptes_supprimes");
    if (eConservation !== null) throw new Error(eConservation.message);
    return { purgees: purgees.length, echecs, erreur: null, conservationsEffacees: effacees ?? 0 };
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    console.error("[veille] purge : " + message);
    return { purgees: 0, echecs: 0, erreur: message.slice(0, 200), conservationsEffacees: 0 };
  }
}

/**
 * CE QUE LA POLITIQUE DE CONFIDENTIALITÉ PROMET D'EFFACER (migration 206) :
 * demandes d'e-mail non confirmées (24 h), vues (13 mois), archives de paiement
 * (3 ans).
 *
 * ⚠️ SÉPARÉE DE LA PURGE R2, ET C'EST VOULU : un stockage qui répond mal ne doit
 * pas suspendre un effacement que la loi exige. Chacune échoue seule, et le dit
 * dans le battement.
 */
async function purgerLesDurees(systeme: ReturnType<typeof creerClientSysteme>): Promise<{
  effacees: Json;
  erreur: string | null;
}> {
  const { data, error } = await systeme.rpc("purger_donnees_expirees");
  if (error !== null) {
    console.error("[veille] durées de conservation : " + error.message);
    return { effacees: null, erreur: error.message.slice(0, 200) };
  }
  return { effacees: data, erreur: null };
}
