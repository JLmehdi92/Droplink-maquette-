import "server-only";
import { fetchBorne } from "@/lib/reseau/fetch-borne";
import { lireConfigEmailClient } from "./config";

/**
 * UN E-MAIL VERS LE CLIENT FINAL — celui qui n'a jamais eu de compte chez nous.
 *
 * Deux règles que l'envoi des alertes n'avait pas à tenir :
 *
 * 1. LA DÉSINSCRIPTION EN UN CLIC (RFC 8058). Chaque e-mail de suivi porte
 *    `List-Unsubscribe` et `List-Unsubscribe-Post` : la messagerie du client
 *    affiche son propre bouton « se désabonner », qui poste sans ouvrir de page.
 *    Gmail et Yahoo l'EXIGENT des expéditeurs en volume ; sans lui, nos e-mails
 *    finiraient en indésirables — et ceux des vendeurs avec.
 * 2. LE TEXTE BRUT. Pas de HTML, donc rien à échapper, aucun pixel de suivi,
 *    aucun lien masqué derrière un libellé : le client voit l'adresse exacte
 *    vers laquelle il va. Pour trois e-mails de suivi, c'est suffisant.
 */

const POINT_DE_TERMINAISON = "https://api.resend.com/emails";
const BORNE_ENVOI_MS = 10_000;

export interface MessageClient {
  readonly a: string;
  readonly sujet: string;
  readonly texte: string;
  /** L'adresse HTTPS qui désinscrit en un clic (POST sans corps, RFC 8058). */
  readonly desinscription?: string;
}

export type EnvoiClient =
  | { readonly statut: "envoye" }
  | { readonly statut: "non_configure" }
  | {
      readonly statut: "refuse";
      readonly motif: string;
      /**
       * `message` : CE message est rejeté (HTTP 400/422 — adresse, contenu) ; le
       * destinataire suivant peut partir. `fournisseur` : clé, domaine, quota,
       * panne ou réseau — le suivant échouerait pareil.
       */
      readonly portee: "message" | "fournisseur";
    };

export async function envoyerAuClient(message: MessageClient, sous?: typeof fetch): Promise<EnvoiClient> {
  const config = lireConfigEmailClient();
  if ("manquant" in config) return { statut: "non_configure" };

  const enTetes: Record<string, string> =
    message.desinscription === undefined
      ? {}
      : {
          "List-Unsubscribe": `<${message.desinscription}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        };

  try {
    const reponse = await fetchBorne(BORNE_ENVOI_MS, sous)(POINT_DE_TERMINAISON, {
      method: "POST",
      headers: { authorization: `Bearer ${config.cle}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.expediteur,
        to: [message.a],
        subject: message.sujet,
        text: message.texte,
        headers: enTetes,
      }),
    });
    if (!reponse.ok) {
      // Le corps de la réponse n'est PAS journalisé : il peut citer l'adresse du
      // client, qui n'a rien à faire dans nos journaux.
      const portee = reponse.status === 400 || reponse.status === 422 ? "message" : "fournisseur";
      return { statut: "refuse", motif: "HTTP " + String(reponse.status), portee };
    }
    return { statut: "envoye" };
  } catch (erreur) {
    return { statut: "refuse", motif: erreur instanceof Error ? erreur.name : "inconnu", portee: "fournisseur" };
  }
}
