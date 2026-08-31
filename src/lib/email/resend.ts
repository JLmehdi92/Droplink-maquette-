import "server-only";
import { lireConfigEmail } from "./config";
import type { Expediteur, Message, ResultatEnvoi } from "./port";

/**
 * L'UNIQUE FICHIER QUI CONNAÎT UN FOURNISSEUR D'EMAIL.
 *
 * ── POURQUOI `fetch` ET NON LE PAQUET `resend` ─────────────────────────────
 *
 * Le brief nomme Resend dans la pile, et c'est bien Resend qui est appelé ici.
 * Ce qui est écarté, c'est son SDK, pour trois raisons mesurables :
 *
 *   - l'envoi est UN POST avec un en-tête d'autorisation ; le SDK n'ajoute ni
 *     signature, ni négociation, ni reprise — rien qui ne soit visible en
 *     quinze lignes ;
 *   - ce chemin tourne dans une tâche de fond dont le budget de démarrage
 *     compte : une dépendance de plus est du code de plus à charger à chaque
 *     passage ;
 *   - une dépendance qui échoue sur un chemin dont l'échec est invisible est
 *     exactement ce que le projet s'interdit ailleurs (L-016). Ici l'échec
 *     serait doublement invisible, puisque le message perdu est celui qui
 *     devait nous prévenir.
 *
 * Le jour où les gabarits React Email arrivent pour les emails DE MARQUE
 * destinés aux vendeurs, ils viendront avec leur dépendance et leur propre
 * adaptateur. Ce fichier-ci n'a qu'un correspondant : nous.
 *
 * ── DEUX PROTECTIONS QUI NE SE VOIENT PAS ──────────────────────────────────
 *
 * 1. UN DÉLAI MAXIMUM. Sans lui, un fournisseur qui ne répond pas fige le
 *    passage de tâche jusqu'au délai de la plateforme. Une alerte qui bloque le
 *    veilleur transforme un incident en deux.
 *
 * 2. LA CLÉ N'APPARAÎT DANS AUCUN MESSAGE D'ERREUR. Le corps de la réponse est
 *    repris tel quel dans le motif de refus — c'est utile pour diagnostiquer —
 *    mais il est borné, et la clé n'y est jamais mise. Une clé recopiée dans un
 *    journal est une clé publiée.
 */

const POINT_DE_TERMINAISON = "https://api.resend.com/emails";

/** Un envoi qui dure plus longtemps n'aide plus personne. */
const DELAI_MS = 10_000;

/** Le corps d'erreur est repris pour diagnostiquer, jamais en entier. */
const MOTIF_MAX = 300;

export function expediteurResend(): Expediteur {
  return {
    async envoyer(message: Message): Promise<ResultatEnvoi> {
      const config = lireConfigEmail();
      if ("manquant" in config) {
        // ON NE TENTE PAS L'ENVOI POUR « VOIR ». Une requête sans clé
        // produirait un 401 qu'on rangerait dans `refuse`, et l'appelant
        // réessaierait indéfiniment un envoi qui ne peut pas aboutir.
        return { statut: "non_configure", manquant: config.manquant };
      }

      let reponse: Response;
      try {
        reponse = await fetch(POINT_DE_TERMINAISON, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.cle}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: config.expediteur,
            to: [config.destinataire],
            subject: message.sujet,
            text: message.texte,
          }),
          signal: AbortSignal.timeout(DELAI_MS),
        });
      } catch (erreur) {
        // Réseau coupé, DNS, délai dépassé : le fournisseur n'a pas été joint.
        // C'est un refus réessayable, pas un défaut de configuration.
        return {
          statut: "refuse",
          motif: "injoignable : " + (erreur instanceof Error ? erreur.message : String(erreur)),
        };
      }

      if (!reponse.ok) {
        const corps = await reponse.text().catch(() => "");
        return {
          statut: "refuse",
          motif: `HTTP ${reponse.status} ${corps.slice(0, MOTIF_MAX)}`.trim(),
        };
      }

      /*
       * L'IDENTIFIANT EST EXIGÉ, PAS SOUHAITÉ.
       *
       * Un 200 sans identifiant serait accepté par toute vérification de statut
       * — et c'est très exactement la forme de fausse réussite que L-024
       * décrit. On préfère un refus visible à un succès qu'on ne peut pas
       * retrouver chez le fournisseur.
       */
      const donnees: unknown = await reponse.json().catch(() => null);
      const id =
        typeof donnees === "object" && donnees !== null && "id" in donnees
          ? (donnees as { id: unknown }).id
          : null;
      if (typeof id !== "string" || id === "") {
        return { statut: "refuse", motif: "réponse acceptée mais sans identifiant" };
      }

      return { statut: "envoye", id };
    },
  };
}
