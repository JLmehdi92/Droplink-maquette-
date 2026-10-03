import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/suspension";
import { MOTIF_MAX, MOTIF_MIN } from "@/lib/audit/suspension";
import { exigerCleCanonique } from "@/lib/storage/cles";
import { signerLecture } from "@/lib/storage/r2";

/**
 * LA CONTESTATION D'UN LIEN BLOQUÉ, CÔTÉ ADMINISTRATION — migration 168.
 *
 * L'administrateur ne voit pas la commande (décision 9). Il voit ce que le vendeur lui ENVOIE
 * pour contester le blocage : son explication, et l'image qu'il a choisi de joindre. Chaque
 * lecture est écrite au journal par la fonction en base AVANT de rendre quoi que ce soit.
 *
 * Deux réponses possibles : débloquer (`debloquerLienCommande`, qui clôt la contestation en
 * « acceptée » et fait lire son motif au vendeur) ou refuser (ici), avec une réponse obligatoire.
 */

export type ContestationAdmin = {
  readonly id: string;
  readonly message: string;
  /** L'image signée pour l'affichage, `null` sans image jointe. */
  readonly imageUrl: string | null;
  readonly creeeLe: string;
  /** 1, 2 ou 3 : la combientième contestation de ce blocage. */
  readonly rang: number;
};

export type ResultatLecture =
  | { readonly statut: "ok"; readonly contestation: ContestationAdmin }
  | { readonly statut: "erreur"; readonly motif: "introuvable" | "lecture" };

/** Lit la contestation en attente d'une commande. La lecture est TRACÉE en base. */
export async function lireContestationAdmin(
  supabase: ClientAdmin,
  commandeId: string,
  empreinteIp: string,
): Promise<ResultatLecture> {
  if (!z.string().uuid().safeParse(commandeId).success) return { statut: "erreur", motif: "introuvable" };

  const { data, error } = await supabase.rpc("lire_contestation_admin", {
    p_commande: commandeId,
    p_ip_hash: empreinteIp,
  });
  if (error !== null) return { statut: "erreur", motif: error.code === "DL031" ? "introuvable" : "lecture" };
  const ligne = Array.isArray(data) ? data[0] : undefined;
  if (ligne === undefined) return { statut: "erreur", motif: "introuvable" };

  return {
    statut: "ok",
    contestation: {
      id: ligne.id,
      message: ligne.message,
      imageUrl: ligne.image_key === null ? null : await signerLecture(exigerCleCanonique(ligne.image_key)),
      creeeLe: ligne.created_at,
      rang: ligne.rang,
    },
  };
}

/** Parmi des commandes qu'elle affiche déjà, celles dont une contestation attend. Rien n'est tracé. */
export async function contestationsEnAttenteParmi(
  supabase: ClientAdmin,
  commandes: readonly string[],
): Promise<{ readonly statut: "ok"; readonly ids: ReadonlySet<string> } | { readonly statut: "erreur" }> {
  if (commandes.length === 0) return { statut: "ok", ids: new Set() };
  const { data, error } = await supabase.rpc("contestations_en_attente_parmi", { p_commandes: [...commandes] });
  if (error !== null || !Array.isArray(data)) {
    // Sans trace, aucune ligne ne montrerait plus la pastille « Contestation » (audit du
    // 20/09/2026) : un vendeur attendrait une réponse que personne ne saurait devoir donner.
    console.error(
      "[admin] contestations en attente illisibles : " + (error?.message ?? "réponse non tabulaire"),
    );
    return { statut: "erreur" };
  }
  return { statut: "ok", ids: new Set(data.filter((v): v is string => typeof v === "string")) };
}

/**
 * L'ALERTE DE LA VUE D'ENSEMBLE (migration 213, décision de Mehdi du 03/10/2026) : combien de
 * contestations attendent, et la plus ancienne — sa référence courte et sa date d'envoi. Des
 * nombres et une référence, aucun contenu : rien n'est tracé.
 *
 * TROIS ÉTATS, jamais deux : « aucune » n'est pas « illisible ». Une lecture en panne qui se
 * tairait comme une file vide laisserait un vendeur attendre une réponse que personne ne
 * saurait devoir donner (contrainte n° 8).
 */
export type AlerteContestations =
  | { readonly statut: "ok"; readonly nombre: number; readonly reference: string; readonly envoyeeLe: string }
  | { readonly statut: "aucune" }
  | { readonly statut: "illisible" };

const LigneAlerte = z.object({
  en_attente: z.coerce.number().int().nonnegative(),
  plus_ancienne_ref: z.string().nullable(),
  plus_ancienne_le: z.string().nullable(),
});

export async function lireAlerteContestations(supabase: ClientAdmin): Promise<AlerteContestations> {
  const { data, error } = await supabase.rpc("compter_contestations_en_attente_admin");
  const ligne = error === null && Array.isArray(data) ? LigneAlerte.safeParse(data[0]) : null;
  if (ligne === null || !ligne.success) {
    console.error(
      "[admin] alerte des contestations illisible : " + (error?.message ?? "réponse hors forme"),
    );
    return { statut: "illisible" };
  }
  const { en_attente: nombre, plus_ancienne_ref: reference, plus_ancienne_le: envoyeeLe } = ligne.data;
  if (nombre === 0) return { statut: "aucune" };
  // Un nombre sans sa plus ancienne contredirait la base : on le dit illisible plutôt que
  // d'inventer une référence.
  if (reference === null || envoyeeLe === null) return { statut: "illisible" };
  return { statut: "ok", nombre, reference, envoyeeLe };
}

/** Même plancher que le motif d'un blocage : c'est ce que le vendeur lira. */
export const DemandeRefus = z.object({
  contestationId: z.string().uuid(),
  reponse: z.string().trim().min(MOTIF_MIN).max(Math.min(MOTIF_MAX, 1000)),
});

export type DemandeRefus = z.infer<typeof DemandeRefus>;

export type ResultatRefus =
  | { readonly statut: "ok" }
  | { readonly statut: "erreur"; readonly motif: "saisie" | "deja" | "introuvable" | "ecriture" };

/** Refuse la contestation : le lien reste bloqué, et le vendeur lit la réponse. */
export async function refuserContestation(
  supabase: ClientAdmin,
  demande: DemandeRefus,
  empreinteIp: string,
): Promise<ResultatRefus> {
  const analyse = DemandeRefus.safeParse(demande);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const { error } = await supabase.rpc("refuser_contestation", {
    p_contestation: analyse.data.contestationId,
    p_reponse: analyse.data.reponse,
    p_ip_hash: empreinteIp,
  });
  if (error === null) return { statut: "ok" };
  switch (error.code) {
    case "DL032":
    case "DL066":
      return { statut: "erreur", motif: "saisie" };
    case "DL057":
      return { statut: "erreur", motif: "deja" };
    case "DL031":
      return { statut: "erreur", motif: "introuvable" };
    default:
      return { statut: "erreur", motif: "ecriture" };
  }
}
