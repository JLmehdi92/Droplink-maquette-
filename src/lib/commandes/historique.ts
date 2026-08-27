import "server-only";
import { z } from "zod";
import { TYPES_EVENEMENT, type TypeEvenement } from "./journal";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * L'HISTORIQUE D'UNE COMMANDE, tel que l'éditeur le rend.
 *
 * `order_events` était REMPLIE ET JAMAIS LUE : dix types d'événements écrits à
 * chaque mutation, une policy de lecture posée pour le vendeur, et aucun écran
 * pour les montrer. Le brief la demande pourtant nommément — « qui a modifié
 * quoi, quand le client a ouvert le lien ».
 *
 * Une table qu'on écrit sans jamais la lire est pire qu'une table absente : elle
 * coûte à chaque mutation, elle grossit, et sa seule justification — pouvoir
 * répondre à « que s'est-il passé sur cette commande » — n'est jamais rendue.
 *
 * ⚠️ LECTURE SOUS LA SESSION DU VENDEUR, jamais en service-role. La policy de
 * `order_events` remonte à `orders → shops → profiles` : c'est elle qui garantit
 * qu'on ne lit que ses propres commandes, et la contourner ici en ferait la
 * seule surface du produit où l'historique d'un tiers serait atteignable.
 */

/** Ce qu'une ligne d'historique rend à l'écran. */
export interface LigneHistorique {
  readonly id: string;
  readonly type: TypeEvenement;
  readonly quand: string;
  /**
   * Le détail affichable, déjà réduit à des valeurs simples.
   *
   * La charge brute n'est PAS rendue telle quelle : elle peut porter demain une
   * clé qu'on n'aura pas décidé d'afficher — c'est exactement ainsi qu'une note
   * interne ou un jeton finit sur un écran. On n'extrait que ce qui est nommé.
   */
  readonly detail: string | null;
}

/**
 * Plafond de lignes.
 *
 * Une commande très éditée porte des centaines d'entrées `commande_modifiee` —
 * la sauvegarde automatique en écrit une par champ temporisé. Les rendre toutes
 * ferait payer à l'écran le plus utilisé une liste que personne ne déroule.
 */
export const PLAFOND_HISTORIQUE = 30;

/** Les clés de charge utile qu'on accepte d'afficher, et rien d'autre. */
const Charge = z.object({
  champ: z.string().max(40).optional(),
  nombre: z.number().int().optional(),
  lot: z.number().int().optional(),
});

/**
 * Réduit une charge utile à une phrase courte, ou à rien.
 *
 * PURE ET EXPORTÉE : elle est éprouvable sans base ni composant. C'est aussi ce
 * qui permet de vérifier qu'une clé inattendue est IGNORÉE plutôt que rendue.
 */
export function resumerCharge(brut: unknown): string | null {
  const analyse = Charge.safeParse(brut);
  if (!analyse.success) return null;
  const { champ, nombre, lot } = analyse.data;
  if (champ !== undefined && champ !== "") return champ;
  if (nombre !== undefined) return String(nombre);
  if (lot !== undefined) return String(lot);
  return null;
}

/**
 * Le client injecté.
 *
 * On réemploie le type du client à session plutôt qu'une interface écrite à la
 * main : la version manuscrite faisait exploser l'inférence de PostgREST
 * (« type instantiation is excessively deep »), et surtout elle acceptait
 * n'importe quoi qui en porte la forme — y compris le client service-role,
 * c'est-à-dire exactement ce qu'on ne veut pas voir ici.
 */
export type ClientHistorique = Awaited<ReturnType<typeof creerClientServeur>>;

export async function lireHistorique(
  supabase: ClientHistorique,
  commandeId: string,
): Promise<readonly LigneHistorique[]> {
  const { data, error } = await supabase
    .from("order_events")
    .select("id, type, occurred_at, payload")
    .eq("order_id", commandeId)
    .order("occurred_at", { ascending: false })
    .limit(PLAFOND_HISTORIQUE);

  if (error !== null || data === null) {
    // Pas de `catch` muet, mais pas d'écran cassé non plus : l'historique est un
    // complément. Un échec de lecture ne doit pas emporter l'éditeur avec lui.
    console.error("[historique] lecture impossible :", error?.message ?? "réponse vide");
    return [];
  }

  const connus = new Set<string>(TYPES_EVENEMENT);
  return data
    // UN TYPE INCONNU N'EST PAS RENDU. Une valeur écrite par une version future,
    // ou par une main directe en base, n'a pas de libellé traduit : l'afficher
    // rendrait sa clé brute à l'écran, ce qui est une chaîne en dur déguisée.
    .filter((l) => connus.has(l.type))
    .map((l) => ({
      id: l.id,
      type: l.type as TypeEvenement,
      quand: l.occurred_at,
      detail: resumerCharge(l.payload),
    }));
}
