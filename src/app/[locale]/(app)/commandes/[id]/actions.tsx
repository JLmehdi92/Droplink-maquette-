"use server";

import type { ReactNode } from "react";
import { z } from "zod";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import { lireHistorique } from "@/lib/commandes/historique";
import { HistoriqueCommande } from "@/components/commandes/historique-commande";

/**
 * RELIRE L'HISTORIQUE D'UNE COMMANDE, et lui seul (audit de fidélité du 03/10/2026).
 *
 * L'historique de la fiche n'était jamais relu après une sauvegarde. Le relire par
 * `router.refresh()` réexécutait TOUTE la page — lectures, signatures des médias, et
 * l'événement `order_editor_opened`, dont chaque rafraîchissement comptait une ouverture
 * de plus (relecture du lot 4) — et passait dans la même file que les sauvegardes.
 * Cette action ne fait qu'une lecture, SOUS LA SESSION du vendeur (la policy de
 * `order_events` remonte à sa boutique), et rend le bloc déjà formaté par le serveur,
 * dans la langue et le fuseau de la page.
 *
 * `null` quand rien n'est à montrer de neuf : session absente, identifiant invalide, ou
 * lecture vide — une commande a toujours au moins sa création, et un historique vide
 * après une écriture serait une lecture échouée qu'on n'affiche pas par-dessus l'ancien.
 *
 * `plusRecent` (contre-audit du 03/10/2026) : le bloc rendu est opaque pour le client ;
 * l'identifiant de sa ligne la plus récente lui dit si la ligne attendue est arrivée
 * (`relireJusquaNouveau`), le journal s'écrivant après la réponse.
 */
export async function relireHistorique(
  commandeId: unknown,
): Promise<{ readonly bloc: ReactNode; readonly plusRecent: string } | null> {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return null;
  const id = z.string().uuid().safeParse(commandeId);
  if (!id.success) return null;
  const supabase = await creerClientServeur();
  const lignes = await lireHistorique(supabase, id.data);
  const plusRecent = lignes[0]?.id;
  if (plusRecent === undefined) return null;
  return { bloc: <HistoriqueCommande lignes={lignes} />, plusRecent };
}
