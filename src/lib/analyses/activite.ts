import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { signerLecture } from "@/lib/storage/r2";
import { cleDApercu } from "@/lib/medias/apercu";
import { lectureIllisible } from "@/lib/reseau/panne";

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

/**
 * LES TROIS PÉRIODES DES PLANCHES.
 *
 * ⚠️ « DEPUIS LE DÉBUT » A DISPARU AU PROFIT DE « 90 JOURS », et ce n'est pas
 * un détail de libellé. Les deux planches, `Analyses` et `AnalysesMobile`,
 * posent 7 / 30 / 90. Une période non bornée n'a PAS de période précédente à
 * laquelle se comparer : le premier compteur de l'écran, « + N vs période
 * précédente », serait resté vide sur un tiers des choix — donc la colonne
 * aurait affiché tantôt une tendance, tantôt rien, sans que le vendeur sache
 * pourquoi. Trois fenêtres de même nature, trois comparaisons possibles.
 */
export const PERIODES = ["7j", "30j", "90j"] as const;
export type Periode = (typeof PERIODES)[number];

/** Le nombre de jours de chaque fenêtre. Un seul endroit le sait. */
const JOURS: Record<Periode, number> = { "7j": 7, "30j": 30, "90j": 90 };

/** Douze barres au bureau, huit au téléphone : on lit les douze, on en cache quatre. */
export const SEMAINES_FRISE = 12;

/** Trois lignes sur la planche, et pas une de plus : c'est un classement, pas une liste. */
export const PLUS_CONSULTEES = 3;

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
  /** Les commandes de la fenêtre de même longueur qui précède celle affichée. */
  readonly creeesPeriodePrecedente: number;
  /**
   * Les commandes LIVRÉES de la période — la deuxième tuile du kit.
   *
   * Comptée sur `orders.status`, comme tout le reste de cette lecture : c'est
   * la position qui fait foi, le colis l'écrit quand il bouge et le vendeur
   * l'amorce avant la remise. La chercher sur `tracked_parcels` ferait
   * disparaître du compte les commandes sans colis attaché — la moitié d'entre
   * elles.
   */
  readonly commandesLivrees: number;
}

/** Une part du panneau « Transporteurs les plus utilisés ». */
export interface PartTransporteur {
  /** Le code du fournisseur de suivi, ou `null` s'il n'a pas été identifié. */
  readonly code: number | null;
  readonly nombre: number;
}

/** Ce que rend le panneau « Liens clients », jour par jour. */
export interface OuverturesDuJour {
  /** Le jour, en `AAAA-MM-JJ` : c'est la forme que rend la colonne générée. */
  readonly jour: string;
  readonly total: number;
}

/** Le temps moyen de livraison, et sur combien de colis il est calculé. */
export interface DelaiLivraison {
  /**
   * La moyenne en jours, à une décimale — `null` quand aucun colis n'a été
   * livré sur la période.
   *
   * `null` PLUTÔT QUE ZÉRO : « 0 jour » affirmerait une livraison instantanée,
   * l'absence de colis livré n'est pas une performance. Les deux se ressemblent
   * dans une tuile et se confondent d'une période à l'autre.
   */
  readonly jours: number | null;
  readonly colis: number;
}

/** Une semaine de la frise : son lundi, et ce qui y a été créé. */
export interface SemaineCreee {
  readonly debut: Date;
  readonly total: number;
}

/** Une ligne du classement des commandes les plus consultées. */
export interface CommandeConsultee {
  readonly id: string;
  readonly client: string | null;
  readonly reference: string | null;
  readonly vues: number;
  /** Vignette signée, ou `null` : l'absence de vignette est un cas normal. */
  readonly vignette: string | null;
}

/** Le début de la période affichée. */
export function debutPeriode(periode: Periode, maintenant: Date): Date {
  return new Date(maintenant.getTime() - JOURS[periode] * 86_400_000);
}

/**
 * Le début de la fenêtre PRÉCÉDENTE, de même longueur.
 *
 * Elle est fermée en haut par le début de la période courante — c'est la base
 * du « + N vs période précédente ». Deux fenêtres de longueurs différentes
 * produiraient un delta qui semble mesurer une tendance et mesure en fait la
 * différence de durée, exactement le genre de métrique faussée qui reste
 * crédible.
 */
export function debutPeriodePrecedente(periode: Periode, maintenant: Date): Date {
  return new Date(maintenant.getTime() - 2 * JOURS[periode] * 86_400_000);
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
 * La part des commandes qui portent un numéro de suivi.
 *
 * Le brief en fait une métrique de verdict à part entière : au-delà de 80 %, le
 * suivi est utilisé. Elle se rendait jusqu'ici en nombre absolu, ce qui ne se
 * compare à aucun seuil — « 40 » ne dit rien sans « sur 47 ».
 */
export function partAvecSuivi(activite: Activite): number | null {
  if (activite.commandesCreees === 0) return null;
  return Math.round((activite.avecSuivi / activite.commandesCreees) * 100);
}

/**
 * Les commandes jamais ouvertes par leur destinataire.
 *
 * `null` sans aucune commande : « 0 jamais ouverte » se lirait comme un succès
 * alors qu'il n'y a rien à ouvrir.
 */
export function jamaisOuvertes(activite: Activite): number | null {
  if (activite.commandesCreees === 0) return null;
  return activite.commandesCreees - activite.commandesOuvertes;
}

/**
 * L'écart avec la période précédente.
 *
 * `null` quand la période précédente est vide ET la courante aussi : il n'y a
 * alors rien à comparer, et « +0 » affirmerait une stabilité qui n'existe pas.
 */
export function ecartPeriodePrecedente(activite: Activite): number | null {
  if (activite.commandesCreees === 0 && activite.creeesPeriodePrecedente === 0) return null;
  return activite.commandesCreees - activite.creeesPeriodePrecedente;
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
): Promise<Activite | null> {
  const { data, error } = await supabase.rpc("analyser_activite", {
    p_depuis: debutPeriode(periode, maintenant).toISOString(),
    p_precedent: debutPeriodePrecedente(periode, maintenant).toISOString(),
  });

  // ⚠️ NI ZÉRO, NI 500. Le commentaire d'origine avait raison sur la moitié
  // du problème : *afficher des zéros ferait croire à un vendeur actif qu'il
  // n'a rien fait*. Mais lever emporte les TROIS autres lectures de l'écran,
  // qui n'ont rien à voir. La règle partagée nomme la panne et rend `null` ;
  // toute autre erreur continue de remonter.
  if (lectureIllisible({ error }, "de l'activité")) return null;
  if (error !== null || data === null) {
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
    creeesPeriodePrecedente: Number(l.creees_periode_precedente),
    commandesLivrees: Number(l.commandes_livrees),
  };
}

/**
 * LA RÉPARTITION PAR TRANSPORTEUR — le panneau que le kit dessine et que
 * l'écran n'avait pas.
 *
 * ⚠️ ELLE PASSE PAR UNE FONCTION SQL, ET CE N'EST PAS UN CONFORT. Les agrégats
 * groupés de PostgREST sont DÉSACTIVÉS sur ce projet — mesuré : un
 * `select=carrier_code,count()` répond « Use of aggregate functions is not
 * allowed ». Il ne restait qu'à lire les colis un par un pour les regrouper
 * ici, c'est-à-dire des dizaines de milliers de lignes au plafond du brief —
 * ou à les plafonner, et rendre une distribution TRONQUÉE présentée comme
 * complète. Le §11 nomme ce résultat : une métrique légèrement faussée est pire
 * qu'une métrique cassée, parce qu'elle reste crédible.
 *
 * LE NOM SE RÉSOUT DANS LE DÉPÔT, jamais en base : `carrier_code` est
 * l'identifiant numérique du fournisseur, et sa traduction vit dans
 * `lib/tracking/transporteurs.json`. L'écrire en base la figerait à la date de
 * la migration, alors que 17TRACK en ajoute.
 */
export async function lireTransporteurs(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
): Promise<readonly PartTransporteur[] | null> {
  const { data, error } = await supabase.rpc("repartir_transporteurs", {
    p_depuis: debutPeriode(periode, maintenant).toISOString(),
  });

  if (lectureIllisible({ error }, "des transporteurs")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture des transporteurs impossible : " + (error?.message ?? "vide"));
  }

  return data.map((l) => ({ code: l.carrier_code, nombre: Number(l.nombre) }));
}

/**
 * LE TEMPS MOYEN DE LIVRAISON — la cinquième tuile du kit.
 *
 * Mesuré entre le PREMIER et le DERNIER mouvement d'un colis livré, et pas
 * depuis la création de la commande : le vendeur peut coller un numéro trois
 * jours plus tard, et on mesurerait alors sa procrastination plutôt que le
 * trajet du colis.
 */
export async function lireDelaiLivraison(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
): Promise<DelaiLivraison | null> {
  const { data, error } = await supabase.rpc("delai_moyen_livraison", {
    p_depuis: debutPeriode(periode, maintenant).toISOString(),
  });

  if (lectureIllisible({ error }, "du délai de livraison")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture du délai impossible : " + (error?.message ?? "vide"));
  }

  const l = Array.isArray(data) ? data[0] : null;
  if (l === undefined || l === null) return { jours: null, colis: 0 };
  return { jours: l.jours === null ? null : Number(l.jours), colis: Number(l.colis) };
}

/**
 * LES OUVERTURES DE LIENS, JOUR PAR JOUR — le graphe « Liens clients ».
 *
 * ⚠️ LES JOURS SANS OUVERTURE SONT RENDUS, et c'est tout l'intérêt. Un graphe
 * qui saute les jours vides n'est plus un graphe : ses barres deviennent
 * équidistantes alors que le temps ne l'est pas, et une semaine morte se lit
 * comme une semaine pleine. C'est la fonction SQL qui pose la grille, pas ce
 * module — la remplir ici demanderait de connaître le fuseau de la base.
 *
 * ⚠️ C'EST LA LECTURE LA PLUS LOURDE DE L'ÉCRAN, et sa borne est écrite dans la
 * migration 146 : la période choisie, une seule boutique par la RLS, et un
 * index qui couvre exactement sa jointure. L'écran des analyses n'est pas le
 * chemin chaud du produit — la liste des commandes l'est.
 */
export async function lireOuverturesParJour(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
): Promise<readonly OuverturesDuJour[] | null> {
  /* LA BORNE EST UNE DATE, PAS UN INSTANT : `viewed_on` est une colonne
     générée qui porte un JOUR, et lui comparer un `timestamptz` ferait
     retomber la moitié des lignes du premier jour hors de la fenêtre. */
  const jour = (d: Date): string => d.toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("compter_ouvertures_par_jour", {
    p_depuis: jour(debutPeriode(periode, maintenant)),
    p_jusqu_a: jour(maintenant),
  });

  if (lectureIllisible({ error }, "des ouvertures")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture des ouvertures impossible : " + (error?.message ?? "vide"));
  }

  return data.map((l) => ({ jour: l.jour, total: Number(l.total) }));
}

/**
 * La frise des commandes créées, semaine par semaine.
 *
 * ⚠️ ELLE NE DÉPEND PAS DE LA PÉRIODE CHOISIE, et c'est voulu. Une frise de
 * douze semaines réduite à une semaine quand le vendeur clique « 7 jours »
 * n'aurait plus rien d'une tendance : elle montrerait une barre. Le graphique
 * répond à « est-ce que ça monte ? », les compteurs du haut répondent à
 * « combien sur cette période » — deux questions, deux fenêtres.
 */
export async function lireSemaines(
  supabase: ClientLecture,
  maintenant: Date,
  semaines: number = SEMAINES_FRISE,
): Promise<readonly SemaineCreee[] | null> {
  const { data, error } = await supabase.rpc("compter_commandes_par_semaine", {
    p_fin: maintenant.toISOString(),
    p_semaines: semaines,
  });

  if (lectureIllisible({ error }, "de la frise")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture de la frise impossible : " + (error?.message ?? "réponse vide"));
  }

  return data.map((l) => ({ debut: new Date(l.debut), total: Number(l.total) }));
}

/**
 * Les commandes les plus consultées de la période.
 *
 * BORNÉE À LA PÉRIODE, comme les compteurs : un bloc qui ne bougerait pas quand
 * le vendeur change de fenêtre passerait pour figé, et le classement de
 * l'année écrase par construction celui de la semaine.
 *
 * ⚠️ UN ÉCHEC DE SIGNATURE N'EST PAS UNE ERREUR D'ÉCRAN. Une vignette manquante
 * laisse un aplat ; une lecture de commandes qui échoue, elle, remonte.
 */
export async function lirePlusConsultees(
  supabase: ClientLecture,
  periode: Periode,
  maintenant: Date,
  limite: number = PLUS_CONSULTEES,
): Promise<readonly CommandeConsultee[] | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_label, product_ref, views_count, cover_media_id, media_count")
    .gte("created_at", debutPeriode(periode, maintenant).toISOString())
    .not("first_content_at", "is", null)
    .gt("views_count", 0)
    // Le tri secondaire est celui de l'index : à égalité de vues, sans lui,
    // l'ordre serait celui que la base renvoie, c'est-à-dire aucun — le
    // classement changerait d'un rafraîchissement à l'autre.
    .order("views_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);

  if (lectureIllisible({ error }, "des plus consultées")) return null;
  if (error !== null || data === null) {
    throw new Error("lecture des plus consultées impossible : " + (error?.message ?? "vide"));
  }

  const vignettes = await lireVignettes(supabase, data);

  return data.map((l) => ({
    id: l.id,
    client: l.customer_label,
    reference: l.product_ref,
    vues: Number(l.views_count),
    vignette: vignettes.get(l.id) ?? null,
  }));
}

/**
 * Les vignettes de couverture des lignes du classement.
 *
 * MÊME RÈGLE QUE LA LISTE DES COMMANDES : la couverture désignée prime sur le
 * premier média, parce que la désigner est un geste explicite de l'éditeur.
 * La requête est bornée à deux lignes par commande au pire, et le classement
 * n'en compte que trois.
 */
async function lireVignettes(
  supabase: ClientLecture,
  commandes: readonly { id: string; cover_media_id: string | null; media_count: number }[],
): Promise<Map<string, string>> {
  const parVignette = new Map<string, string>();

  const avecMedia = commandes.filter((c) => c.media_count > 0);
  if (avecMedia.length === 0) return parVignette;

  const couvertures = avecMedia
    .map((c) => c.cover_media_id)
    .filter((v): v is string => v !== null);

  let requete = supabase
    .from("order_media")
    // `type` ET `cle` EN PLUS : la cle d apercu peut retomber sur l image
    // pleine quand la derivee manque. Voir `cleDApercu`.
    .select("id, order_id, type, cle, cle_vignette")
    .in(
      "order_id",
      avecMedia.map((c) => c.id),
    );

  // ⚠️ `id.in.()` AVEC UNE LISTE VIDE EST UNE ERREUR DE SYNTAXE PostgREST, pas
  // un ensemble vide — et « aucune couverture désignée » est le cas courant.
  requete =
    couvertures.length === 0
      ? requete.eq("position", 0)
      : requete.or("position.eq.0,id.in.(" + couvertures.join(",") + ")");

  const { data, error } = await requete;
  if (error !== null || data === null) return parVignette;

  const cles = new Map<string, string>();
  for (const commande of avecMedia) {
    const couverture =
      commande.cover_media_id === null
        ? undefined
        : data.find((m) => m.id === commande.cover_media_id);
    const retenu = couverture ?? data.find((m) => m.order_id === commande.id);
    const cle = retenu === undefined ? null : cleDApercu(retenu);
    if (cle !== null) cles.set(commande.id, cle);
  }

  const signees = await Promise.all(
    [...cles].map(async ([id, cle]) => [id, await signerLecture(cle).catch(() => null)] as const),
  );

  for (const [id, url] of signees) {
    if (url !== null) parVignette.set(id, url);
  }

  return parVignette;
}

export function analyserParametres(
  recherche: Record<string, string | string[] | undefined>,
): ParametresAnalyses {
  const v = recherche["periode"];
  return ParametresAnalyses.parse({ periode: Array.isArray(v) ? v[0] : v });
}
