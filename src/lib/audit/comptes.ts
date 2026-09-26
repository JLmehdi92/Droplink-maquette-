import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { lectureIllisible } from "@/lib/reseau/panne";

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
  /*
   * LE FILTRE DE STATUT, LISTE FERMÉE.
   *
   * ⚠️ `catch` PLUTÔT QUE `parse` QUI LÈVE, et c'est délibéré : la valeur
   * vient d'une URL, donc d'une entrée externe, et un paramètre truqué ne doit
   * pas transformer un écran d'administration en page d'erreur. La liste fermée
   * tient lieu de schéma, ici comme dans la fonction en base — les deux, parce
   * qu'une règle applicative s'oublie dans un nouveau chemin d'appel.
   */
  statut: z.enum(["tous", "active", "suspended"]).catch("tous"),
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
  /** Commandes AYANT DU CONTENU RÉEL, lues sur le compteur de la boutique. */
  readonly commandes: number;
  /** Colis pris en charge dans le mois — le seul poste que le suivi facture. */
  readonly colisCeMois: number;
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
    // « tous » VAUT ABSENCE, même convention que la chaîne vide de la recherche.
    p_statut: parametres.statut === "tous" ? "" : parametres.statut,
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
    colisCeMois: Number(l.colis_ce_mois),
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant: dernier === undefined ? null : encoderCurseur(dernier.created_at, dernier.id),
  };
}

/**
 * Un agrégat de la frise d'activité : ce que le vendeur a fait, un jour donné.
 *
 * NI IDENTIFIANT NI CHARGE UTILE. Un événement individuel porterait le nom du
 * client et la référence du produit ; le compte par type et par jour suffit à
 * décider d'une suspension et n'apprend rien du contenu.
 */
export interface ActiviteCompte {
  readonly type: string;
  readonly jour: string;
  readonly n: number;
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
  readonly accent: string | null;
  readonly filigrane: boolean;
  /** Noms des réseaux configurés, jamais leurs adresses. */
  readonly reseaux: readonly string[];
  /** Commandes AYANT DU CONTENU RÉEL — même définition que les deux listes. */
  readonly commandes: number;
  readonly colisCeMois: number;
  readonly plan: "gratuit" | "pro";
  /**
   * LE QUOTA DE COMMANDES À LA RÈGLE DU PLAN (200), lu là où il bloque : à vie et
   * tout compris en gratuit, ce mois-ci et en Pro seulement en Pro. Il remplace
   * « commandes ce mois / plafond mensuel », qui disait « 0 sur 300 » d'un gratuit
   * bloqué à vie.
   */
  readonly quotaCommandes: { readonly utilise: number; readonly plafond: number };
  readonly medias: number;
  readonly stockageOctets: number;
  readonly activite: readonly ActiviteCompte[];
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
    accent: l.accent_color,
    filigrane: l.watermark_enabled === true,
    reseaux: l.reseaux ?? [],
    commandes: Number(l.commandes),
    colisCeMois: Number(l.colis_ce_mois),
    plan: l.plan,
    quotaCommandes: { utilise: Number(l.quota_commandes), plafond: Number(l.quota_commandes_plafond) },
    medias: Number(l.medias),
    stockageOctets: Number(l.stockage_octets),
    // La base rend `[]` plutot que `null` : l'appelant n'a pas a distinguer
    // « aucun evenement » de « rien lu ». Le `?? []` reste par prudence de
    // typage, pas parce qu'un cas nul serait attendu.
    activite: (Array.isArray(l.evenements) ? l.evenements : []).map((e) => {
      const brut = e as { type?: unknown; jour?: unknown; n?: unknown };
      return {
        type: String(brut.type ?? ""),
        jour: String(brut.jour ?? ""),
        n: Number(brut.n ?? 0),
      };
    }),
  };
}

/**
 * Les familles d'action que le journal sait filtrer.
 *
 * ⚠️ `consultation` EST DÉFINIE PAR EXCLUSION en base : toute action qui n'est
 * ni une décision sur un compte ni un réglage est une lecture. Une liste
 * positive aurait laissé la prochaine action hors de tous les filtres, donc
 * introuvable par tous.
 */
export const FAMILLES_JOURNAL = ["suspension", "consultation", "parametre"] as const;

/** Fenêtres proposées, en jours. `0` vaut « depuis le début ». */
export const FENETRES_JOURNAL = [7, 30, 0] as const;

export const ParametresJournal = z.object({
  famille: z.enum(FAMILLES_JOURNAL).or(z.literal("")).catch(""),
  // UNE FENÊTRE HORS LISTE RETOMBE SUR « DEPUIS LE DÉBUT ». Elle ne peut venir
  // que d'une URL retouchée à la main : montrer tout est le comportement le
  // moins surprenant, et l'écran allume alors la pilule correspondante.
  jours: z.coerce
    .number()
    .int()
    .catch(0)
    .transform((n) => (FENETRES_JOURNAL.some((f) => f === n) ? n : 0)),
  curseur: z.string().max(160).nullable().catch(null),
});
export type ParametresJournal = z.infer<typeof ParametresJournal>;

export interface LigneJournal {
  readonly id: string;
  readonly adminEmail: string;
  readonly action: string;
  readonly typeRessource: string;
  readonly idRessource: string | null;
  readonly cibleEmail: string | null;
  readonly quand: string;
  readonly motif: string | null;
  /** Valeur d'un paramètre système AVANT la modification. `null` ailleurs. */
  readonly avant: string | null;
  readonly apres: string | null;
}

/**
 * Lit le journal. N'écrit RIEN.
 *
 * Lire le journal ne se journalise pas : sans cette règle, ouvrir la page
 * d'audit y ajouterait une ligne, laquelle apparaîtrait à la consultation
 * suivante — le journal se remplirait de sa propre consultation et noierait ce
 * qu'il est censé conserver.
 */
/**
 * Les N dernieres entrees du journal, pour le panneau.
 *
 * ELLE PASSE PAR LA MEME FONCTION EN BASE QUE LE JOURNAL COMPLET, et c'est
 * delibere : `lire_journal_admin` est declaree `stable`, donc PostgREST
 * l'execute en transaction lecture seule et le moteur refuserait toute ecriture
 * qu'on y ajouterait. Une seconde fonction ecrite pour le panneau aurait pu
 * perdre cette propriete sans que rien ne le signale — et le panneau, ouvert a
 * chaque arrivee, aurait alors rempli le journal de sa propre consultation.
 *
 * `p_limite` EST BORNEE PAR L'APPELANT ET PAR LA BASE : la planche en montre
 * quatre, et une valeur plus grande ne ferait que rendre l'ecran plus lourd
 * pour une information que l'ecran Journal donne deja en entier.
 */
export const ACTION_EXCLUE_DE_L_APERCU = "panneau.alertes";

/**
 * Combien de lignes lire en base pour en garder `limite` apres exclusion.
 *
 * BORNE HAUTE ASSUMEE : si les cent dernieres entrees sont toutes des
 * consultations du panneau, la carte en montre moins que prevu — et c'est
 * l'aveu correct, puisqu'il ne s'est alors rien passe d'autre.
 */
const FENETRE_APERCU = 100;

/**
 * REND `null` QUAND LE TRANSPORT A LÂCHÉ — jamais un tableau vide.
 *
 * ⚠️ DÉFAUT TROUVÉ LE 04/09/2026 PAR UNE PASSE DE FUMÉE, DANS LA NATURE :
 * `⨯ Error: lecture des dernieres actions impossible : TypeError: fetch failed`,
 * et `/fr/admin` en 500 pour un administrateur légitime, pendant que l'écran
 * Journal répondait 200 juste après. Le rôle, la session et la base allaient
 * bien : une seule lecture avait bronché, et elle emportait tout — les alertes
 * en tête, c'est-à-dire ce qu'on vient chercher quand le réseau va mal.
 *
 * ⚠️ C'EST L-025 DANS SA FORME EXACTE. Le 02/09, le même défaut a été fermé sur
 * `lirePanneau` (lecture du stockage) et le motif extrait dans
 * `lib/reseau/panne.ts` — puis posé sur cette lecture-là SEULEMENT. Cette
 * fonction-ci est appelée dans le MÊME `Promise.all`, sur le MÊME écran.
 *
 * `null` ET NON `[]` : un tableau vide se lit « il ne s'est rien passé », ce
 * qui est une affirmation, et une affirmation fausse. C'est le principe XII
 * appliqué à une base qui n'a rien répondu du tout.
 *
 * SEULEMENT POUR UNE PANNE DE TRANSPORT. Un droit manquant, une fonction
 * absente, une contrainte violée continuent de lever : dégrader silencieusement
 * ferait vivre une carte « indisponible » pour toujours sans que personne
 * cherche pourquoi.
 */
export async function lireDernieresActions(
  supabase: ClientAdmin,
  limite: number,
): Promise<readonly LigneJournal[] | null> {
  const { data, error } = await supabase
    .rpc("lire_journal_admin", {
      // NI FILTRE NI FENÊTRE : l'aperçu du panneau montre ce qui vient
      // d'arriver, quel qu'en soit le genre.
      p_famille: "",
      p_depuis_jours: 0,
      p_curseur_date: "",
      p_curseur_id: "",
      p_limite: FENETRE_APERCU,
    })
    // L'EXCLUSION EST POUSSEE EN SQL, pas appliquee apres coup : PostgREST sait
    // filtrer le resultat d'une fonction qui rend une table, et ramener cent
    // lignes pour en jeter quatre-vingt-seize cote serveur serait du transport
    // pur.
    .neq("action", ACTION_EXCLUE_DE_L_APERCU)
    .limit(limite);

  if (lectureIllisible({ error }, "des dernières actions")) return null;

  if (error !== null || data === null) {
    throw new Error(
      "lecture des dernières actions impossible : " + (error?.message ?? "réponse vide"),
    );
  }

  return data.map((l) => ({
    id: l.id,
    adminEmail: l.admin_email,
    action: l.action,
    typeRessource: l.resource_type,
    idRessource: l.resource_id,
    cibleEmail: l.target_email,
    quand: l.occurred_at,
    motif: l.motif,
    avant: l.avant,
    apres: l.apres,
  }));
}

/**
 * LE PLAFOND DU COMPTAGE DU JOURNAL, identique à celui de la migration 118.
 *
 * Au-delà, l'écran dit « plus de 10 000 » plutôt qu'un chiffre exact. Mesuré au
 * plafond : le comptage exact coûtait 313 à 511 ms sur 517 031 lignes, pour une
 * page qui en coûte 0 — soit cent pour cent de la latence de l'écran. Borné, il
 * coûte 4 à 10 ms, et ce coût cesse de croître avec la table.
 *
 * La base compte jusqu'à 10 001 : le +1 est ce qui distingue « exactement dix
 * mille » de « au moins dix mille et un ». Sans lui, une table portant
 * exactement 10 000 entrées s'afficherait « plus de 10 000 », faux d'une unité
 * et faux dans le sens qui exagère.
 */
export const PLAFOND_COMPTAGE_JOURNAL = 10_000;



/**
 * Le nombre d'entrées, avec les MÊMES filtres que la lecture.
 *
 * Un total qui ignorerait le filtre afficherait « 1 284 entrées » au-dessus
 * d'une liste qui en montre trois, et l'on chercherait longtemps les 1 281
 * autres. La fonction en base est `stable`, comme sa jumelle : compter le
 * journal ne l'écrit pas non plus.
 *
 * ⚠️ LA VALEUR RENDUE EST BORNÉE. `depasse` vaut vrai quand la base a cessé de
 * compter : l'appelant doit alors afficher « plus de N », jamais le nombre
 * brut, qui vaudrait 10 001 et serait un chiffre inventé.
 */
export async function compterJournal(
  supabase: ClientAdmin,
  parametres: Pick<ParametresJournal, "famille" | "jours">,
  plafond: number | null,
): Promise<{ total: number; depasse: boolean }> {
  const { data, error } = await supabase.rpc("compter_journal_admin", {
    p_famille: parametres.famille,
    p_depuis_jours: parametres.jours,
    // ⚠️ ON DEMANDE UN DE PLUS QUE CE QU'ON AFFICHERA, et la convention vit
    // ICI plutôt qu'au site d'appel. Ce +1 est ce qui distingue « exactement
    // N » de « au moins N+1 » : sans lui, la base s'arrête PILE au plafond, le
    // comptage ne peut par construction jamais le dépasser, et `depasse` reste
    // faux pour toujours. Défaut trouvé par le test du contrat, pas par
    // relecture — il est invisible tant qu'on ne demande pas un plafond
    // volontairement bas.
    //
    // `0` dit « ne borne pas » à la base. Il n'y a PAS de valeur par défaut, ni
    // ici ni en base : un défaut rendrait le coût invisible au site d'appel, et
    // c'est précisément ce coût qu'on veut voir écrit là où il est payé.
    p_plafond: plafond === null ? 0 : plafond + 1,
  });
  if (error !== null) {
    throw new Error("comptage du journal impossible : " + error.message);
  }
  const compte = Number(data ?? 0);
  if (plafond === null) return { total: compte, depasse: false };
  return { total: Math.min(compte, plafond), depasse: compte > plafond };
}

/** La répartition du journal par famille, bornée au même plafond. */
export interface RepartitionJournal {
  readonly total: number;
  readonly suspensions: number;
  readonly parametres: number;
  readonly consultations: number;
}

/**
 * Combien d'entrées, et de quelle sorte, sur la fenêtre demandée.
 *
 * ⚠️ LE MÊME PLAFOND QUE `compterJournal`, ET C'EST OBLIGATOIRE. Deux bornes
 * différentes sur la même carte feraient un total qui n'est pas la somme de ses
 * parts, et personne ne saurait laquelle des deux mentait.
 *
 * ⚠️ ET PAS DE `+1` ICI, contrairement à `compterJournal`. Ce « un de plus »
 * sert à distinguer « exactement N » de « au moins N+1 » sur le décompte annoncé ;
 * l'anneau, lui, ne montre que des PARTS. Un dépassement d'une unité ne change
 * pas une part, et le décompte au-dessus le dit déjà.
 *
 * `null` sur une panne de TRANSPORT : le panneau se nomme indisponible, l'écran
 * se rend.
 */
export async function repartirJournal(
  supabase: ClientAdmin,
  jours: number,
  plafond: number,
): Promise<RepartitionJournal | null> {
  const reponse = await supabase.rpc("repartir_journal_admin", {
    p_depuis_jours: jours,
    p_plafond: plafond,
  });
  if (lectureIllisible(reponse, "de la répartition du journal")) return null;
  if (reponse.error !== null) {
    throw new Error("répartition du journal impossible : " + reponse.error.message);
  }
  const r = (reponse.data ?? [])[0];
  if (r === undefined) return null;
  return {
    total: Number(r.total),
    suspensions: Number(r.suspensions),
    parametres: Number(r.parametres),
    consultations: Number(r.consultations),
  };
}

export async function lireJournal(
  supabase: ClientAdmin,
  parametres: ParametresJournal,
): Promise<{ lignes: readonly LigneJournal[]; curseurSuivant: string | null }> {
  const point = parametres.curseur === null ? null : decoderCurseur(parametres.curseur);

  const { data, error } = await supabase.rpc("lire_journal_admin", {
    p_famille: parametres.famille,
    p_depuis_jours: parametres.jours,
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
    avant: l.avant,
    apres: l.apres,
  }));

  const dernier = trop ? visibles[visibles.length - 1] : undefined;

  return {
    lignes,
    curseurSuivant: dernier === undefined ? null : encoderCurseur(dernier.occurred_at, dernier.id),
  };
}
