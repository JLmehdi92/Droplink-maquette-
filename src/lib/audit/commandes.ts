import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/comptes";

/**
 * LES COMMANDES DE LA PLATEFORME, VUES PAR L'ADMINISTRATION.
 *
 * ⚠️ AUCUN CONTENU, et c'est la fonction en base qui le garantit, pas cet
 * écran : ni pseudo ni adresse du client final, ni référence produit, ni note
 * interne, ni `public_token`. Le kit dessine un « Client » et un bouton « Ouvrir
 * la page client » ; le premier appartient à quelqu'un qui n'a jamais eu de
 * compte chez nous, le second transférerait la capacité d'ouvrir sa page. La
 * supervision décide avec la boutique, le statut, le transporteur et la date.
 *
 * TOUT PASSE PAR `lister_commandes_admin`, qui écrit l'audit DANS LA MÊME
 * TRANSACTION que la lecture (migrations 159 et 160).
 */

export const PAR_PAGE = 50;

export const STATUTS_FILTRABLES = ["preparation", "expedie", "en_transit", "livre"] as const;
export const FENETRES = ["7", "30"] as const;

export const ParametresCommandes = z.object({
  q: z.string().trim().max(120).catch(""),
  statut: z.enum(STATUTS_FILTRABLES).or(z.literal("")).catch(""),
  jours: z.enum(FENETRES).or(z.literal("")).catch(""),
  curseur: z.string().max(200).nullable().catch(null),
});

export type ParametresCommandes = z.infer<typeof ParametresCommandes>;

export interface LigneCommandeAdmin {
  readonly id: string;
  readonly reference: string;
  readonly boutiqueId: string;
  /** `null` tant que le vendeur n'a pas nommé sa boutique — le cas le plus
   *  fréquent en début de vie d'un compte, pas une anomalie. */
  readonly boutiqueNom: string | null;
  readonly accent: string;
  readonly proprietaireId: string;
  readonly proprietaireEmail: string;
  readonly statut: (typeof STATUTS_FILTRABLES)[number];
  /** Code du fournisseur de suivi, `null` sans colis ou tant qu'il n'est pas reconnu. */
  readonly transporteur: number | null;
  /** L'instant tel que la base l'a rendu, microsecondes comprises. */
  readonly creeLe: string;
}

export interface PageCommandesAdmin {
  readonly lignes: readonly LigneCommandeAdmin[];
  readonly curseurSuivant: string | null;
}

/**
 * ⚠️ L'INSTANT VOYAGE EN TEXTE, JAMAIS PAR `Date`. La base le rend à la
 * microseconde ; un aller-retour par `Date` le tronque à la milliseconde, et
 * le curseur désignerait alors un instant ANTÉRIEUR à la dernière ligne lue —
 * la page suivante la rendrait une seconde fois, ou en sauterait une voisine
 * créée dans la même milliseconde.
 */
export function encoderCurseur(instant: string, id: string): string {
  return Buffer.from(instant + "|" + id, "utf8").toString("base64url");
}

const INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Décode un curseur, ou rend `null`.
 *
 * Les deux moitiés partent vers des conversions `timestamptz` et `uuid` en
 * base, qui rejetteraient une valeur mal formée. Elles sont validées ici QUAND
 * MÊME : une validation qui compte sur le rejet d'une autre couche disparaît le
 * jour où cette couche change.
 */
export function decoderCurseur(curseur: string): { instant: string; id: string } | null {
  const brut = Buffer.from(curseur, "base64url").toString("utf8");
  const separateur = brut.lastIndexOf("|");
  if (separateur <= 0) return null;
  const instant = brut.slice(0, separateur);
  const id = brut.slice(separateur + 1);
  if (!UUID.test(id) || !INSTANT.test(instant)) return null;
  return { instant, id };
}

const Statut = z.enum(STATUTS_FILTRABLES);

/**
 * Liste les commandes. Écrit UNE entrée d'audit portant les critères.
 *
 * `empreinteIp` est salée en amont : sans sel, une adresse IPv4 se retrouve par
 * force brute en quelques secondes.
 */
export async function listerCommandesAdmin(
  supabase: ClientAdmin,
  parametres: ParametresCommandes,
  empreinteIp: string,
): Promise<PageCommandesAdmin> {
  const point = parametres.curseur === null ? null : decoderCurseur(parametres.curseur);

  const { data, error } = await supabase.rpc("lister_commandes_admin", {
    p_recherche: parametres.q,
    p_statut: parametres.statut,
    // LA CHAÎNE VIDE VAUT ABSENCE — convention du dépôt (migration 160).
    p_jours: parametres.jours,
    p_curseur_date: point?.instant ?? "",
    p_curseur_id: point?.id ?? "",
    // Une ligne de plus que la page : c'est ce qui dit s'il en reste, sans
    // exiger un comptage complet de la table.
    p_limite: PAR_PAGE + 1,
    p_ip_hash: empreinteIp,
  });

  if (error !== null || data === null) {
    // Jamais de `catch` muet : une liste vide au lieu d'une erreur ferait
    // conclure qu'il n'y a rien à superviser.
    throw new Error("lecture des commandes impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneCommandeAdmin[] = visibles.map((l) => ({
    id: l.id,
    reference: l.reference_courte,
    boutiqueId: l.boutique_id,
    // LES TYPES GÉNÉRÉS DISENT `string` ET `number` : Supabase ne sait pas lire
    // la nullité d'une colonne de table de retour. La base, elle, rend `null`.
    boutiqueNom: (l.boutique_nom as string | null) ?? null,
    accent: l.accent_color,
    proprietaireId: l.proprietaire_id,
    proprietaireEmail: l.proprietaire_email,
    statut: Statut.parse(l.statut),
    transporteur: (l.transporteur as number | null) ?? null,
    creeLe: l.created_at,
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant: dernier === undefined ? null : encoderCurseur(dernier.created_at, dernier.id),
  };
}
