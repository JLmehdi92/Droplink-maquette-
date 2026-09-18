import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { ETAPES, type Etape } from "@/lib/tracking/normalize";

/**
 * LE SUIVI D'UNE COMMANDE, VU PAR SON VENDEUR.
 *
 * ⚠️ POURQUOI CETTE LECTURE EXISTE, ALORS QUE `lireSuiviPublic` LIT LA MÊME
 * CHOSE. Celle-là passe par `lire_suivi_public`, une fonction `security definer`
 * appelée avec le CLIENT ANONYME : elle n'exige rien d'autre que le jeton.
 * L'employer ici mettrait `anon.ts` sur une surface authentifiée, où la règle du
 * projet réserve ce client à la page publique — et surtout, elle ferait dépendre
 * un écran vendeur d'un chemin dont la garde est un jeton, pas une session.
 * Celle-ci lit SOUS RLS, avec la session : la policy « vendeur lit les points de
 * passage de ses colis » remonte à `orders → shops → profiles`.
 *
 * ⚠️ ET L'ÉTAPE N'EN SORT PAS. Elle vit sur `orders.status`, que le colis met à
 * jour (migration 090) et que le vendeur amorce avant la remise au transporteur
 * (décision 2). La lire ici produirait une SECONDE source pour la position du
 * colis, et deux sources finissent par diverger le jour où l'une des deux
 * écritures échoue. Ce module ne rend que ce que le colis SEUL connaît : son
 * numéro, la date de son dernier mouvement, et ses points de passage.
 */
export interface PassageCommande {
  readonly instant: string;
  readonly lieu: string | null;
  readonly description: string;
  readonly etape: Etape | null;
}

export interface SuiviDeLaCommande {
  readonly numero: string;
  /**
   * Le code TRANSPORTEUR du fournisseur de suivi, ou `null`.
   *
   * ⚠️ IL EST LU PARCE QU'IL EST TRADUISIBLE, et deux ecrans ont longtemps
   * affirme le contraire. `carrier_code` est un identifiant numerique — 3011,
   * 100003 — et l on en concluait qu il n apprenait rien a personne ; la
   * correspondance existe, 17TRACK la publie, et elle est figee dans le depot
   * (`lib/tracking/transporteurs.json`). C est `lireTransporteur` qui la lit,
   * cote serveur : ce module ne rend que le code, il n a pas a connaitre le
   * catalogue.
   */
  readonly codeTransporteur: number | null;
  readonly dernierMouvement: string | null;
  readonly abandonne: boolean;
  /**
   * Abandonné SANS avoir jamais été pris en charge : le fournisseur a refusé le
   * numéro (transporteur indétectable). Ce n'est pas « le transporteur s'est
   * tu » — c'est « précisez-le », et c'est le seul cas où le vendeur a un geste
   * qui répare (migration 164).
   */
  readonly nonReconnu: boolean;
  readonly passages: readonly PassageCommande[];
}

/**
 * La date à laquelle CHAQUE étape a été atteinte, quand un point de passage le
 * dit. Un colis franchit une étape UNE fois : c'est le passage le PLUS ANCIEN
 * portant cette étape qui la date, pas le plus récent — sinon un second scan
 * « en transit » déplacerait dans le temps une étape déjà franchie.
 */
export function datesDesEtapes(
  passages: readonly PassageCommande[],
): Readonly<Partial<Record<Etape, string>>> {
  const dates: Partial<Record<Etape, string>> = {};
  for (const p of passages) {
    if (p.etape === null) continue;
    const connue = dates[p.etape];
    if (connue === undefined || p.instant < connue) dates[p.etape] = p.instant;
  }
  return dates;
}

const estEtape = (v: string | null): v is Etape =>
  v !== null && (ETAPES as readonly string[]).includes(v);

export async function lireSuiviDeCommande(
  supabase: SupabaseClient<Database>,
  orderId: string,
): Promise<SuiviDeLaCommande | null> {
  const { data: attaches } = await supabase
    .from("order_parcels")
    .select("parcel_id, tracked_parcels(tracking_number, carrier_code, last_movement_at, abandoned_at, registered_at)")
    .eq("order_id", orderId)
    .limit(1);

  const attache = attaches?.[0];
  if (attache === undefined || attache.tracked_parcels === null) return null;

  const colis = attache.tracked_parcels;

  /*
   * TRENTE PASSAGES AU PLUS, LES PLUS RÉCENTS — le même plafond que la page
   * publique. Un colis bloqué peut en accumuler des dizaines, et la frise n'en
   * lit que quatre dates : le reste ne sert qu'à la liste détaillée.
   */
  const { data: points } = await supabase
    .from("parcel_checkpoints")
    .select("occurred_at, location, description, stage")
    .eq("parcel_id", attache.parcel_id)
    .order("occurred_at", { ascending: false })
    .limit(30);

  return {
    numero: colis.tracking_number,
    codeTransporteur: colis.carrier_code,
    dernierMouvement: colis.last_movement_at,
    abandonne: colis.abandoned_at !== null,
    nonReconnu: colis.abandoned_at !== null && colis.registered_at === null,
    passages: (points ?? []).map((p) => ({
      instant: p.occurred_at,
      lieu: p.location,
      description: p.description,
      etape: estEtape(p.stage) ? p.stage : null,
    })),
  };
}
