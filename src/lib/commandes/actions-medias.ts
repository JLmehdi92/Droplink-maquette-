"use server";

import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import {
  confirmerDepot,
  preparerDepot,
  preparerDepotVignette,
  reordonnerMedias,
  supprimerMedia,
  type ConfirmationDepot,
  type PreparationDepot,
} from "./medias";

/**
 * Points d'entrée des médias, depuis le navigateur.
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE. Le layout de `(app)` ne protège rien
 * ici : une Server Action est atteignable par une requête forgée qui n'a jamais
 * affiché la page. Et ce module ne contient QUE des points d'entrée — le travail
 * réel vit dans `medias.ts`, en `server-only`, parce que chaque export d'un
 * module `"use server"` est appelable depuis le dehors.
 */

type Refus = { readonly statut: "echec"; readonly motif: "session" };

const REFUS: Refus = { statut: "echec", motif: "session" };

async function contexte() {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return null;
  const supabase = await creerClientServeur();
  return { supabase, profilId: profil.profilId, shopId: profil.shopId };
}

export async function demanderDepot(entree: unknown): Promise<PreparationDepot | Refus> {
  const c = await contexte();
  if (c === null) return REFUS;
  return preparerDepot(c.supabase, c.profilId, c.shopId, entree);
}

export async function validerDepot(entree: unknown): Promise<ConfirmationDepot | Refus> {
  const c = await contexte();
  if (c === null) return REFUS;
  return confirmerDepot(c.supabase, c.profilId, c.shopId, entree);
}

export async function demanderDepotVignette(
  entree: unknown,
): Promise<
  | { statut: "ok"; url: string; enTetes: Record<string, string> }
  | { statut: "echec"; motif: string }
> {
  const c = await contexte();
  if (c === null) return REFUS;
  return preparerDepotVignette(c.supabase, c.shopId, entree);
}

export async function retirerMedia(
  orderId: string,
  mediaId: string,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: string }> {
  const c = await contexte();
  if (c === null) return REFUS;
  return supprimerMedia(c.supabase, orderId, mediaId);
}

export async function ordonnerMedias(
  orderId: string,
  ids: readonly string[],
): Promise<{ statut: "ok"; nombre: number } | { statut: "echec"; motif: string }> {
  const c = await contexte();
  if (c === null) return REFUS;
  return reordonnerMedias(c.supabase, orderId, ids);
}

/**
 * Désigne la photo de couverture.
 *
 * `cover_media_id` vit sur `orders`, pas sur `order_media` : la couverture est
 * une propriété de la COMMANDE, et une colonne booléenne sur chaque média
 * autoriserait deux couvertures — un état que rien n'interdirait et que l'écran
 * devrait deviner.
 *
 * Le média doit appartenir à la commande. Sans ce contrôle, la clé étrangère
 * accepterait le média d'un AUTRE vendeur : la contrainte dit « ce média
 * existe », pas « il est à vous ».
 */
export async function definirCouverture(
  orderId: string,
  mediaId: string | null,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: string }> {
  const c = await contexte();
  if (c === null) return REFUS;

  if (mediaId !== null) {
    const { data } = await c.supabase
      .from("order_media")
      .select("id")
      .eq("id", mediaId)
      .eq("order_id", orderId)
      .maybeSingle();
    if (data === null) return { statut: "echec", motif: "introuvable" };
  }

  const { data, error } = await c.supabase
    .from("orders")
    .update({ cover_media_id: mediaId })
    .eq("id", orderId)
    .select("id")
    .maybeSingle();

  if (error !== null || data === null) return { statut: "echec", motif: "ecriture" };
  return { statut: "ok" };
}
