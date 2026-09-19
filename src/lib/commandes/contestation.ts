import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { verifierQuotaDepot } from "@/lib/limitation/quota";
import { cleContestation, exigerCleCanonique, typesAcceptes } from "@/lib/storage/cles";
import { limites } from "@/lib/storage/limites";
import { lireTaille, signerDepot, signerLecture, supprimer } from "@/lib/storage/r2";

/**
 * LE VENDEUR ET LE BLOCAGE DE SON LIEN — décision de Wassim, 19/09/2026 (migration 168).
 *
 * « Oui il doit le savoir » : le vendeur voit que l'administration a bloqué le lien d'une de ses
 * commandes, et il peut le CONTESTER — une explication obligatoire, une image facultative.
 *
 * La base tient toutes les règles (une en attente, trois par blocage, explication bornée, image
 * sous SA commande) : ce module les rend lisibles et porte ce que la base ne peut pas faire —
 * signer le dépôt de l'image et relire sa taille réelle chez R2.
 */

type Client = SupabaseClient<Database>;

export const EXPLICATION_MIN = 20;
export const EXPLICATION_MAX = 2000;

export type StatutContestation = "en_attente" | "refusee" | "acceptee";

export type ContestationVendeur = {
  readonly id: string;
  readonly statut: StatutContestation;
  readonly message: string;
  readonly creeeLe: string;
  readonly decideeLe: string | null;
  /** Ce que l'administration a répondu : le motif du refus, ou celui du déblocage. */
  readonly reponse: string | null;
  /** L'image jointe, signée pour l'affichage ; `null` sans image. */
  readonly imageUrl: string | null;
};

export type EtatBlocage =
  | { readonly bloque: false }
  | {
      readonly bloque: true;
      readonly depuis: string;
      /**
       * Pourquoi l'administration a bloqué (169) — « oui on montre la raison au vendeur ».
       * `null` seulement pour un blocage antérieur à la 169 dont le journal n'a pas gardé de motif.
       */
      readonly motif: string | null;
      /** Les contestations DE CE BLOCAGE, la plus récente d'abord. */
      readonly contestations: readonly ContestationVendeur[];
      /** Une nouvelle contestation est-elle possible (aucune en attente, moins de trois) ? */
      readonly peutContester: boolean;
      readonly restantes: number;
    };

export const PLAFOND_PAR_BLOCAGE = 3;

/**
 * L'état du blocage d'une commande, vu de son vendeur. Lu sous RLS avec sa session : une
 * commande qui n'est pas la sienne rend `null`.
 */
export async function lireEtatBlocage(supabase: Client, commandeId: string): Promise<EtatBlocage | null> {
  const { data: commande, error } = await supabase
    .from("orders")
    .select("id, admin_blocked_at, admin_block_reason")
    .eq("id", commandeId)
    .maybeSingle();
  if (error !== null) {
    // L'ÉCRAN SE TAIT, MAIS LE JOURNAL PARLE (audit du 20/09/2026). Rendre `null` évite
    // d'affirmer un état non lu (contrainte 8) ; sans trace, une lecture en échec pendant des
    // jours cacherait à un vendeur bloqué son bandeau ET le moyen de contester, et personne
    // ne pourrait le savoir.
    console.error("[commandes] état de blocage illisible : " + error.message);
    return null;
  }
  if (commande === null) return null;
  if (commande.admin_blocked_at === null) return { bloque: false };

  const { data: lignes, error: erreurContestations } = await supabase
    .from("link_contests")
    .select("id, status, message, created_at, decided_at, admin_response, image_key, blocked_at")
    .eq("order_id", commandeId)
    .eq("blocked_at", commande.admin_blocked_at)
    .order("created_at", { ascending: false });
  // Une lecture en échec ne doit pas faire croire qu'aucune contestation n'existe : le vendeur
  // en renverrait une, et la base la refuserait sans qu'il comprenne pourquoi (contrainte 8).
  if (erreurContestations !== null) {
    console.error("[commandes] contestations du blocage illisibles : " + erreurContestations.message);
    return null;
  }

  const contestations = await Promise.all(
    (lignes ?? []).map(async (l): Promise<ContestationVendeur> => ({
      id: l.id,
      statut: l.status,
      message: l.message,
      creeeLe: l.created_at,
      decideeLe: l.decided_at,
      reponse: l.admin_response,
      imageUrl: l.image_key === null ? null : await signerLecture(exigerCleCanonique(l.image_key)),
    })),
  );

  const enAttente = contestations.some((c) => c.statut === "en_attente");
  const restantes = Math.max(0, PLAFOND_PAR_BLOCAGE - contestations.length);
  return {
    bloque: true,
    depuis: commande.admin_blocked_at,
    motif: commande.admin_block_reason,
    contestations,
    peutContester: !enAttente && restantes > 0,
    restantes,
  };
}

export type PreparationImage =
  | { readonly statut: "pret"; readonly url: string; readonly cle: string; readonly enTetes: Record<string, string> }
  | { readonly statut: "erreur"; readonly motif: "type" | "taille" | "cadence" | "introuvable" };

/**
 * Signe le dépôt de l'image. La clé est générée ICI, sous la boutique et la commande de
 * l'appelant ; la commande doit lui appartenir ET être bloquée — on ne signe pas de dépôt pour
 * une contestation que la base refuserait.
 */
export async function preparerImageContestation(
  supabase: Client,
  appelant: { readonly profilId: string; readonly shopId: string },
  commandeId: string,
  typeMime: string,
  tailleOctets: number,
): Promise<PreparationImage> {
  const cadence = await verifierQuotaDepot(appelant.profilId);
  if (!cadence.autorise) return { statut: "erreur", motif: "cadence" };

  const normalise = typeMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!typesAcceptes("contestation").includes(normalise)) return { statut: "erreur", motif: "type" };
  if (!Number.isInteger(tailleOctets) || tailleOctets <= 0 || tailleOctets > limites().contestationOctets) {
    return { statut: "erreur", motif: "taille" };
  }

  const etat = await lireEtatBlocage(supabase, commandeId);
  if (etat === null || !etat.bloque || !etat.peutContester) return { statut: "erreur", motif: "introuvable" };

  const cle = cleContestation({
    shopId: appelant.shopId,
    orderId: commandeId,
    imageId: randomUUID(),
    typeMime: normalise,
  });
  const { url, enTetesObligatoires } = await signerDepot({ cle, typeMime: normalise, tailleOctets });
  return { statut: "pret", url, cle, enTetes: enTetesObligatoires };
}

export const DemandeContestation = z.object({
  commandeId: z.string().uuid(),
  message: z.string().trim().min(EXPLICATION_MIN).max(EXPLICATION_MAX),
  cleImage: z.string().min(1).max(300).nullable(),
});

export type DemandeContestation = z.infer<typeof DemandeContestation>;

export type ResultatContestation =
  | { readonly statut: "ok" }
  | {
      readonly statut: "erreur";
      readonly motif: "saisie" | "image" | "non-bloque" | "deja" | "plafond" | "introuvable" | "ecriture";
    };

/**
 * La clé revient du navigateur : elle doit avoir EXACTEMENT la forme d'une image de contestation
 * ET vivre sous la boutique et la commande de l'appelant — comparées par SEGMENT, jamais par
 * préfixe (le défaut du logo, 26/08/2026 : `…/../../medias/{victime}/…` passait un préfixe).
 */
export function cleContestationAppartient(cle: string, shopId: string, commandeId: string): boolean {
  try {
    exigerCleCanonique(cle);
  } catch {
    return false;
  }
  const segments = cle.split("/");
  return segments.length === 4 && segments[0] === "contestations" && segments[1] === shopId && segments[2] === commandeId;
}

function causeDeLErreur(code: string | undefined): ResultatContestation {
  switch (code) {
    case "DL064":
      return { statut: "erreur", motif: "saisie" };
    case "DL065":
      return { statut: "erreur", motif: "image" };
    case "DL061":
      return { statut: "erreur", motif: "non-bloque" };
    case "DL062":
      return { statut: "erreur", motif: "deja" };
    case "DL063":
      return { statut: "erreur", motif: "plafond" };
    case "DL031":
      return { statut: "erreur", motif: "introuvable" };
    default:
      return { statut: "erreur", motif: "ecriture" };
  }
}

/**
 * Envoie la contestation. L'image, si elle est jointe, est relue CHEZ R2 avant d'être acceptée :
 * absente, elle n'est jamais arrivée ; trop lourde, elle est supprimée plutôt que gardée.
 */
export async function contester(
  supabase: Client,
  shopId: string,
  demande: DemandeContestation,
): Promise<ResultatContestation> {
  const analyse = DemandeContestation.safeParse(demande);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };
  const { commandeId, message, cleImage } = analyse.data;

  if (cleImage !== null) {
    if (!cleContestationAppartient(cleImage, shopId, commandeId)) return { statut: "erreur", motif: "image" };
    const taille = await lireTaille(cleImage);
    if (taille === null) return { statut: "erreur", motif: "image" };
    if (taille > limites().contestationOctets) {
      await supprimer(cleImage);
      return { statut: "erreur", motif: "image" };
    }
  }

  const { error } = await supabase.rpc("contester_blocage", {
    p_commande: commandeId,
    p_message: message,
    // Le générateur de types déclare tout argument de fonction NON nul ; `p_image_key` accepte
    // pourtant `null` en SQL — c est « pas d image », que la fonction traite explicitement.
    p_image_key: cleImage as string,
  });
  if (error !== null) {
    // Refusée par la base : l'image déposée pour elle n'a plus de raison d'exister.
    if (cleImage !== null) await supprimer(cleImage);
    return causeDeLErreur(error.code);
  }
  return { statut: "ok" };
}
