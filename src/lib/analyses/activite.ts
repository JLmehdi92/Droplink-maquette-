import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * LES ANALYSES — ce que le vendeur apprend sur son propre usage.
 *
 * Il voit les mêmes chiffres que nous. Le livrable réel de la phase de
 * validation est la donnée d'usage, et un écran qui montrerait au vendeur autre
 * chose que ce qu'on regarde nous-mêmes serait une vitrine.
 *
 * LE CHIFFRE CENTRAL EST LE TAUX D'OUVERTURE. Un lien créé mais jamais ouvert
 * est un lien que le vendeur n'a pas envoyé, ou que son client n'a pas cliqué :
 * les deux sont des signaux, et les confondre avec un succès rendrait la mesure
 * inutilisable.
 */

export const PERIODES = ["7j", "30j", "tout"] as const;
export type Periode = (typeof PERIODES)[number];

export const ParametresAnalyses = z.object({
  periode: z.enum(PERIODES).catch("30j"),
});

export type ParametresAnalyses = z.infer<typeof ParametresAnalyses>;

export interface Activite {
  readonly commandesCreees: number;
  readonly commandesOuvertes: number;
  readonly vuesTotales: number;
  readonly qcApprouve: number;
  readonly qcRefuse: number;
  readonly qcEnAttente: number;
  readonly avecSuivi: number;
  readonly archivees: number;
}

/**
 * Le début de la période.
 *
 * « tout » est borné à l'époque Unix plutôt qu'à `null` : la fonction en base
 * prend un horodatage NON NUL, et une borne nulle aurait exigé un `or p_depuis
 * is null` dans son `where` — c'est-à-dire une condition que l'optimiseur ne
 * peut plus satisfaire par l'index sur `(shop_id, created_at)`. Le produit n'a
 * pas de commande antérieure à 1970.
 */
export function debutPeriode(periode: Periode, maintenant: Date): Date {
  switch (periode) {
    case "7j":
      return new Date(maintenant.getTime() - 7 * 86_400_000);
    case "30j":
      return new Date(maintenant.getTime() - 30 * 86_400_000);
    default:
      return new Date(0);
  }
}

/**
 * Le taux d'ouverture, en pourcentage entier.
 *
 * `null` QUAND IL N'Y A AUCUNE COMMANDE, jamais zéro. « 0 % » affirme que rien
 * n'a été ouvert, ce qui est une information ; l'absence de commande n'en est
 * pas une. Les deux se ressemblent à l'écran et se confondent dans un tableau de
 * suivi, or l'une appelle une action du vendeur et l'autre non.
 */
export function tauxOuverture(activite: Activite): number | null {
  if (activite.commandesCreees === 0) return null;
  return Math.round((activite.commandesOuvertes / activite.commandesCreees) * 100);
}

/**
 * Le nombre moyen de vues par commande ouverte.
 *
 * PAR COMMANDE OUVERTE, pas par commande créée : le brief fixe « vues de lien
 * par commande > 3 » comme signal que le destinataire REVIENT. Diviser par les
 * commandes créées mélangerait ce signal avec le taux d'ouverture, et un vendeur
 * dont tous les clients reviennent trois fois afficherait la même valeur qu'un
 * vendeur dont un tiers des liens n'est jamais ouvert.
 */
export function vuesParCommandeOuverte(activite: Activite): number | null {
  if (activite.commandesOuvertes === 0) return null;
  return Math.round((activite.vuesTotales / activite.commandesOuvertes) * 10) / 10;
}

export type ClientLecture = SupabaseClient<Database>;

export async function lireActivite(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
): Promise<Activite> {
  const { data, error } = await supabase.rpc("analyser_activite", {
    p_depuis: debutPeriode(periode, maintenant).toISOString(),
  });

  if (error !== null || data === null) {
    // Jamais de `catch` muet : un échec de lecture doit remonter. Afficher des
    // zéros à la place ferait croire à un vendeur actif qu'il n'a rien fait.
    throw new Error("lecture de l'activité impossible : " + (error?.message ?? "réponse vide"));
  }

  const l = Array.isArray(data) ? data[0] : null;
  if (l === undefined || l === null) {
    throw new Error("lecture de l'activité impossible : aucune ligne");
  }

  // `count()` rend un `bigint`, que le pilote transporte en chaîne au-delà de la
  // plage sûre. La conversion est explicite plutôt que laissée à une comparaison
  // plus loin, qui mélangerait les deux types sans le dire.
  return {
    commandesCreees: Number(l.commandes_creees),
    commandesOuvertes: Number(l.commandes_ouvertes),
    vuesTotales: Number(l.vues_totales),
    qcApprouve: Number(l.qc_approuve),
    qcRefuse: Number(l.qc_refuse),
    qcEnAttente: Number(l.qc_en_attente),
    avecSuivi: Number(l.avec_suivi),
    archivees: Number(l.archivees),
  };
}

export function analyserParametres(
  recherche: Record<string, string | string[] | undefined>,
): ParametresAnalyses {
  const v = recherche["periode"];
  return ParametresAnalyses.parse({ periode: Array.isArray(v) ? v[0] : v });
}
