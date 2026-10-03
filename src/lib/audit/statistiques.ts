import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/comptes";

/**
 * LES STATISTIQUES DE LA PLATEFORME — décision de Wassim du 14/09/2026.
 *
 * ELLES NE LISENT QUE DES NOMBRES : aucune ligne, aucun nom, aucun compte ne
 * sort des quatre fonctions de la migration 161. Compter n'est pas consulter —
 * donc pas d'audit, et c'est la même règle que l'anneau et la courbe de la vue
 * d'ensemble.
 *
 * ⚠️ LES TYPES GÉNÉRÉS DISENT `number` POUR CHAQUE COLONNE, Y COMPRIS CELLES QUI
 * SONT NULLES (un délai sans colis livré, un taux un jour sans commande).
 * Supabase ne lit pas la nullité d'une table de retour. Chaque ligne est donc
 * relue par Zod : un `null` affiché « 0 » affirmerait qu'on a mesuré.
 */

// Dans l'ordre de la maquette (`admin-statistiques.html`) : la fenêtre par défaut d'abord.
export const FENETRES_STATISTIQUES = ["30", "7", "90"] as const;
export type FenetreStatistiques = (typeof FENETRES_STATISTIQUES)[number];

export const VUES_STATISTIQUES = ["globale", "utilisation", "croissance", "commandes", "comptes"] as const;
export type VueStatistiques = (typeof VUES_STATISTIQUES)[number];

export const ParametresStatistiques = z.object({
  jours: z.enum(FENETRES_STATISTIQUES).catch("30"),
  vue: z.enum(VUES_STATISTIQUES).catch("globale"),
});

/** Un compte PostgREST : `bigint` arrive en nombre ou en texte selon sa taille. */
const Compte = z.union([z.number(), z.string()]).transform(Number);
const Mesure = z.union([z.number(), z.string()]).nullable().transform((v) => (v === null ? null : Number(v)));

const Indicateurs = z.object({
  commandes: Compte,
  commandes_avant: Compte,
  liens_consultes: Compte,
  liens_consultes_avant: Compte,
  photos: Compte,
  photos_avant: Compte,
  comptes_actifs: Compte,
  comptes_actifs_avant: Compte,
  comptes: Compte,
  fournisseurs: Compte,
  revendeurs: Compte,
  nouveaux_comptes: Compte,
  nouveaux_comptes_avant: Compte,
  colis: Compte,
  colis_avant: Compte,
  delai_jours: Mesure,
  delai_jours_avant: Mesure,
  delai_colis: Compte,
});
export type IndicateursPlateforme = z.infer<typeof Indicateurs>;

const Jour = z.object({
  jour: z.string(),
  commandes: Compte,
  nouveaux_comptes: Compte,
  comptes_actifs: Compte,
  vues: Compte,
  taux_consultes: Mesure,
  delai_jours: Mesure,
});
export type JourDeStatistiques = z.infer<typeof Jour>;

const Transporteur = z.object({ carrier_code: z.number().nullable(), nombre: Compte });
export type ColisParTransporteur = z.infer<typeof Transporteur>;

const Mois = z.object({ mois: z.string(), comptes: Compte, commandes: Compte, colis: Compte, photos: Compte });
export type MoisDeCroissance = z.infer<typeof Mois>;

function echec(sujet: string, message: string | undefined): never {
  // Jamais de `catch` muet : un écran d'administration qui afficherait des
  // zéros au lieu d'une erreur ferait conclure qu'il ne se passe rien.
  throw new Error(`lecture ${sujet} impossible : ${message ?? "réponse vide"}`);
}

export async function lireIndicateurs(supabase: ClientAdmin, jours: FenetreStatistiques): Promise<IndicateursPlateforme> {
  const { data, error } = await supabase.rpc("statistiques_admin", { p_jours: Number(jours) });
  if (error !== null || data === null) echec("des indicateurs", error?.message);
  const ligne = data[0];
  if (ligne === undefined) echec("des indicateurs", "aucune ligne");
  return Indicateurs.parse(ligne);
}

export async function lireSeries(supabase: ClientAdmin, jours: FenetreStatistiques): Promise<JourDeStatistiques[]> {
  const { data, error } = await supabase.rpc("statistiques_admin_par_jour", { p_jours: Number(jours) });
  if (error !== null || data === null) echec("des séries", error?.message);
  return z.array(Jour).parse(data);
}

export async function lireTransporteurs(supabase: ClientAdmin, jours: FenetreStatistiques): Promise<ColisParTransporteur[]> {
  const { data, error } = await supabase.rpc("transporteurs_admin", { p_jours: Number(jours) });
  if (error !== null || data === null) echec("des transporteurs", error?.message);
  return z.array(Transporteur).parse(data);
}

export async function lireCroissance(supabase: ClientAdmin): Promise<MoisDeCroissance[]> {
  const { data, error } = await supabase.rpc("croissance_admin");
  if (error !== null || data === null) echec("de la croissance", error?.message);
  return z.array(Mois).parse(data);
}

/**
 * L'écart à la période précédente, en pour cent entier — ou `null`.
 *
 * `null` QUAND LA PÉRIODE PRÉCÉDENTE VAUT ZÉRO OU N'EXISTE PAS : passer de 0 à 4
 * n'est pas « +∞ % », et l'écrire « +400 % » inventerait une base. Le badge est
 * alors omis, pas remplacé.
 */
export function ecart(courant: number | null, avant: number | null): number | null {
  if (courant === null || avant === null || avant === 0) return null;
  return Math.round(((courant - avant) / avant) * 100);
}
