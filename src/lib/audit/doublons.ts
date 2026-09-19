import "server-only";
import type { ClientAdmin } from "@/lib/audit/comptes";

/**
 * LES COMPTES EN DOUBLON, LUS PAR L'ADMINISTRATION (migration 170).
 *
 * Deux comptes distincts qui affichent le même Instagram, TikTok, WhatsApp ou site. Tout le
 * jugement — ce qui est « le même » identifiant — vit dans UNE fonction en base,
 * `identifiant_public` : la refaire ici en TypeScript créerait une seconde définition, qui
 * divergerait de la première au premier cas oublié, et l'écran afficherait des groupes que le
 * compteur ne voit pas.
 *
 * Comme toute lecture admin, elle passe par les fonctions en base, jamais par une requête
 * directe : `lister_doublons_admin` écrit la trace DANS LA MÊME TRANSACTION que la lecture.
 */

export type GenreIdentifiant = "instagram" | "tiktok" | "whatsapp" | "site";

export interface CompteDoublon {
  readonly id: string;
  readonly email: string;
  readonly boutique: string | null;
  readonly statut: "active" | "suspended";
  readonly inscritLe: string;
  readonly commandes: number;
}

export interface GroupeDoublon {
  readonly genre: GenreIdentifiant;
  /** La valeur canonique : nom de compte, chiffres du numéro, ou hôte et chemin du site. */
  readonly valeur: string;
  readonly comptes: readonly CompteDoublon[];
}

export interface NombresDoublons {
  readonly identifiants: number;
  readonly comptes: number;
}

const GENRES: ReadonlySet<string> = new Set(["instagram", "tiktok", "whatsapp", "site"]);

function estGenre(g: string): g is GenreIdentifiant {
  return GENRES.has(g);
}

/** Des nombres seulement : aucune trace, comme les tuiles de la liste des comptes. */
export async function compterDoublons(supabase: ClientAdmin): Promise<NombresDoublons> {
  const { data, error } = await supabase.rpc("compter_doublons_admin");
  const ligne = data?.[0];
  if (error !== null || ligne === undefined) {
    // Un compteur illisible ne vaut pas zéro : « aucun doublon » serait une affirmation que la
    // base n'a pas faite (contrainte 8).
    throw new Error("comptage des doublons impossible : " + (error?.message ?? "réponse vide"));
  }
  return { identifiants: Number(ligne.identifiants), comptes: Number(ligne.comptes) };
}

/**
 * Les groupes, dans l'ordre de la base (les plus partagés d'abord). Écrit UNE entrée d'audit,
 * portant l'empreinte salée de l'administrateur.
 */
export async function listerDoublons(supabase: ClientAdmin, empreinteIp: string): Promise<GroupeDoublon[]> {
  const { data, error } = await supabase.rpc("lister_doublons_admin", { p_ip_hash: empreinteIp });
  if (error !== null || data === null) {
    throw new Error("lecture des doublons impossible : " + (error?.message ?? "réponse vide"));
  }

  const groupes: { genre: GenreIdentifiant; valeur: string; comptes: CompteDoublon[] }[] = [];
  for (const l of data) {
    // UN GENRE INCONNU EST UNE ERREUR, pas une ligne à taire : il voudrait dire que la base
    // et cet écran ne parlent plus de la même chose.
    if (!estGenre(l.genre)) throw new Error(`genre d'identifiant inconnu : ${l.genre}`);
    const compte: CompteDoublon = {
      id: l.profil_id,
      email: l.email,
      boutique: l.boutique_nom,
      statut: l.statut,
      inscritLe: l.inscrit_le,
      commandes: Number(l.commandes),
    };
    // Les lignes d'un même identifiant arrivent CONTIGUËS (ordre de la base) : on regroupe
    // sur la dernière entrée, jamais par une recherche qui fusionnerait deux groupes séparés.
    const dernier = groupes[groupes.length - 1];
    if (dernier !== undefined && dernier.genre === l.genre && dernier.valeur === l.valeur) {
      dernier.comptes.push(compte);
    } else {
      groupes.push({ genre: l.genre, valeur: l.valeur, comptes: [compte] });
    }
  }
  return groupes;
}

/** Ce que l'écran affiche : « @nom », « +chiffres », ou l'adresse du site telle quelle. */
export function valeurLisible(g: Pick<GroupeDoublon, "genre" | "valeur">): string {
  if (g.genre === "instagram" || g.genre === "tiktok") return "@" + g.valeur;
  if (g.genre === "whatsapp") return "+" + g.valeur;
  return g.valeur;
}
