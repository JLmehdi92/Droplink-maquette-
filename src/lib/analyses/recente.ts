import "server-only";
import { z } from "zod";
import { lectureIllisible } from "@/lib/reseau/panne";
import { TYPES_EVENEMENT, type TypeEvenement } from "@/lib/commandes/journal";
import { referenceCourte } from "@/lib/commandes/reference";
import { debutPeriode, type ClientLecture, type Periode } from "./activite";

/**
 * L'ACTIVITÉ RÉCENTE — le troisième panneau de la dernière rangée du kit.
 *
 * Il montre les cinq derniers faits enregistrés sur les commandes du vendeur,
 * chacun avec la commande qu'il concerne et son ancienneté.
 *
 * ⚠️ IL NE LIT QUE `order_events`, ET C'EST CE QUI LE REND HONNÊTE. Le kit y
 * écrit « Colis livré », « Colis en transit », « Nouveau lien ouvert » — des
 * faits que l'INGESTION DU SUIVI produirait. Elle n'écrit aucun événement :
 * la table porte dix types, tous émis par une mutation du vendeur ou une
 * réponse de son client. Les inventer ici afficherait un journal que la base
 * n'a pas tenu, sur l'écran qui sert précisément à décider.
 *
 * ⚠️ LECTURE SOUS LA SESSION DU VENDEUR, jamais en service-role. La policy de
 * `order_events` remonte à `orders → shops → profiles` : c'est elle qui
 * garantit qu'on ne lit que ses propres commandes. La contourner ici en ferait
 * la seconde surface du produit où l'historique d'un tiers serait atteignable.
 */

/** Cinq lignes, comme le kit. C'est un aperçu, pas un journal. */
export const ACTIVITE_RECENTE = 5;

export interface FaitRecent {
  readonly id: string;
  readonly type: TypeEvenement;
  /** L'instant ISO, formaté par l'écran : le formateur pèse plus que la chaîne. */
  readonly quand: string;
  /** La référence courte de la commande concernée, telle que l'écran l'affiche. */
  readonly reference: string;
  /** L'identifiant, pour que la ligne mène à la commande. */
  readonly commandeId: string;
}

/**
 * Le type d'événement, validé contre la liste du contrat.
 *
 * Un type inconnu est ÉCARTÉ plutôt que rendu par sa clé : une clé brute à
 * l'écran est une chaîne en dur déguisée, et c'est ainsi que `qc_status`
 * s'était retrouvé en toutes lettres dans l'historique de l'éditeur.
 */
const Type = z.enum(TYPES_EVENEMENT);

export async function lireActiviteRecente(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
  limite: number = ACTIVITE_RECENTE,
): Promise<readonly FaitRecent[] | null> {
  const { data, error } = await supabase
    .from("order_events")
    .select("id, type, occurred_at, order_id")
    .gte("occurred_at", debutPeriode(periode, maintenant).toISOString())
    /* Le tri secondaire n'est pas décoratif : à égalité d'instant — deux
       mutations d'un même lot — l'ordre serait celui que la base renvoie,
       c'est-à-dire aucun, et le panneau changerait à chaque rafraîchissement. */
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite);

  if (lectureIllisible({ error }, "de l'activité récente")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture de l'activité récente impossible : " + (error?.message ?? "vide"));
  }

  return data.flatMap((l) => {
    const type = Type.safeParse(l.type);
    if (!type.success) return [];
    return [
      {
        id: l.id,
        type: type.data,
        quand: l.occurred_at,
        reference: referenceCourte(l.order_id),
        commandeId: l.order_id,
      },
    ];
  });
}
