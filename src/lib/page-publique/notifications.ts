import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { estLangueSupportee, type Langue } from "@/i18n/config";
import { envoiClientConfigure } from "@/lib/email/config";
import { envoyerAuClient } from "@/lib/email/client-final";
import { lienPageClient } from "@/lib/liens/page-client";
import { JetonPublic } from "@/lib/page-publique/lecture";
import { creerClientSysteme } from "@/lib/supabase/system";

/**
 * LES E-MAILS DE SUIVI DU CLIENT FINAL — décision de Wassim du 23/09/2026.
 *
 * Le CLIENT donne son adresse sur sa page, la confirme depuis sa boîte, et reçoit
 * au plus trois e-mails : expédié, en transit, livré. La base tient les règles
 * (migration 188) ; ce module fabrique les jetons et les e-mails.
 *
 * IL VIT DANS `lib/page-publique/` parce que c'est une fonction de la page
 * client, et que la cloison ESLint y admet déjà le client système pour les
 * écritures d'un visiteur SANS COMPTE (comme le comptage de vue). La tâche
 * planifiée qui envoie les étapes est l'autre appelant, sans humain lui non plus.
 *
 * ⚠️ LE JETON DE CONFIRMATION NE PART QUE PAR E-MAIL. Il n'est jamais rendu à
 * celui qui fait la demande — sinon « double consentement » voudrait dire
 * « un seul clic de celui qui tape l'adresse », et n'importe qui abonnerait la
 * boîte de n'importe qui. La base n'en garde que l'empreinte SHA-256.
 *
 * ⚠️ LES LIENS D'E-MAIL OUVRENT UNE PAGE, ILS N'AGISSENT PAS. Les antivirus de
 * messagerie ouvrent les liens des e-mails reçus : un lien qui confirmerait à
 * l'ouverture serait confirmé par un robot. La page porte un bouton ; seul son
 * envoi agit.
 */

const Adresse = z.string().trim().toLowerCase().max(254).email();
const Demande = z.object({ email: z.unknown() });
const JetonEmail = z.string().regex(/^[A-Za-z0-9_-]{40,60}$/);

export type ResultatDemande =
  | { readonly statut: "envoye" }
  | { readonly statut: "invalide" }
  | { readonly statut: "introuvable" }
  | { readonly statut: "trop" }
  | { readonly statut: "indisponible" };

function empreinteDuJeton(jeton: string): string {
  return createHash("sha256").update(jeton, "utf8").digest("hex");
}

function langueDe(brute: string | null | undefined): Langue {
  return typeof brute === "string" && estLangueSupportee(brute) ? brute : "fr";
}

/** Le client demande à être prévenu. Rend un statut, JAMAIS le jeton. */
export async function demanderNotification(
  jetonPublic: string,
  corps: unknown,
  origine: string,
): Promise<ResultatDemande> {
  // La FORME d'abord, la configuration ensuite : une adresse invalide se dit
  // invalide même quand rien ne pourrait partir, et aucune de ces deux vérifications
  // ne touche la base.
  const jeton = JetonPublic.safeParse(jetonPublic);
  if (!jeton.success) return { statut: "introuvable" };
  const demande = Demande.safeParse(corps);
  const adresse = Adresse.safeParse(demande.success ? demande.data.email : undefined);
  if (!adresse.success) return { statut: "invalide" };
  if (!envoiClientConfigure()) return { statut: "indisponible" };

  const confirmation = randomBytes(32).toString("base64url");
  const { data, error } = await creerClientSysteme().rpc("demander_notification", {
    p_jeton_public: jeton.data,
    p_email: adresse.data,
    p_token_hash: empreinteDuJeton(confirmation),
  });
  if (error !== null) return { statut: error.code === "DL074" ? "trop" : "indisponible" };
  const ligne = data[0];
  if (ligne === undefined) return { statut: "introuvable" };

  const langue = langueDe(ligne.langue);
  const t = await getTranslations({ locale: langue, namespace: "notifications" });
  const boutique = ligne.nom_boutique?.trim() || t("boutiqueSansNom");
  const lien = `${origine}/${langue}/notification?action=confirmer&j=${confirmation}`;

  const envoi = await envoyerAuClient({
    a: adresse.data,
    sujet: t("confirmation.sujet", { boutique }),
    texte: t("confirmation.corps", { boutique, lien }),
  });
  if (envoi.statut !== "envoye") {
    console.error("[notifications] e-mail de confirmation non parti — " + (envoi.statut === "refuse" ? envoi.motif : envoi.statut));
    return { statut: "indisponible" };
  }
  return { statut: "envoye" };
}

/** Où postent les boutons de la page ouverte depuis un e-mail. */
export const CIBLES_NOTIFICATION = {
  confirmer: "/api/notification/confirmer",
  desinscrire: "/api/notification/desinscription",
} as const;

/**
 * LES CHAMPS QUE POSTENT CES BOUTONS, lus à UN SEUL endroit. La page les écrit,
 * les deux routes les lisent ici : l'inventaire des formulaires vérifie que tout
 * champ envoyé est bien lu, et un champ renommé d'un côté seulement rougit.
 */
export function lireFormulaireNotification(donnees: FormData | null): {
  readonly jeton: unknown;
  readonly langue: unknown;
  readonly depuisLaPage: boolean;
} {
  return {
    jeton: donnees?.get("j"),
    langue: donnees?.get("langue"),
    depuisLaPage: donnees?.get("retour") === "page",
  };
}

export type ResultatLien = { readonly statut: "ok"; readonly langue: Langue } | { readonly statut: "invalide" };

/** Le client confirme — depuis le BOUTON de la page, jamais à l'ouverture du lien. */
export async function confirmerNotification(jeton: unknown): Promise<ResultatLien> {
  const valide = JetonEmail.safeParse(jeton);
  if (!valide.success) return { statut: "invalide" };
  const { data, error } = await creerClientSysteme().rpc("confirmer_notification", {
    p_token_hash: empreinteDuJeton(valide.data),
  });
  const ligne = error === null ? data[0] : undefined;
  return ligne === undefined ? { statut: "invalide" } : { statut: "ok", langue: langueDe(ligne.langue) };
}

/** Le client se désinscrit — par le jeton de désinscription, jamais le jeton public. */
export async function desinscrireNotification(jeton: unknown): Promise<ResultatLien> {
  const valide = JetonPublic.safeParse(jeton);
  if (!valide.success) return { statut: "invalide" };
  const { data, error } = await creerClientSysteme().rpc("desabonner_notification", { p_jeton: valide.data });
  const ligne = error === null ? data[0] : undefined;
  return ligne === undefined ? { statut: "invalide" } : { statut: "ok", langue: langueDe(ligne.langue) };
}

export interface BilanEnvoi {
  readonly envoyes: number;
  readonly echoues: number;
}

/**
 * Envoie ce qui attend. Appelé par la tâche de suivi, après les colis.
 *
 * Chaque étape est RÉSERVÉE avant l'envoi et RENDUE s'il échoue : deux passages
 * concurrents n'envoient pas deux fois, et un envoi raté repart au suivant.
 * Sans configuration d'envoi, rien n'est réservé — rien n'est perdu.
 */
export async function envoyerNotificationsEnAttente(origine: string, limite = 50): Promise<BilanEnvoi> {
  if (!envoiClientConfigure()) return { envoyes: 0, echoues: 0 };
  const systeme = creerClientSysteme();
  const { data, error } = await systeme.rpc("notifications_a_envoyer", { p_limite: limite });
  if (error !== null) {
    console.error("[notifications] liste illisible — " + error.message);
    return { envoyes: 0, echoues: 0 };
  }

  let envoyes = 0;
  let echoues = 0;
  for (const ligne of data) {
    const { data: reservee } = await systeme.rpc("reserver_notification", {
      p_order: ligne.order_id,
      p_etape: ligne.etape,
    });
    if (reservee !== true) continue;

    const langue = langueDe(ligne.langue);
    const t = await getTranslations({ locale: langue, namespace: "notifications" });
    const boutique = ligne.nom_boutique?.trim() || t("boutiqueSansNom");
    const desinscription = `${origine}/api/notification/desinscription?j=${ligne.jeton_desinscription}`;
    const pageDesinscription = `${origine}/${langue}/notification?action=desinscrire&j=${ligne.jeton_desinscription}`;

    const envoi = await envoyerAuClient({
      a: ligne.email,
      sujet: t(`etape.sujet.${ligne.etape}`, { boutique }),
      texte: t("etape.corps", {
        boutique,
        phrase: t(`etape.phrase.${ligne.etape}`),
        // LE LIEN QUE LE VENDEUR ENVOIE, au nom de sa boutique s'il en a un — jamais
        // une seconde forme fabriquée ici (garde `lien-page-client`).
        lien: lienPageClient(origine, ligne.jeton_public, ligne.nom_de_lien),
        desinscription: pageDesinscription,
      }),
      desinscription,
    });

    if (envoi.statut === "envoye") {
      envoyes += 1;
      continue;
    }
    echoues += 1;
    await systeme.rpc("rendre_notification", { p_order: ligne.order_id, p_etape: ligne.etape });
    console.error("[notifications] e-mail d'étape non parti — " + (envoi.statut === "refuse" ? envoi.motif : envoi.statut));
    // Un refus du fournisseur (quota du jour, clé révoquée) ne s'arrangera pas
    // au destinataire suivant : on s'arrête, tout ce qui reste repartira.
    break;
  }
  return { envoyes, echoues };
}
