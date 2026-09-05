import "server-only";
import { creerClientSysteme } from "@/lib/supabase/system";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { dixSeptTrack } from "./provider/dix-sept-track";
import { ingererEtat } from "./ingestion";
import { prendreEnCharge } from "./prise-en-charge";
import { decider, type EtatColis } from "./schedule";
import { veillerSur } from "@/lib/veille/passer";
import { TACHE_CADENCE } from "@/lib/veille/taches";
import { decrireSilence } from "./silence";

/**
 * LA TÂCHE DE FOND DU SUIVI.
 *
 * Elle ne décide rien elle-même : la décision est prise par `schedule.ts`, qui
 * est pur et éprouvable sans réseau. Ce fichier ne fait que trois choses —
 * demander la liste, appliquer la décision, écrire le battement — et c'est
 * exactement pour cela qu'il tient en une page.
 *
 * L'INSTANT EST PRIS UNE SEULE FOIS, AU DÉBUT. Si chaque colis lisait l'horloge,
 * un lot de cinquante s'étalerait sur plusieurs secondes et deux colis à égalité
 * seraient traités selon des règles imperceptiblement différentes. Un lot doit
 * décrire un INSTANT, pas une durée.
 *
 * LE BATTEMENT EST ÉCRIT MÊME QUAND RIEN N'EST FAIT, et surtout quand rien n'est
 * fait. Un veilleur qui ne bat que lorsqu'il travaille est indiscernable d'un
 * veilleur mort le jour où il n'y a rien à faire.
 */

export interface BilanCadence {
  readonly examines: number;
  readonly interroges: number;
  readonly abandonnes: number;
  readonly repris: number;
  readonly indisponibles: number;
  /** Colis dont le silence vient d'être NOMMÉ, une seule fois dans leur vie. */
  readonly immobilises: number;
}

/** Ce qu'on traite en un passage. Borné : un passage doit finir. */
const LOT = 50;

export async function passerLaCadence(maintenant: Date, limite = LOT): Promise<BilanCadence> {
  const systeme = creerClientSysteme();

  /*
   * L'INTERRUPTEUR COUPE LE TRAVAIL, PAS LE VEILLEUR.
   *
   * Le battement continue d'être écrit plus bas : une tâche coupée à dessein
   * n'est pas une tâche en panne, et laisser le veilleur se taire ferait
   * chercher une panne pendant que l'écran d'administration affiche
   * l'interrupteur qu'on a soi-même baissé.
   *
   * LA PURGE, ELLE, CONTINUE. Elle ne coûte rien chez le fournisseur : c'est de
   * l'hygiène de notre propre base, et l'arrêter ferait payer une décision de
   * facturation par une croissance de disque.
   */
  const { data: actif, error: erreurInterrupteur } = await systeme.rpc("lire_suivi_actif");
  if (erreurInterrupteur !== null) {
    console.error(
      "[suivi] cadence : interrupteur illisible, passage laissé ouvert — " +
        erreurInterrupteur.message,
    );
  }
  const coupe = erreurInterrupteur === null && actif === false;

  const { data, error } = coupe
    ? { data: [], error: null }
    : await systeme.rpc("colis_a_interroger", { p_limite: limite });

  if (error !== null || data === null) {
    // Le battement N'EST PAS écrit : un passage qui n'a pas pu lire sa liste n'a
    // pas veillé. Le dire par un battement reviendrait à certifier un travail
    // qui n'a pas eu lieu — exactement ce qu'un veilleur ne doit jamais faire.
    console.error("[suivi] cadence : liste illisible — " + (error?.message ?? "réponse vide"));
    throw new Error("cadence-liste-illisible");
  }

  const bilan = {
    examines: data.length,
    interroges: 0,
    abandonnes: 0,
    repris: 0,
    indisponibles: 0,
    immobilises: 0,
  };

  for (const colis of data) {
    const etat: EtatColis = {
      enregistreLe: colis.registered_at === null ? null : new Date(colis.registered_at),
      dernierMouvement: colis.last_movement_at === null ? null : new Date(colis.last_movement_at),
      derniereInterrogation: colis.last_query_at === null ? null : new Date(colis.last_query_at),
      interrogationsVides: colis.empty_count,
      etape: colis.normalized_status,
      abandonneLe: null,
    };

    /*
     * L'IMMOBILITÉ EST ÉVALUÉE AVANT LA DÉCISION, ET C'EST LE POINT DÉLICAT.
     *
     * La placer après le `continue` du cas « attendre » ne signalerait jamais
     * rien : un colis silencieux est précisément celui que la cadence espace le
     * plus, donc celui qui tombe le plus souvent dans « attendre ». La garde
     * regarderait exactement là où le cas ne se produit pas.
     *
     * La marque est RÉCLAMÉE, pas lue puis écrite : deux passages concurrents
     * liraient tous deux « jamais signalé » et émettraient tous deux. La base
     * tranche en une seule instruction et dit qui a gagné.
     */
    const silence = decrireSilence(etat.dernierMouvement, maintenant, etat.etape);
    if (silence.etat === "silencieux") {
      const { data: reclame, error: erreurMarque } = await systeme.rpc("reclamer_immobilite", {
        p_parcel_id: colis.id,
        p_quand: maintenant.toISOString(),
      });
      // On n'émet QUE si la base a confirmé. Émettre sur une écriture dont on
      // ignore le sort ferait compter des immobilisations qui ne sont inscrites
      // nulle part — et l'interface, l'analytics comprise, n'affirme jamais ce
      // que la base n'a pas enregistré.
      if (erreurMarque === null && reclame === true) {
        await emettre(
          EVENEMENTS.COLIS_IMMOBILISE,
          { sujet: "suivi:" + colis.tracking_number.slice(0, 4) },
          { jours: silence.jours, etape: colis.normalized_status },
        );
        bilan.immobilises += 1;
      }
    }

    const decision = decider(etat, maintenant);

    if (decision.action === "attendre" || decision.action === "terminer") continue;

    if (decision.action === "abandonner") {
      const { error: erreurAbandon } = await systeme.rpc("abandonner_colis", {
        p_parcel_id: colis.id,
        p_motif: "abandon:" + decision.motif,
      });

      // L'INTERFACE N'AFFIRME JAMAIS CE QUE LA BASE N'A PAS ENREGISTRÉ, et un
      // événement d'analytics est une affirmation comme une autre. L'erreur
      // était jetée : on émettait « suivi abandonné » pour un colis toujours
      // actif, et le bilan le comptait. Une métrique légèrement fausse reste
      // crédible — c'est ce qui la rend pire qu'une métrique cassée.
      if (erreurAbandon !== null) {
        console.error(
          "[suivi] cadence : abandon non écrit pour " +
            colis.tracking_number.slice(0, 4) +
            " — " +
            erreurAbandon.message,
        );
        continue;
      }

      await emettre(
        EVENEMENTS.SUIVI_ABANDONNE,
        { sujet: "suivi:" + colis.tracking_number.slice(0, 4) },
        { motif: decision.motif, a_la_prise_en_charge: false },
      );
      bilan.abandonnes += 1;
      continue;
    }

    // MARQUÉ INTERROGÉ AVANT L'APPEL, et c'est délibéré. Si le fournisseur est
    // injoignable, le colis ne doit PAS revenir au prochain passage : il
    // reviendrait à chaque passage, en boucle, et chaque tentative se paie. On
    // accepte donc de perdre un tour plutôt que de risquer une boucle.
    //
    // ET SON ÉCHEC ARRÊTE LE TRAITEMENT DE CE COLIS. L'erreur était jetée : si
    // la date d'interrogation n'était pas posée, on interrogeait quand même, le
    // colis ressortait au passage suivant, et on repayait — à chaque passage,
    // indéfiniment. La seule protection contre la boucle était l'écriture dont
    // on ne lisait pas le résultat.
    const { error: erreurMarque } = await systeme.rpc("marquer_interroge", {
      p_parcel_id: colis.id,
    });
    if (erreurMarque !== null) {
      console.error(
        "[suivi] cadence : date d'interrogation non posée pour " +
          colis.tracking_number.slice(0, 4) +
          " — colis ignoré ce passage pour ne pas boucler. " +
          erreurMarque.message,
      );
      continue;
    }

    // UN COLIS JAMAIS ENREGISTRÉ CHEZ LE FOURNISSEUR EST REPRIS ICI. C'est le
    // filet de la prise en charge différée : `registered_at` restée nulle est
    // précisément le signal que l'appel initial n'a pas abouti.
    if (colis.registered_at === null) {
      const reprise = await prendreEnCharge(colis.id, colis.tracking_number, colis.carrier_code);
      if (reprise.statut === "indisponible") bilan.indisponibles += 1;
      else bilan.repris += 1;
      continue;
    }

    const reponse = await dixSeptTrack
      .interroger(colis.tracking_number, colis.carrier_code)
      .catch(() => ({ statut: "indisponible" as const, motif: "exception" }));

    if (reponse.statut === "indisponible") {
      bilan.indisponibles += 1;
      continue;
    }

    await ingererEtat(colis.tracking_number, reponse);
    bilan.interroges += 1;
  }

  /*
   * LA PURGE VIT ICI, ET NON DANS SON PROPRE PLANIFICATEUR.
   *
   * Le brief promet une purge des réponses brutes à 90 jours depuis la première
   * migration du suivi. Elle n'existait pas — aucune fonction, aucune tâche, et
   * `pg_cron` même pas installé. Un second mécanisme de planification serait un
   * second mécanisme à surveiller ; celui-ci passe déjà régulièrement.
   *
   * APRÈS le travail utile, et son échec ne fait pas échouer le passage : ne pas
   * avoir purgé n'annule pas ce qui a été suivi. Mais il est NOMMÉ — une purge
   * silencieusement en panne se découvre au quota disque, et cette base y est
   * déjà passée une fois.
   */
  const { data: purge, error: erreurPurge } = await systeme.rpc("purger_donnees_de_suivi", {
    p_lot: 5000,
  });
  if (erreurPurge !== null) {
    console.error("[suivi] cadence : purge des réponses brutes en échec — " + erreurPurge.message);
  }
  const purgee = purge?.[0];

  /*
   * L'AUTRE MOITIÉ DE LA VEILLE MUTUELLE.
   *
   * La cadence regarde `veille-mutuelle`, exactement comme celle-ci la regarde.
   * Sans ce sens-là, la mort du second planificateur ne serait constatée par
   * personne — et l'on ne s'en apercevrait qu'au moment où la cadence tombe à
   * son tour, c'est-à-dire quand plus rien ne peut le dire.
   *
   * ⚠️ SON ÉCHEC N'ANNULE PAS LE PASSAGE. Le suivi vient d'être fait ; le
   * perdre parce qu'une alerte n'est pas partie ferait payer le travail utile
   * par un défaut du mécanisme censé le protéger. L'échec est NOMMÉ, jamais
   * avalé — un `catch` muet ici rendrait une veille en panne indiscernable
   * d'une veille qui n'a rien trouvé.
   */
  try {
    await veillerSur(TACHE_CADENCE, maintenant);
  } catch (erreur) {
    console.error(
      "[suivi] cadence : la veille sur l'autre planificateur a échoué — " +
        (erreur instanceof Error ? erreur.message : String(erreur)),
    );
  }

  await systeme.rpc("battre", {
    p_source: TACHE_CADENCE,
    p_detail: {
      // ÉCRIT DANS LE BATTEMENT : sans lui, un passage coupé et un passage sans
      // rien à faire produisent exactement la même trace, et l'on ne pourrait
      // pas relire pourquoi une journée n'a rien suivi.
      suivi_actif: !coupe,
      examines: bilan.examines,
      interroges: bilan.interroges,
      abandonnes: bilan.abandonnes,
      repris: bilan.repris,
      indisponibles: bilan.indisponibles,
      immobilises: bilan.immobilises,
      // `null` et `0` ne disent pas la même chose : l'un dit « la purge n'a pas
      // tourné », l'autre « elle a tourné et n'a rien trouvé à faire ».
      purge_instantanes: erreurPurge !== null ? null : (purgee?.instantanes ?? 0),
      purge_notifications: erreurPurge !== null ? null : (purgee?.notifications ?? 0),
    },
  });

  return bilan;
}
