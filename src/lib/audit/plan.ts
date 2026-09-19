import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/suspension";
import { MOTIF_MAX, MOTIF_MIN } from "@/lib/audit/suspension";

/**
 * LE PLAN D'UN COMPTE — décisions de Wassim, 19/09/2026 (migration 167).
 *
 * « Quand le client paye il est pro […] c'est à moi de mettre les gens pro » : AUCUN PAIEMENT ne
 * passe par le produit (contrainte n° 1). L'administration pose le plan à la main, motif à
 * l'appui — « paiement reçu le … » —, et c'est tracé comme une suspension.
 *
 * Tout passe par la fonction en base, qui vérifie le rôle, exige le motif, écrit l'audit AVANT la
 * mutation et, en repassant un compte en gratuit, fait retomber son interrupteur de marque.
 * `profiles.plan` n'est accordé en écriture à personne.
 */

export const PLANS = ["gratuit", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const DemandePlan = z.object({
  profilId: z.string().uuid(),
  plan: z.enum(PLANS),
  motif: z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX),
});

export type DemandePlan = z.infer<typeof DemandePlan>;

export type ResultatPlan =
  | { statut: "ok" }
  | { statut: "erreur"; motif: "saisie" | "deja" | "introuvable" | "ecriture" };

/** Le code d'erreur fait partie du contrat : on ne devine jamais la cause dans un message. */
function causeDeLErreur(code: string | undefined): ResultatPlan {
  switch (code) {
    case "DL032":
    case "DL060":
      return { statut: "erreur", motif: "saisie" };
    case "DL057":
      return { statut: "erreur", motif: "deja" };
    case "DL031":
      return { statut: "erreur", motif: "introuvable" };
    default:
      return { statut: "erreur", motif: "ecriture" };
  }
}

export async function definirPlanCompte(
  supabase: ClientAdmin,
  demande: DemandePlan,
  empreinteIp: string,
): Promise<ResultatPlan> {
  // Zod même sur un argument typé : la base ne refuse que le motif VIDE, « ok » passerait.
  const analyse = DemandePlan.safeParse(demande);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const { error } = await supabase.rpc("definir_plan_compte", {
    p_profil: analyse.data.profilId,
    p_plan: analyse.data.plan,
    p_motif: analyse.data.motif,
    p_ip_hash: empreinteIp,
  });
  if (error !== null) return causeDeLErreur(error.code);
  return { statut: "ok" };
}

/**
 * Le plan d'un compte, pour la fiche de l'administration. En cas d'erreur, l'écran ne doit RIEN
 * affirmer : ni « Gratuit » ni « Pro » (contrainte 8).
 */
export async function lirePlanCompte(
  supabase: ClientAdmin,
  profilId: string,
): Promise<{ statut: "ok"; plan: Plan } | { statut: "erreur" }> {
  const { data, error } = await supabase.rpc("lire_plan_compte", { p_profil: profilId });
  const plan = PLANS.find((p) => p === data);
  if (error !== null || plan === undefined) return { statut: "erreur" };
  return { statut: "ok", plan };
}
