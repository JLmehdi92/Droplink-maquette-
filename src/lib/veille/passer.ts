import "server-only";
import type { Expediteur } from "@/lib/email/port";
import { expediteurResend } from "@/lib/email/resend";
import { creerClientSysteme } from "@/lib/supabase/system";
import { purgerCles } from "@/lib/storage/purge";
import { decider, type BattementVu } from "./decision";
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
    const { data: obtenue, error: erreurReservation } = await systeme.rpc("reserver_alerte", {
      p_cle: alerte.cle,
      p_repos_minutes: reposMinutes(retardMinutes),
    });
    if (erreurReservation !== null) {
      // Ne PAS envoyer sans réservation : sans elle, chaque passage enverrait.
      console.error("[veille] réservation impossible — " + erreurReservation.message);
      echecs += 1;
      continue;
    }
    if (obtenue !== true) {
      enRepos += 1;
      continue;
    }

    // Pas de destinataire dans l'appel : il vient de la configuration. Voir
    // `email/port.ts` — une alerte dont l'appelant choisit la destination est
    // une alerte qu'on peut détourner.
    const resultat = await expediteur.envoyer({ sujet: alerte.sujet, texte: alerte.texte });

    if (resultat.statut === "envoye") {
      envoyees += 1;
      console.warn(`[veille] alerte envoyée (${alerte.cle}) — message ${resultat.id}`);
      continue;
    }

    // ÉCHEC : on rend la réservation, sinon l'alerte se tait pour toute la
    // durée du repos.
    await systeme.rpc("liberer_alerte", { p_cle: alerte.cle });
    echecs += 1;

    if (resultat.statut === "non_configure") {
      nonConfigure = true;
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
    } else {
      console.error(`[veille] alerte refusée (${alerte.cle}) — ${resultat.motif}`);
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
  await systeme.rpc("battre", {
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
    },
  });

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
