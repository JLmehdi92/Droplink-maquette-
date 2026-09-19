"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigerAdmin } from "@/lib/audit/garde";
import { empreinteAdmin } from "@/lib/audit/empreinte-admin";
import {
  bloquerLienCommande,
  debloquerLienCommande,
  type ResultatBlocage,
} from "@/lib/audit/blocage-lien";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * BLOQUER ET DÉBLOQUER LE LIEN D'UNE COMMANDE — les actions (décision de Wassim,
 * 19/09/2026).
 *
 * CHAQUE ACTION PORTE SA PROPRE GARDE : une Server Action ne passe ni par le layout
 * d'administration ni par le middleware, c'est un point d'entrée à part entière.
 * Le travail réel vit dans `lib/audit/blocage-lien.ts`, en `server-only`.
 *
 * ⚠️ AUCUNE INVALIDATION DE LA PAGE PUBLIQUE ICI, ET C'EST UNE ABSENCE DE CACHE, PAS
 * UNE PROTECTION. La page publique lit les en-têtes de la requête (limitation de
 * débit), donc n'est pas mise en cache : le blocage y arrive à la requête suivante.
 * L'action ne connaît d'ailleurs pas le jeton — l'administrateur ne le voit pas.
 * `tests/unit/coupure-et-cache.test.ts` rougira ici comme pour la suspension le jour
 * où un cache apparaîtra sur la lecture publique.
 */

const Formulaire = z.object({
  commandeId: z.string().uuid(),
  motif: z.string().max(1_000),
});

export type EtatBlocage = { statut: "inactif" } | ResultatBlocage;

async function basculer(
  geste: typeof bloquerLienCommande,
  donnees: FormData,
): Promise<EtatBlocage> {
  await exigerAdmin();

  const analyse = Formulaire.safeParse({
    commandeId: donnees.get("commandeId"),
    motif: donnees.get("motif") ?? "",
  });
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const resultat = await geste(await creerClientServeur(), analyse.data, await empreinteAdmin());
  // Gabarit complet, jamais un mélange de gabarit et de valeur concrète : sinon
  // l'appel réussit et n'invalide rien (défaut trouvé sur la suspension).
  if (resultat.statut === "ok") revalidatePath("/[locale]/admin/commandes", "page");
  return resultat;
}

export async function bloquerLien(_precedent: EtatBlocage, donnees: FormData): Promise<EtatBlocage> {
  return basculer(bloquerLienCommande, donnees);
}

export async function debloquerLien(_precedent: EtatBlocage, donnees: FormData): Promise<EtatBlocage> {
  return basculer(debloquerLienCommande, donnees);
}
