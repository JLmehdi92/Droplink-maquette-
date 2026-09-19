import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/suspension";
import { MOTIF_MAX, MOTIF_MIN } from "@/lib/audit/suspension";

/**
 * BLOQUER ET DÉBLOQUER LE LIEN D'UNE COMMANDE — décision de Wassim, 19/09/2026.
 *
 * L'administrateur ne voit pas la commande, mais peut couper sa page publique « si
 * y'a une galère ». Le lien reste le même : débloquer le rétablit tel que le client
 * l'a reçu (contrainte 5, le public_token ne change jamais).
 *
 * Même architecture que la suspension (`suspension.ts`) : le travail vit ici, en
 * `server-only`, et TOUT passe par la fonction en base, qui vérifie le rôle, exige un
 * motif, écrit l'audit AVANT la mutation, dans une seule transaction. La colonne
 * `admin_blocked_at` n'est accordée en écriture à personne.
 */

/** Même plancher et même plafond que le motif de suspension : ce qu'on relira dans six mois. */
export const DemandeBlocage = z.object({
  commandeId: z.string().uuid(),
  motif: z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX),
});

export type DemandeBlocage = z.infer<typeof DemandeBlocage>;

export type ResultatBlocage =
  | { statut: "ok" }
  | { statut: "erreur"; motif: "saisie" | "deja" | "introuvable" | "ecriture" };

/** Le code d'erreur fait partie du contrat : on ne devine jamais la cause dans un message. */
function causeDeLErreur(code: string | undefined): ResultatBlocage {
  switch (code) {
    case "DL032":
      return { statut: "erreur", motif: "saisie" };
    case "DL057":
      return { statut: "erreur", motif: "deja" };
    case "DL031":
      return { statut: "erreur", motif: "introuvable" };
    default:
      return { statut: "erreur", motif: "ecriture" };
  }
}

async function basculer(
  fonction: "bloquer_lien_commande" | "debloquer_lien_commande",
  supabase: ClientAdmin,
  demande: DemandeBlocage,
  empreinteIp: string,
): Promise<ResultatBlocage> {
  // Zod même sur un argument typé : un type disparaît à la compilation, et la base ne
  // refuse que le motif VIDE — « ok » passerait.
  const analyse = DemandeBlocage.safeParse(demande);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const { error } = await supabase.rpc(fonction, {
    p_commande: analyse.data.commandeId,
    p_motif: analyse.data.motif,
    p_ip_hash: empreinteIp,
  });
  if (error !== null) return causeDeLErreur(error.code);
  return { statut: "ok" };
}

/** Coupe la page publique de la commande. Pas de recopie de confirmation : le geste est réversible. */
export async function bloquerLienCommande(
  supabase: ClientAdmin,
  demande: DemandeBlocage,
  empreinteIp: string,
): Promise<ResultatBlocage> {
  return basculer("bloquer_lien_commande", supabase, demande, empreinteIp);
}

/** Rétablit la page publique, SUR LE MÊME LIEN. Tracé comme le blocage. */
export async function debloquerLienCommande(
  supabase: ClientAdmin,
  demande: DemandeBlocage,
  empreinteIp: string,
): Promise<ResultatBlocage> {
  return basculer("debloquer_lien_commande", supabase, demande, empreinteIp);
}

/**
 * Parmi les commandes d'une page de la liste d'administration, celles dont le lien est
 * bloqué. En cas d'erreur, l'appelant ne doit RIEN affirmer : ni « bloqué », ni
 * « actif » (contrainte 8).
 */
export async function liensBloquesParmi(
  supabase: ClientAdmin,
  commandes: readonly string[],
): Promise<{ statut: "ok"; bloques: ReadonlySet<string> } | { statut: "erreur" }> {
  if (commandes.length === 0) return { statut: "ok", bloques: new Set() };
  const { data, error } = await supabase.rpc("liens_bloques_parmi", { p_commandes: [...commandes] });
  if (error !== null || !Array.isArray(data)) return { statut: "erreur" };
  return { statut: "ok", bloques: new Set(data.map(String)) };
}
