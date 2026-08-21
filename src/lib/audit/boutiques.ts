import "server-only";
import { z } from "zod";
import type { ClientAdmin } from "@/lib/audit/comptes";

/**
 * LA LECTURE DES BOUTIQUES PAR L'ADMINISTRATION.
 *
 * CET ÉCRAN N'EST PAS UNE SECONDE LISTE DE COMPTES. Celle-là répond à « qui est
 * inscrit » et se trie par date. Celle-ci répond à « qu'est-ce que ça nous
 * coûte » et se trie par octets occupés. Deux questions, deux tris.
 *
 * IL NE MONTRE AUCUN CONTENU — pas un nom de client, pas une référence produit,
 * pas une note interne, pas un jeton. Des VOLUMES suffisent à décider ; le
 * contenu appartient au vendeur et à ses clients. Le `public_token` en
 * particulier n'a rien à faire ici : les autres champs exposent une donnée,
 * celui-là transfère une CAPACITÉ, définitivement.
 *
 * TOUT PASSE PAR LA FONCTION EN BASE, qui écrit l'audit DANS LA MÊME
 * TRANSACTION que la lecture. Une requête directe rendrait les mêmes données
 * sans laisser de trace, et rien n'échouerait — l'écran fonctionnerait, il
 * serait simplement muet.
 */

export const PAR_PAGE = 50;

export const ParametresBoutiques = z.object({
  q: z.string().trim().max(120).catch(""),
  curseur: z.string().max(160).nullable().catch(null),
});

export type ParametresBoutiques = z.infer<typeof ParametresBoutiques>;

export interface LigneBoutique {
  readonly id: string;
  /** `null` quand la boutique n'a jamais été configurée : c'est le cas le plus
   *  fréquent en début de vie d'un compte, pas une anomalie. */
  readonly nom: string | null;
  readonly proprietaireId: string;
  readonly email: string;
  readonly typeDeCompte: "supplier" | "reseller" | null;
  readonly statut: "active" | "suspended";
  readonly commandes: number;
  readonly medias: number;
  readonly octets: number;
  readonly colisCeMois: number;
  readonly creeLe: string;
}

export interface PageBoutiques {
  readonly lignes: readonly LigneBoutique[];
  readonly curseurSuivant: string | null;
}

export function encoderCurseur(octets: number, id: string): string {
  return Buffer.from(String(octets) + "|" + id, "utf8").toString("base64url");
}

/**
 * Décode un curseur, ou rend `null`.
 *
 * Les deux valeurs partent vers des paramètres typés de la fonction en base —
 * `bigint` et `uuid` — donc une valeur mal formée y serait rejetée par Postgres.
 * Elles sont validées ici QUAND MÊME : une validation qui compte sur le rejet
 * d'une AUTRE couche disparaît le jour où cette couche change, et personne ne
 * fait le lien.
 */
export function decoderCurseur(curseur: string): { octets: string; id: string } | null {
  let brut: string;
  try {
    brut = Buffer.from(curseur, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separateur = brut.lastIndexOf("|");
  if (separateur <= 0) return null;

  const octets = brut.slice(0, separateur);
  const id = brut.slice(separateur + 1);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  // Entier décimal seulement : ni signe, ni notation exponentielle, ni virgule.
  // La virgule et les parenthèses en particulier sont la grammaire de PostgREST,
  // et une valeur qui la porte ne doit jamais atteindre la requête.
  if (!/^\d{1,19}$/.test(octets)) return null;

  return { octets, id };
}

/**
 * Liste les boutiques. Écrit UNE entrée d'audit portant les critères.
 *
 * `empreinteIp` est salée en amont : sans sel, une adresse IPv4 se retrouve par
 * force brute en quelques secondes, et un journal de sécurité deviendrait
 * lui-même un fichier d'adresses en clair.
 */
export async function listerBoutiques(
  supabase: ClientAdmin,
  parametres: ParametresBoutiques,
  empreinteIp: string,
): Promise<PageBoutiques> {
  const point = parametres.curseur === null ? null : decoderCurseur(parametres.curseur);

  const { data, error } = await supabase.rpc("lister_boutiques_admin", {
    p_recherche: parametres.q,
    // LA CHAÎNE VIDE VAUT ABSENCE — convention du dépôt.
    p_curseur_octets: point?.octets ?? "",
    p_curseur_id: point?.id ?? "",
    // Une ligne de plus que la page : c'est ce qui dit s'il en reste, sans
    // exiger un comptage complet de la table.
    p_limite: PAR_PAGE + 1,
    p_ip_hash: empreinteIp,
  });

  if (error !== null || data === null) {
    // Jamais de `catch` muet : un écran d'administration qui affiche une liste
    // vide au lieu d'une erreur ferait conclure qu'il n'y a rien à surveiller.
    throw new Error("lecture des boutiques impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneBoutique[] = visibles.map((l) => ({
    id: l.id,
    nom: l.nom,
    proprietaireId: l.proprietaire_id,
    email: l.email,
    typeDeCompte: l.account_type,
    statut: l.status,
    commandes: Number(l.commandes_reelles),
    medias: Number(l.medias_count),
    octets: Number(l.stockage_octets),
    colisCeMois: Number(l.colis_ce_mois),
    creeLe: l.created_at,
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant:
      dernier === undefined ? null : encoderCurseur(Number(dernier.stockage_octets), dernier.id),
  };
}

/**
 * Le stockage total, en octets.
 *
 * IL EXISTE DÉSORMAIS UN MÉCANISME QUI LE MESURE — les compteurs par boutique,
 * tenus à l'écriture. Tant qu'il n'y en avait pas, le panneau écrivait
 * « indisponible » et non « 0 o » : zéro affirme qu'on a mesuré.
 */
export async function stockageTotal(supabase: ClientAdmin): Promise<number> {
  const { data, error } = await supabase.rpc("stockage_total_admin");
  if (error !== null || data === null) {
    throw new Error("lecture du stockage impossible : " + (error?.message ?? "réponse vide"));
  }
  return Number(data);
}
