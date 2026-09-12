import "server-only";
import { cache } from "react";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";
import { lectureIllisible } from "@/lib/reseau/panne";

/**
 * LA LISTE DES ENVOIS — les colis du vendeur, pas ses commandes.
 *
 * Écran distinct du tableau de bord parce que l'unité n'est pas la même : un
 * numéro de suivi peut porter PLUSIEURS commandes, et c'est même le cas normal
 * quand un fournisseur groupe un envoi. Une liste de commandes le répéterait
 * autant de fois qu'il y a de commandes, et le vendeur relancerait le
 * transporteur plusieurs fois pour un seul colis.
 *
 * CE QUE LE VENDEUR VIENT CHERCHER ICI : ce qui est bloqué. Le tri par défaut
 * est donc l'immobilité, pas la fraîcheur — les colis qui avancent ne posent
 * aucune question.
 *
 * PAGINATION PAR CURSEUR, jamais par décalage. À la page 40 d'un jeu de 9 600,
 * un `offset` lit 2 000 lignes pour en rendre 50 : le coût croît avec le numéro
 * de page, donc l'inconfort arrive chez celui qui a le plus de données.
 */

export const TRIS = ["immobiles", "recents", "anciens"] as const;
export type Tri = (typeof TRIS)[number];

export const ETATS = ["preparation", "expedie", "en_transit", "livre"] as const;
export type Etat = (typeof ETATS)[number];

export const PAR_PAGE = 50;

/**
 * Tout ce qui arrive de l'URL est validé, y compris ce qui « vient de nos
 * propres liens » : une URL se retape à la main, et `catch` rend le paramètre
 * fautif inoffensif plutôt que de casser l'écran entier.
 */
export const ParametresEnvois = z.object({
  tri: z.enum(TRIS).catch("immobiles"),
  etat: z.enum(ETATS).nullable().catch(null),
  // Trois états, pas deux : `null` ne filtre rien, `true` ne garde que les
  // abandonnés, `false` les exclut. Un booléen simple aurait confondu « je ne
  // filtre pas » et « je veux les non-abandonnés ».
  //
  // LA COERCITION EST DANS LE SCHÉMA, pas chez l'appelant. Un `z.boolean()` nu
  // suivi d'un `catch` accepte le booléen et REJETTE SILENCIEUSEMENT la forme
  // qui arrive réellement de l'URL — la chaîne « oui ». Le filtre disparaît
  // alors sans bruit et l'écran affiche tout en prétendant filtrer : le vendeur
  // lit « 12 colis sans mouvement » au-dessus d'une liste qui les contient
  // tous. Une seule définition, ici, plutôt qu'une conversion dans chaque
  // appelant qui finirait par diverger.
  abandonnes: z.preprocess(
    (v) => (v === "oui" || v === true ? true : v === "non" || v === false ? false : null),
    z.boolean().nullable(),
  ),
  silencieux: z.preprocess((v) => v === "oui" || v === true, z.boolean()),
  curseur: z.string().max(120).nullable().catch(null),
});

export type ParametresEnvois = z.infer<typeof ParametresEnvois>;

export interface LigneEnvoi {
  readonly id: string;
  readonly numero: string;
  /**
   * Code transporteur, NUMÉRIQUE : c'est un identifiant de fournisseur de suivi,
   * pas un nom. Il n'est jamais montré tel quel au vendeur — l'écran le traduit
   * en libellé, et un code brut à l'écran n'apprendrait rien à personne.
   */
  readonly transporteur: number | null;
  readonly etat: Etat;
  readonly immobileDepuis: string;
  readonly premierMouvement: string | null;
  readonly dernierMouvement: string | null;
  readonly abandonneLe: string | null;
  readonly interrogations: number;
  readonly commandes: number;
  /**
   * Les destinataires des commandes rattachées, dans l'ordre rendu par la base.
   * Un nom peut être `null` : `customer_label` est un texte LIBRE et facultatif.
   */
  readonly clients: readonly string[];
  /**
   * La dernière chose que le transporteur a dite. Tenue par un déclencheur
   * (migration 104), donc jamais recalculée à la lecture.
   */
  readonly dernierPoint: string | null;
}

export interface PageEnvois {
  readonly lignes: readonly LigneEnvoi[];
  readonly curseurSuivant: string | null;
}

export interface CompteursEnvois {
  readonly total: number;
  readonly preparation: number;
  readonly expedie: number;
  readonly enTransit: number;
  readonly livre: number;
  readonly silencieux: number;
  readonly abandonnes: number;
  readonly livresCeMois: number;
}

/**
 * UNE SEULE CHAÎNE LITTÉRALE.
 *
 * PostgREST déduit le type du résultat de ce littéral : le composer par
 * concaténation effondre le type rendu en erreur générique, et l'on perd
 * exactement le contrôle qui aurait signalé une colonne mal orthographiée.
 *
 * ⚠️ ON RAPPORTE DÉSORMAIS LES DESTINATAIRES, PAS UN COMPTE. La colonne
 * s'appelle « commandes liées » sur les deux planches et elle y montre
 * « @yanis » ou « @lea.store, @nadia » — pas « 2 commandes ». Un chiffre ne dit
 * pas de QUI il s'agit, et c'est précisément ce que le vendeur cherche quand il
 * regarde un colis groupé.
 *
 * Le poids reste borné par la réalité physique : un colis transporte ce qui
 * tient dans un carton. La page en rend cinquante, et l'affichage s'arrête à
 * deux noms suivis d'un « +N » — mais c'est l'AFFICHAGE qui s'arrête, pas la
 * lecture : le compte doit rester exact.
 */
const COLONNES =
  "id, tracking_number, carrier_code, normalized_status, immobile_depuis, updated_at, first_movement_at, last_movement_at, abandoned_at, query_count, dernier_point, order_parcels(orders(customer_label))";

/** La colonne de tri, et son sens. */
function ordre(tri: Tri): { colonne: "immobile_depuis" | "updated_at"; croissant: boolean } {
  switch (tri) {
    case "immobiles":
      // Le plus ancien mouvement d'abord : ce qui stagne remonte.
      return { colonne: "immobile_depuis", croissant: true };
    case "anciens":
      return { colonne: "updated_at", croissant: true };
    default:
      return { colonne: "updated_at", croissant: false };
  }
}

export function encoderCurseur(valeur: string, id: string): string {
  return Buffer.from(valeur + "|" + id, "utf8").toString("base64url");
}

/**
 * Décode un curseur, ou rend `null`.
 *
 * LES DEUX VALEURS RETOURNENT DANS UNE EXPRESSION `or=` EN SYNTAXE POSTGREST,
 * dont la grammaire emploie la virgule, le point et les parenthèses. Les valider
 * « en gros » ne suffit donc pas : il faut interdire ces caractères, sans quoi
 * un curseur forgé pourrait prolonger l'expression de filtre avec un terme de
 * son choix.
 *
 * La RLS resterait la dernière ligne — elle borne à la boutique de l'appelant
 * quoi qu'il arrive. Mais une protection qui tient à ce qu'une AUTRE couche
 * rattrape n'est pas une protection, c'est un sursis.
 */
export function decoderCurseur(curseur: string): { valeur: string; id: string } | null {
  let brut: string;
  try {
    brut = Buffer.from(curseur, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const separateur = brut.lastIndexOf("|");
  if (separateur <= 0) return null;

  const valeur = brut.slice(0, separateur);
  const id = brut.slice(separateur + 1);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  // Le décalage horaire s'écrit `+00:00`, `+0000` OU `+00` : PostgREST rend la
  // troisième forme, et l'oublier renverrait le vendeur à la première page à
  // chaque « page suivante ».
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(valeur)) {
    return null;
  }

  return { valeur, id };
}

export type ClientLecture = SupabaseClient<Database>;

export async function lireEnvois(
  supabase: ClientLecture,
  parametres: ParametresEnvois,
  maintenant: Date,
): Promise<PageEnvois> {
  const { colonne, croissant } = ordre(parametres.tri);

  // AUCUN FILTRE SUR `shop_id` ICI, ET C'EST VOULU. L'isolation est faite par la
  // RLS, avec la session de l'appelant. Ajouter un filtre applicatif donnerait
  // l'illusion que c'est LUI qui protège, et le jour où il serait écrit de
  // travers on croirait encore être isolé.
  let requete = supabase.from("tracked_parcels").select(COLONNES);

  if (parametres.etat !== null) requete = requete.eq("normalized_status", parametres.etat);

  if (parametres.abandonnes === true) requete = requete.not("abandoned_at", "is", null);
  if (parametres.abandonnes === false) requete = requete.is("abandoned_at", null);

  if (parametres.silencieux) {
    // LE SEUIL VIENT DU MODULE DE SILENCE, jamais réécrit ici : deux définitions
    // du même seuil divergent au premier ajustement, et l'écran afficherait
    // alors un compte qui ne correspond à aucune liste.
    const limite = new Date(maintenant.getTime() - SEUIL_SILENCE_JOURS * 86_400_000);
    requete = requete
      .lt("immobile_depuis", limite.toISOString())
      .neq("normalized_status", "livre")
      .is("abandoned_at", null);
  }

  if (parametres.curseur !== null) {
    const point = decoderCurseur(parametres.curseur);
    if (point !== null) {
      // Comparaison de COUPLE `(colonne, id)`. PostgREST ne sait pas l'écrire
      // d'un trait ; on la compose avec un `or` dont le second terme départage
      // l'égalité — deux colis peuvent partager la même seconde.
      const op = croissant ? "gt" : "lt";
      requete = requete.or(
        `${colonne}.${op}.${point.valeur},and(${colonne}.eq.${point.valeur},id.${op}.${point.id})`,
      );
    }
  }

  const { data, error } = await requete
    .order(colonne, { ascending: croissant })
    .order("id", { ascending: croissant })
    .limit(PAR_PAGE + 1);

  if (error !== null || data === null) {
    // Jamais de `catch` muet : un échec de lecture doit remonter, sinon l'écran
    // affiche « aucun envoi » à un vendeur qui en a des milliers, et il conclut
    // que le suivi ne marche pas.
    throw new Error("lecture des envois impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneEnvoi[] = visibles.map((l) => ({
    id: l.id,
    numero: l.tracking_number,
    transporteur: l.carrier_code,
    etat: l.normalized_status,
    immobileDepuis: l.immobile_depuis ?? l.first_movement_at ?? "",
    premierMouvement: l.first_movement_at,
    dernierMouvement: l.last_movement_at,
    abandonneLe: l.abandoned_at,
    interrogations: l.query_count,
    commandes: l.order_parcels.length,
    // `customer_label` est facultatif : une commande sans destinataire nommé
    // n'ajoute pas de nom vide à la liste, elle n'ajoute rien du tout. Le
    // COMPTE, lui, la garde — elle existe.
    clients: l.order_parcels
      .map((op) => op.orders?.customer_label ?? null)
      .filter((nom): nom is string => nom !== null && nom.trim() !== ""),
    dernierPoint: l.dernier_point,
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;
  const valeurCurseur =
    dernier === undefined
      ? null
      : colonne === "immobile_depuis"
        ? (dernier.immobile_depuis ?? null)
        : dernier.updated_at;

  return {
    lignes,
    curseurSuivant:
      dernier === undefined || valeurCurseur === null
        ? null
        : encoderCurseur(valeurCurseur, dernier.id),
  };
}

/**
 * Les compteurs de l'en-tête, en une seule passe.
 *
 * ILS PORTENT LEUR VALEUR, jamais un jugement : « 12 sans mouvement depuis plus
 * de 10 jours », pas « des colis sont en retard ». Un chiffre se vérifie, une
 * appréciation se discute.
 */
/**
 * ⚠️ MÉMORISÉ SUR LA REQUÊTE. Depuis que la cloche de la barre supérieure porte
 * le nombre de colis silencieux, DEUX appelants demandent ces compteurs pour un
 * seul rendu de `/envois` : la coque et l écran. `cache` de React les ramène à
 * UN appel par requête.
 */
export const compterEnvois = cache(compterEnvoisSansCache);

async function compterEnvoisSansCache(
  supabase: ClientLecture,
): Promise<CompteursEnvois | null> {
  const { data, error } = await supabase.rpc("compter_envois", {
    p_silence_jours: SEUIL_SILENCE_JOURS,
  });

  // Une panne de transport NOMME la section illisible ; tout le reste lève.
  if (lectureIllisible({ error }, "du comptage des envois")) return null;
  if (error !== null || data === null) {
    throw new Error("comptage des envois impossible : " + (error?.message ?? "réponse vide"));
  }

  const l = Array.isArray(data) ? data[0] : null;
  if (l === undefined || l === null) {
    throw new Error("comptage des envois impossible : aucune ligne");
  }

  // `count()` de Postgres rend un `bigint`, que le pilote transporte en chaîne
  // au-delà de la plage sûre. `Number` est appliqué explicitement plutôt que de
  // laisser une comparaison mélanger les deux types plus loin.
  return {
    total: Number(l.total),
    preparation: Number(l.preparation),
    expedie: Number(l.expedie),
    enTransit: Number(l.en_transit),
    livre: Number(l.livre),
    silencieux: Number(l.silencieux),
    abandonnes: Number(l.abandonnes),
    livresCeMois: Number(l.livres_ce_mois),
  };
}

/** Lit les paramètres depuis l'URL. */
export function analyserParametres(
  recherche: Record<string, string | string[] | undefined>,
): ParametresEnvois {
  const seul = (cle: string): string | undefined => {
    const v = recherche[cle];
    return Array.isArray(v) ? v[0] : v;
  };

  // Aucune conversion ici : le schéma porte la coercition, et la dupliquer
  // créerait un second endroit où « oui » peut cesser de vouloir dire oui.
  return ParametresEnvois.parse({
    tri: seul("tri"),
    etat: seul("etat") ?? null,
    abandonnes: seul("abandonnes"),
    silencieux: seul("silencieux"),
    curseur: seul("curseur") ?? null,
  });
}
