"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { lireProfilVendeur } from "@/lib/comptes/profil";
import { creerClientServeur } from "@/lib/supabase/server";
import {
  contester,
  preparerImageContestation,
  type PreparationImage,
  type ResultatContestation,
} from "./contestation";

/**
 * Points d'entrée de la contestation d'un lien bloqué, depuis le navigateur (migration 168).
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE, comme les médias : une Server Action est atteignable par
 * une requête forgée qui n'a jamais affiché la page. Le travail vit dans `contestation.ts`, en
 * `server-only` ; ce module ne contient que des points d'entrée.
 */

type Refus = { readonly statut: "erreur"; readonly motif: "session" };
const REFUS: Refus = { statut: "erreur", motif: "session" };

async function contexte() {
  const profil = await lireProfilVendeur();
  if (profil === null || profil.statut !== "active") return null;
  const supabase = await creerClientServeur();
  return { supabase, profilId: profil.profilId, shopId: profil.shopId };
}

const DemandeImage = z.object({
  commandeId: z.string().uuid(),
  typeMime: z.string().max(100),
  tailleOctets: z.number().int().positive(),
});

export async function demanderImageContestation(entree: unknown): Promise<PreparationImage | Refus> {
  const c = await contexte();
  if (c === null) return REFUS;
  const analyse = DemandeImage.safeParse(entree);
  if (!analyse.success) return { statut: "erreur", motif: "type" };
  return preparerImageContestation(
    c.supabase,
    { profilId: c.profilId, shopId: c.shopId },
    analyse.data.commandeId,
    analyse.data.typeMime,
    analyse.data.tailleOctets,
  );
}

export async function envoyerContestation(entree: unknown): Promise<ResultatContestation | Refus> {
  const c = await contexte();
  if (c === null) return REFUS;
  const analyse = z
    .object({ commandeId: z.string().uuid(), message: z.string().max(4000), cleImage: z.string().max(300).nullable() })
    .safeParse(entree);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };
  const resultat = await contester(c.supabase, c.shopId, analyse.data);
  // L'écran relit l'état EN BASE : la contestation n'est affichée qu'une fois enregistrée.
  if (resultat.statut === "ok") revalidatePath("/[locale]/commandes/[id]", "page");
  return resultat;
}
