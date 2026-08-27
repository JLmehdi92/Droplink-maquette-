import "server-only";
import { z } from "zod";
import { creerClientServeur } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types-base";

type StatutExpedition = Database["public"]["Enums"]["order_status"];
type StatutQc = Database["public"]["Enums"]["qc_status"];

export const STATUTS_EXPEDITION = [
  "preparation",
  "expedie",
  "en_transit",
  "livre",
] as const satisfies readonly StatutExpedition[];

export const STATUTS_QC = [
  "en_attente",
  "approuve",
  "refuse",
] as const satisfies readonly StatutQc[];

/*
 * `jamais-ouvert` est un TRI et pas un filtre de plus, parce que c'est ainsi que
 * le vendeur y pense : « montre-moi ce que mes clients n'ont pas encore vu ».
 * Il restreint donc ET ordonne, exactement comme l'index partiel posé pour lui.
 */
/*
 * `bloquees` suit la même logique, et c'est le tri qui fait gagner du temps : il
 * répond à « quels colis dois-je relancer ». Il restreint aux commandes EN
 * TRANSIT dont le colis a bougé PUIS s'est arrêté, et les ordonne du plus
 * ancien mouvement au plus récent — donc le plus immobile en tête.
 *
 * IL EXIGE UN MOUVEMENT DÉJÀ CONSTATÉ, et ce n'est pas un contournement
 * technique : un colis qui n'a jamais bougé n'est pas bloqué, il n'est pas
 * encore parti. Les mélanger noierait les vrais blocages sous les commandes
 * fraîchement expédiées, c'est-à-dire supprimerait l'information que ce tri
 * existe pour donner.
 */
export const TRIS = ["recentes", "anciennes", "modifiees", "jamais-ouvert", "bloquees"] as const;
export type Tri = (typeof TRIS)[number];

/** Cinquante lignes : la valeur mesurée au plafond, pas un chiffre choisi à vue. */
export const PAR_PAGE = 50;

/**
 * Paramètres de la liste, tels qu'ils arrivent de l'URL.
 *
 * ZOD SUR TOUTE ENTRÉE EXTERNE, y compris « ce qui vient de notre formulaire ».
 * Ces valeurs viennent d'une barre d'adresse : n'importe qui peut y écrire
 * n'importe quoi. Le curseur en particulier revient du client et retourne dans
 * une comparaison SQL — il est décodé, puis validé champ par champ.
 *
 * `catch` plutôt que `default` : une valeur invalide est ramenée au défaut au
 * lieu de faire échouer l'analyse entière. Un lien tronqué recopié depuis une
 * conversation doit ouvrir la liste, pas une erreur.
 */
export const ParametresListe = z.object({
  q: z.string().trim().max(120).catch(""),
  statut: z.enum(STATUTS_EXPEDITION).nullable().catch(null),
  qc: z.enum(STATUTS_QC).nullable().catch(null),
  tri: z.enum(TRIS).catch("recentes"),
  archivees: z.boolean().catch(false),
  curseur: z.string().max(120).nullable().catch(null),
});

export type ParametresListe = z.infer<typeof ParametresListe>;

/** Une ligne de la liste. `internal_notes` n'y figure PAS : elle porte le prix d'achat. */
export interface LigneCommande {
  readonly id: string;
  readonly jetonPublic: string;
  readonly client: string | null;
  readonly reference: string | null;
  readonly numeroSuivi: string | null;
  readonly statut: StatutExpedition;
  readonly qc: StatutQc;
  readonly creeeLe: string;
  readonly modifieeLe: string;
  readonly archiveeLe: string | null;
  /**
   * Vues DÉDUPLIQUÉES : un visiteur, un jour. Lue sur la commande et non agrégée
   * depuis `link_views` — mesuré, l'agrégat lisait vingt fois plus de lignes.
   */
  readonly vues: number;
  readonly derniereVueLe: string | null;
  /**
   * Dernier mouvement rapporté par le TRANSPORTEUR, dénormalisé sur la commande.
   *
   * Distinct de `modifieeLe`, et la distinction est le cœur du sujet :
   * `modifieeLe` dit quand le VENDEUR a touché la commande, celui-ci dit quand
   * le COLIS a bougé. Les confondre ferait remonter les deux cents commandes
   * d'un vendeur en tête du tri « modifiées » à chaque passage de cadence.
   */
  readonly colisBougeLe: string | null;
}

/**
 * POURQUOI LA PAGE EST VIDE — mesuré, jamais déduit.
 *
 * Il y a TROIS raisons, pas deux, et la troisième a été trouvée en pilotant le
 * produit : un compte dont TOUTES les commandes sont archivées. L'écran
 * affichait alors « aucune ne passe les filtres en cours » ALORS QU'AUCUN FILTRE
 * N'ÉTAIT POSÉ, et proposait « Tout effacer » vers l'adresse déjà ouverte —
 * c'est-à-dire un bouton qui ne fait rien. Le produit avait raison sur les
 * données et mentait sur la cause.
 *
 * Le diagnostic est LU EN BASE et non déduit de « aucun filtre donc archivé ».
 * Une déduction de ce genre reste vraie tant que personne n'ajoute un filtre à
 * `lireCommandes` sans l'ajouter à `listeFiltree` — c'est-à-dire qu'elle tient
 * par une ABSENCE (L-029). Deux lectures d'UNE ligne, et seulement quand la page
 * est vide, coûtent moins que ce sursis.
 */
export type DiagnosticListeVide =
  /** Le compte n'a aucune commande, archivées comprises. */
  | "aucune-commande"
  /** Il existe des commandes, et AUCUNE n'est active : tout est archivé. */
  | "tout-archive"
  /** Des commandes actives existent, mais aucune ne passe les critères. */
  | "filtre-trop-etroit";

export interface PageCommandes {
  readonly lignes: readonly LigneCommande[];
  /** Curseur de la page suivante, ou `null` s'il n'y en a pas. */
  readonly suivant: string | null;
  /**
   * Pourquoi la page ne contient rien, ou `null` quand elle contient quelque
   * chose — la question ne se pose alors pas, et un booléen l'aurait fait
   * répondre quand même.
   */
  readonly diagnostic: DiagnosticListeVide | null;
}

/**
 * Colonnes lues.
 *
 * La liste est ÉNUMÉRÉE, jamais `select("*")`. Une colonne ajoutée plus tard à
 * la table — une note, un prix, un email — se retrouverait sinon dans la charge
 * d'hydratation de l'écran sans que personne n'ait pris la décision de l'y
 * mettre. Ce qui n'est pas demandé ne peut pas fuiter.
 */
/*
 * `views_count` et `last_viewed_at` sont PORTÉS PAR LA COMMANDE (migration 027),
 * pas agrégés depuis `link_views`. Mesuré au plafond : la jointure latérale
 * lisait 1 021 lignes pour en afficher cinquante, et le tri « jamais ouvert »
 * montait à 500 ms chez un vendeur dont TOUT avait été ouvert. Lus ici, ils ne
 * coûtent rien de plus que la ligne elle-même.
 *
 * La liste reste une CHAÎNE LITTÉRALE d'un seul tenant : PostgREST en déduit le
 * type du résultat, et la découper par concaténation fait retomber tout l'objet
 * sur un type d'erreur — le typage cesse alors de vérifier quoi que ce soit.
 */
export const COLONNES =
  "id, public_token, customer_label, product_ref, tracking_number, status, qc_status, views_count, last_viewed_at, created_at, updated_at, archived_at, parcel_last_movement_at";

/**
 * La valeur de tri d'une ligne, pour le curseur.
 *
 * ⚠️ EXHAUSTIVE PAR LE TYPAGE, et c'est délibéré. La version précédente
 * s'écrivait `colonne === "created_at" ? creeeLe : modifieeLe` : ajouter une
 * troisième colonne de tri l'aurait laissée compiler ET rendre silencieusement
 * la mauvaise valeur — donc un curseur qui compare une date de mouvement à une
 * date de modification, donc des lignes sautées ou répétées d'une page à
 * l'autre, sans la moindre erreur. Ici, une quatrième colonne ne compile pas.
 */
function valeurDeTri(
  colonne: "created_at" | "updated_at" | "parcel_last_movement_at",
  ligne: LigneCommande,
): string {
  switch (colonne) {
    case "created_at":
      return ligne.creeeLe;
    case "updated_at":
      return ligne.modifieeLe;
    case "parcel_last_movement_at":
      // Le tri `bloquees` exclut les valeurs absentes : cette branche ne peut
      // pas rendre la chaîne vide sur un jeu réel. On ne LÈVE pas pour autant —
      // un curseur vide fait recommencer la pagination, ce qui est gênant ;
      // une exception ferait disparaître l'écran.
      return ligne.colisBougeLe ?? "";
  }
}

/** Colonne de tri et sens, par tri demandé. */
function ordre(tri: Tri): {
  colonne: "created_at" | "updated_at" | "parcel_last_movement_at";
  croissant: boolean;
} {
  switch (tri) {
    case "anciennes":
      return { colonne: "created_at", croissant: true };
    case "modifiees":
      return { colonne: "updated_at", croissant: false };
    case "bloquees":
      // CROISSANT : le mouvement le plus ANCIEN vient en tête, donc le colis le
      // plus immobile. C'est aussi l'ordre de l'index partiel `orders_bloquees_idx`
      // — l'inverser le rendrait inutilisable sans que rien ne le signale.
      return { colonne: "parcel_last_movement_at", croissant: true };
    case "jamais-ouvert":
    // Même ordre que `recentes` : ce tri restreint, il ne réordonne pas. C'est
    // aussi l'ordre de l'index partiel posé pour lui, et un ordre différent le
    // rendrait inutilisable sans que rien ne le signale.
    case "recentes":
      return { colonne: "created_at", croissant: false };
  }
}

/**
 * Encode un curseur.
 *
 * Il transporte la valeur de tri ET l'identifiant, parce que deux commandes
 * peuvent partager la même seconde : sans départage, la page suivante
 * réafficherait ou sauterait les lignes de la frontière. Le contenu n'est pas un
 * secret — ce sont des données que l'appelant vient de recevoir — mais il est
 * encodé pour survivre à un aller-retour dans une URL.
 */
export function encoderCurseur(valeur: string, id: string): string {
  return Buffer.from(valeur + "|" + id, "utf8").toString("base64url");
}

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

  // CES DEUX VALEURS RETOURNENT DANS UNE EXPRESSION `or=` EN SYNTAXE POSTGREST,
  // dont la grammaire emploie la virgule, le point et les parenthèses. Les
  // valider « en gros » ne suffit donc pas : il faut interdire ces caractères.
  //
  // `Date.parse` a été écarté après vérification — il ACCEPTE
  // « Dec 31, 2025 (UTC) », qui porte les trois. Un curseur forgé aurait alors
  // pu prolonger l'expression de filtre avec un terme de son choix.
  //
  // La RLS resterait la dernière ligne : elle borne à la boutique de l'appelant
  // quoi qu'il arrive. Mais une protection qui tient à ce qu'une AUTRE couche
  // rattrape n'est pas une protection — c'est un sursis.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  // Le décalage horaire s'écrit `+00:00`, `+0000` OU `+00` : PostgREST rend la
  // troisième forme, et l'oublier refusait un curseur parfaitement valide — ce
  // qui aurait renvoyé le vendeur à la première page à chaque « page suivante ».
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/.test(valeur)) {
    return null;
  }

  return { valeur, id };
}

/**
 * Replie une saisie comme le fait la colonne générée en base.
 *
 * Le repli doit être le MÊME des deux côtés : si la colonne retire les accents
 * et que la saisie les garde, chercher « Crème » ne trouve rien alors que la
 * commande existe — et le défaut reste invisible tant qu'on ne tape que des mots
 * sans accent, c'est-à-dire pendant tout le développement.
 *
 * Les caractères auxquels un motif `like` donne un sens sont neutralisés : une
 * recherche sur « 100% coton » ne doit pas se transformer en joker. `*` en fait
 * partie — PostgREST le traduit en `%`, ce qui n'est écrit nulle part dans le
 * code appelant.
 */
export function motifRecherche(saisie: string): string {
  const replie = saisie
    .normalize("NFD")
    // Bloc « Combining Diacritical Marks » : c'est ce que NFD isole des lettres.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  return replie.replace(/[\\%_*]/g, (c) => "\\" + c);
}

/**
 * Lit une page de commandes.
 *
 * PAGINATION PAR CURSEUR, jamais par décalage. À la page 40 d'un jeu de 9 600, un
 * `offset` fait lire 2 000 lignes pour en rendre 50 : le coût croît avec le
 * numéro de page, donc l'inconfort arrive chez celui qui a le plus de données —
 * exactement le vendeur qu'on veut garder. Mesuré : première page et page 180
 * lisent le même nombre de lignes.
 *
 * AUCUN COMPTAGE EXACT. Un `count` complet lit toutes les lignes du compte et ne
 * se rattrape par aucun index (L-017). On demande une ligne de plus que la page
 * pour savoir s'il existe une suite — c'est la seule information dont l'écran a
 * besoin.
 *
 * LECTURE SOUS RLS, avec la session. Le `shop_id` n'est écrit NULLE PART dans
 * cette requête : c'est la policy qui le pose. Un filtre applicatif ajouté ici
 * donnerait l'illusion d'une protection tout en masquant son absence le jour où
 * quelqu'un l'oublierait ailleurs.
 */
export type ClientLecture = Awaited<ReturnType<typeof creerClientServeur>>;

export async function lireCommandes(
  parametres: ParametresListe,
  // Injecté UNIQUEMENT par les tests d'isolation, qui doivent éprouver CETTE
  // fonction avec un utilisateur réellement authentifié — un test qui rejouerait
  // une requête équivalente prouverait que la copie est correcte, pas le produit
  // (L-032). Le défaut reste le client à session : aucun appel de l'application
  // ne passe d'argument, et le client service-role n'a pas ce type.
  client?: ClientLecture,
): Promise<PageCommandes> {
  const supabase = client ?? (await creerClientServeur());
  const { colonne, croissant } = ordre(parametres.tri);

  let requete = supabase.from("orders").select(COLONNES);

  requete =
    parametres.archivees
      ? requete.not("archived_at", "is", null)
      : requete.is("archived_at", null);

  // Le tri « jamais ouvert » RESTREINT. Il s'appuie sur le compteur porté par la
  // commande, jamais sur une anti-jointure : mesurée au plafond, celle-ci coûtait
  // 500 ms et 48 001 lignes lues chez un vendeur dont tout avait été ouvert.
  if (parametres.tri === "jamais-ouvert") requete = requete.eq("views_count", 0);

  // Le tri « bloqué en transit » restreint AUX DEUX CONDITIONS de son index
  // partiel — sans quoi le planificateur ne peut pas s'en servir, et la
  // dégradation reste invisible tant qu'un vendeur n'a pas beaucoup de lignes.
  //
  // Le `not is null` sert aussi la pagination : la comparaison de couple du
  // curseur ne sait pas ordonner un NULL, et une page dont la frontière tombe
  // sur une valeur absente sauterait des lignes en silence.
  if (parametres.tri === "bloquees") {
    requete = requete.eq("status", "en_transit").not("parcel_last_movement_at", "is", null);
  }

  if (parametres.statut !== null) requete = requete.eq("status", parametres.statut);
  if (parametres.qc !== null) requete = requete.eq("qc_status", parametres.qc);

  if (parametres.q !== "") {
    requete = requete.like("recherche", "%" + motifRecherche(parametres.q) + "%");
  }

  if (parametres.curseur !== null) {
    const point = decoderCurseur(parametres.curseur);
    if (point !== null) {
      // Comparaison de COUPLE : `(colonne, id) < (valeur, id)`. PostgREST ne sait
      // pas l'écrire d'un trait ; on la compose avec un `or` dont le second
      // terme départage l'égalité. Équivalent logique, même index.
      const op = croissant ? "gt" : "lt";
      requete = requete.or(
        colonne +
          "." +
          op +
          "." +
          point.valeur +
          ",and(" +
          colonne +
          ".eq." +
          point.valeur +
          ",id." +
          op +
          "." +
          point.id +
          ")",
      );
    }
  }

  const { data, error } = await requete
    .order(colonne, { ascending: croissant })
    .order("id", { ascending: croissant })
    .limit(PAR_PAGE + 1);

  if (error !== null || data === null) {
    // Jamais de `catch` muet : un échec de lecture doit remonter, sinon l'écran
    // affiche « aucune commande » à un vendeur qui en a neuf mille.
    throw new Error("lecture des commandes impossible : " + (error?.message ?? "réponse vide"));
  }

  const trop = data.length > PAR_PAGE;
  const visibles = trop ? data.slice(0, PAR_PAGE) : data;

  const lignes: LigneCommande[] = visibles.map((l) => ({
    id: l.id,
    jetonPublic: l.public_token,
    client: l.customer_label,
    reference: l.product_ref,
    numeroSuivi: l.tracking_number,
    statut: l.status,
    qc: l.qc_status,
    creeeLe: l.created_at,
    modifieeLe: l.updated_at,
    archiveeLe: l.archived_at,
    vues: l.views_count,
    derniereVueLe: l.last_viewed_at,
    colisBougeLe: l.parcel_last_movement_at,
  }));

  const derniere = lignes[lignes.length - 1];
  const suivant =
    trop && derniere !== undefined
      ? encoderCurseur(valeurDeTri(colonne, derniere), derniere.id)
      : null;

  return {
    lignes,
    suivant,
    diagnostic: lignes.length === 0 ? await diagnostiquerVide(supabase) : null,
  };
}

/**
 * Établit POURQUOI la page est vide, en deux lectures d'UNE ligne.
 *
 * Afficher « créez votre première commande » à un vendeur qui en a neuf mille
 * est une perte de confiance immédiate ; lui dire que ses filtres excluent tout
 * alors qu'il n'en a posé aucun l'est tout autant, parce qu'il cherche alors un
 * filtre qui n'existe pas.
 *
 * La question ne se pose QUE lorsque la page est vide, et se répond en lisant
 * une ligne — jamais en comptant : un `count` complet lit toutes les lignes du
 * compte et ne se rattrape par aucun index (L-017).
 *
 * SUR ÉCHEC DE LECTURE, on rend « filtre trop étroit », qui est l'affirmation la
 * plus faible des trois : elle n'invente ni un compte vide — ce qui proposerait
 * de créer une première commande à qui en a des milliers — ni un archivage que
 * personne n'a constaté.
 */
async function diagnostiquerVide(
  supabase: Awaited<ReturnType<typeof creerClientServeur>>,
): Promise<DiagnosticListeVide> {
  const [toutes, actives] = await Promise.all([
    supabase.from("orders").select("id").limit(1),
    supabase.from("orders").select("id").is("archived_at", null).limit(1),
  ]);

  if (toutes.error !== null || toutes.data === null) return "filtre-trop-etroit";
  if (toutes.data.length === 0) return "aucune-commande";

  if (actives.error !== null || actives.data === null) return "filtre-trop-etroit";
  if (actives.data.length === 0) return "tout-archive";

  return "filtre-trop-etroit";
}

/**
 * Analyse les paramètres d'URL de la liste.
 *
 * Séparé de la lecture pour être testable sans base : c'est la surface qu'un
 * visiteur peut écrire lui-même, donc celle qu'il faut pouvoir éprouver au
 * caractère près.
 */
export function analyserParametres(
  brut: Record<string, string | string[] | undefined>,
): ParametresListe {
  const seul = (clef: string): string | undefined => {
    const v = brut[clef];
    return Array.isArray(v) ? v[0] : v;
  };

  return ParametresListe.parse({
    q: seul("q") ?? "",
    statut: seul("statut") ?? null,
    qc: seul("qc") ?? null,
    tri: seul("tri") ?? "recentes",
    archivees: seul("archivees") === "1",
    curseur: seul("curseur") ?? null,
  });
}

/**
 * LES QUATRE COMPTEURS DE TÊTE D'ÉCRAN.
 *
 * UN SEUL APPEL POUR QUATRE NOMBRES qui s'affichent ensemble : quatre allers et
 * retours coûteraient quatre fois la latence réseau sur l'écran le plus ouvert
 * du produit. La fonction est `security invoker` — la RLS s'applique, elle ne
 * voit que les commandes de son appelant.
 *
 * `null` EN CAS D'ÉCHEC, et l'écran omet alors la rangée. Il ne rend pas des
 * zéros : zéro affirme qu'on a compté et trouvé rien, ce qui est faux, et c'est
 * précisément le genre de nombre crédible qui fait décider de travers.
 */
export interface CompteursListe {
  readonly preparation: number;
  readonly enTransit: number;
  readonly jamaisOuvertes: number;
  readonly livrees: number;
}

export async function compterParEtat(): Promise<CompteursListe | null> {
  const supabase = await creerClientServeur();
  const { data, error } = await supabase.rpc("compter_commandes_par_etat");
  if (error !== null || data === null) return null;

  const ligne = Array.isArray(data) ? data[0] : data;
  if (ligne === undefined || ligne === null) return null;

  return {
    preparation: Number(ligne.preparation),
    enTransit: Number(ligne.en_transit),
    jamaisOuvertes: Number(ligne.jamais_ouvertes),
    livrees: Number(ligne.livrees),
  };
}
