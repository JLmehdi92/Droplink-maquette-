"use server";

import { z } from "zod";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import {
  confirmerDepot,
  preparerDepot,
  preparerDepotCouverture,
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
  return preparerDepotVignette(c.supabase, c.profilId, c.shopId, entree);
}

/**
 * Le dépôt de la COUVERTURE — la dérivée 900 px servie sur la page publique.
 *
 * Séparée du dépôt de la vignette parce que ce sont DEUX objets, avec deux
 * plafonds : 20 Ko pour une tuile de grille, 90 Ko pour l'image qui occupe la
 * plus grande surface de la page. Les faire passer par un seul appel aurait
 * obligé à choisir un plafond commun, donc à se tromper pour l'une des deux.
 */
export async function demanderDepotCouverture(
  entree: unknown,
): Promise<
  | { statut: "ok"; url: string; enTetes: Record<string, string> }
  | { statut: "echec"; motif: string }
> {
  const c = await contexte();
  if (c === null) return REFUS;
  return preparerDepotCouverture(c.supabase, c.profilId, c.shopId, entree);
}

export async function retirerMedia(
  orderId: unknown,
  mediaId: unknown,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: string }> {
  const c = await contexte();
  if (c === null) return REFUS;
  return supprimerMedia(c.supabase, orderId, mediaId);
}

export async function ordonnerMedias(
  orderId: unknown,
  ids: unknown,
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
  orderId: unknown,
  mediaId: unknown,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: string }> {
  const c = await contexte();
  if (c === null) return REFUS;

  // LES DEUX ARGUMENTS VIENNENT DU NAVIGATEUR. Ils partaient tels quels dans
  // `.eq()` : une valeur non textuelle produisait une erreur de syntaxe côté
  // base plutôt qu'un refus nommé, et `mediaId` pouvait valoir n'importe quoi
  // pourvu que ce ne soit pas exactement `null`. Le contrôle d'appartenance qui
  // suit reste la vraie garde — celui-ci ne fait que borner la FORME.
  const saisie = z
    .object({ orderId: z.string().uuid(), mediaId: z.string().uuid().nullable() })
    .safeParse({ orderId, mediaId: mediaId ?? null });
  if (!saisie.success) return { statut: "echec", motif: "introuvable" };
  const { orderId: commande, mediaId: media } = saisie.data;

  if (media !== null) {
    const { data } = await c.supabase
      .from("order_media")
      .select("id")
      .eq("id", media)
      .eq("order_id", commande)
      .maybeSingle();
    if (data === null) return { statut: "echec", motif: "introuvable" };
  }

  const { data, error } = await c.supabase
    .from("orders")
    .update({ cover_media_id: media })
    .eq("id", commande)
    .select("id")
    .maybeSingle();

  if (error !== null || data === null) return { statut: "echec", motif: "ecriture" };
  return { statut: "ok" };
}
