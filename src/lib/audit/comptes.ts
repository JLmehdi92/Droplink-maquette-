import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * LA LECTURE DES COMPTES PAR L'ADMINISTRATION.
 *
 * TOUT PASSE PAR LES FONCTIONS EN BASE, jamais par une requête directe. Ce n'est
 * pas une préférence de style : ces fonctions écrivent l'audit DANS LA MÊME
 * TRANSACTION que la lecture. Une requête directe rendrait les mêmes données
 * sans laisser de trace, et rien n'échouerait — l'écran fonctionnerait, il
 * serait simplement muet.
 *
 * C'est aussi pourquoi ce module vit sous `lib/audit/` : la règle ESLint qui y
 * enferme le client service-role rend l'audit structurellement inévitable plutôt
 * que dépendant de la mémoire de celui qui écrira le prochain écran.
 *
 * L'APPELANT PORTE SA PROPRE SESSION. Les fonctions vérifient le rôle
 * elles-mêmes ; passer par le service-role ici les rendrait aveugles à
 * l'identité de l'humain qui lit, et le journal ne saurait plus qui tracer.
 */

export const PAR_PAGE = 50;

export const ParametresComptes = z.object({
  q: z.string().trim().max(120).catch(""),
  curseur: z.string().max(120).nullable().catch(null),
});

export type ParametresComptes = z.infer<typeof ParametresComptes>;

export interface LigneCompte {
  readonly id: string;
  readonly email: string;
  readonly typeDeCompte: "supplier" | "reseller" | null;
  readonly role: "user" | "admin";
  readonly statut: "active" | "suspended";
  readonly creeLe: string;
  readonly boutique: string | null;
  readonly commandes: number;
}

export interface PageComptes {
  readonly lignes: readonly LigneCompte[];
  readonly curseurSuivant: string | null;
}

export function encoderCurseur(date: string, id: string): string {
  return Buffer.from(date + "|" + id, "utf8").toString("base64url");
}

/**
 * Décode un curseur, ou rend `null`.
 *
 * Les deux valeurs partent vers des paramètres typés de la fonction en base —
 * `timestamptz` et `uuid` — donc une valeur mal formée y serait rejetée par
 * Postgres. Elles sont validées ici QUAND MÊME : une validation qui compte sur
 * le rejet d'une AUTRE couche disparaît le jour où cette couche change, et
 * personne ne fait le lien.
 */
export function decoderCurseur(curseur: string): { date: string; id: string } | null {
  let brut: string;
  try {
    brut = Buffer.from(curseur, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separateur = brut.lastIndexOf("|");
  if (separateur <= 0) return null;

  const date = brut.slice(0, separateur);
  const id = brut.slice(separateur + 1);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(date)) {
    return null;
  }

  return { date, id };
}

export type ClientAdmin = SupabaseClient<Database>;

/**
 * Liste les comptes. Écrit UNE entrée d'audit portant les critères.
 *
 * `empreinteIp` est passée jusqu'à la base parce que le journal doit dire d'où
 * l'accès a eu lieu. Elle est SALÉE en amont : sans sel, une adresse IPv4 se
 * retrouve par force brute en quelques secondes, et un journal de sécurité
 * deviendrait lui-même un fichier d'adresses en clair.
 */
export async function listerComptes(
  supabase: ClientAdmin,
  parametres: ParametresComptes,
  empreinteIp: string,
): Promise<PageComptes> {
  const point = parametres.curseur === null ? null : decoderCurseur(parametres.curseur);

  const { data, error } = await supabase.rpc("lister_comptes_admin", {
    p_recherche: parametres.q,
    // LA CHAÎNE VIDE VAUT ABSENCE — convention du dépôt : une signature
    // Postgres ne dit rien de la nullité de ses arguments, et le générateur de
    // types les décrit tous comme non nuls.
    p_curseur_date: point?.date ?? "",
    p_curseur_id: point?.id ?? "",
    // On demande une ligne de plus que la page : c'est ce qui dit s'il en reste,
    // sans exiger un comptage complet de la table.
    p_limite: PAR_PAGE + 1,
    p_ip_hash: empreinteIp,
  });

  if (error !== null || data === null) {
    // Jamais de `catch` muet, et surtout pas ici : un écran d'administration qui
    // affiche une liste vide au lieu d'une erreur ferait conclure qu'il n'y a
    // aucun compte à surveiller.
    throw new Error("lecture des comptes impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneCompte[] = visibles.map((l) => ({
    id: l.id,
    email: l.email,
    typeDeCompte: l.account_type,
    role: l.role,
    statut: l.status,
    creeLe: l.created_at,
    boutique: l.boutique_nom,
    commandes: Number(l.commandes),
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant: dernier === undefined ? null : encoderCurseur(dernier.created_at, dernier.id),
  };
}

export interface FicheCompte {
  readonly id: string;
  readonly email: string;
  readonly typeDeCompte: "supplier" | "reseller" | null;
  readonly role: "user" | "admin";
  readonly statut: "active" | "suspended";
  readonly langue: string;
  readonly creeLe: string;
  readonly boutique: string | null;
  readonly commandes: number;
  readonly colis: number;
  readonly vues: number;
}

/**
 * Lit le détail d'un compte. Trace la consultation, y compris infructueuse.
 *
 * Rend `null` quand le compte n'existe pas — mais l'entrée d'audit a DÉJÀ été
 * écrite : ne tracer que les succès laisserait l'énumération d'identifiants
 * totalement invisible.
 */
export async function lireCompte(
  supabase: ClientAdmin,
  profilId: string,
  empreinteIp: string,
): Promise<FicheCompte | null> {
  const { data, error } = await supabase.rpc("lire_compte_admin", {
    p_profil: profilId,
    p_ip_hash: empreinteIp,
  });

  if (error !== null) {
    throw new Error("lecture du compte impossible : " + error.message);
  }

  const l = (data ?? [])[0];
  if (l === undefined) return null;

  return {
    id: l.id,
    email: l.email,
    typeDeCompte: l.account_type,
    role: l.role,
    statut: l.status,
    langue: l.locale,
    creeLe: l.created_at,
    boutique: l.boutique_nom,
    commandes: Number(l.commandes),
    colis: Number(l.colis),
    vues: Number(l.vues),
  };
}

export interface LigneJournal {
  readonly id: string;
  readonly adminEmail: string;
  readonly action: string;
  readonly typeRessource: string;
  readonly idRessource: string | null;
  readonly cibleEmail: string | null;
  readonly quand: string;
  readonly motif: string | null;
}

/**
 * Lit le journal. N'écrit RIEN.
 *
 * Lire le journal ne se journalise pas : sans cette règle, ouvrir la page
 * d'audit y ajouterait une ligne, laquelle apparaîtrait à la consultation
 * suivante — le journal se remplirait de sa propre consultation et noierait ce
 * qu'il est censé conserver.
 */
export async function lireJournal(
  supabase: ClientAdmin,
  curseur: string | null,
): Promise<{ lignes: readonly LigneJournal[]; curseurSuivant: string | null }> {
  const point = curseur === null ? null : decoderCurseur(curseur);

  const { data, error } = await supabase.rpc("lire_journal_admin", {
    p_curseur_date: point?.date ?? "",
    p_curseur_id: point?.id ?? "",
    p_limite: PAR_PAGE + 1,
  });

  if (error !== null || data === null) {
    throw new Error("lecture du journal impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneJournal[] = visibles.map((l) => ({
    id: l.id,
    adminEmail: l.admin_email,
    action: l.action,
    typeRessource: l.resource_type,
    idRessource: l.resource_id,
    cibleEmail: l.target_email,
    quand: l.occurred_at,
    motif: l.motif,
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant: dernier === undefined ? null : encoderCurseur(dernier.occurred_at, dernier.id),
  };
}
