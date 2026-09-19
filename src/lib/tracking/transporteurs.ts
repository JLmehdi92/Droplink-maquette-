import "server-only";
import catalogue from "./transporteurs.json";

/**
 * LE CATALOGUE DES TRANSPORTEURS — code numérique du fournisseur de suivi vers
 * son NOM.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE DEUX ÉCRANS DISAIENT « AUCUN CATALOGUE NE LE
 * TRADUIT », ET QUE C'ÉTAIT VRAI SANS ÊTRE UNE FATALITÉ. `carrier_code` est
 * l'identifiant numérique de 17TRACK — « 3011 », « 100003 » — et les deux
 * tableaux refusaient donc d'afficher la colonne « Transporteur » que le design
 * system dessine, au motif qu'un code brut n'apprend rien à personne. Le
 * raisonnement tenait ; la conclusion, non : la correspondance existe, elle est
 * publiée, il suffisait d'aller la chercher.
 *
 * ⚠️ ELLE EST RECOPIÉE D'UNE SOURCE OFFICIELLE, JAMAIS RECONSTITUÉE DE MÉMOIRE.
 * `transporteurs.json` vient de la liste publique de 17TRACK
 * (`res.17track.net/asset/carrier/info/apicarrier.all.json`), 3 502 entrées,
 * figées dans le dépôt. Écrire « 100003 = DHL » de tête aurait produit un
 * mensonge affiché à côté d'un vrai numéro de colis — pire que la colonne vide
 * qu'on remplace. C'est la même règle que pour les logos de marques tierces :
 * la source officielle, ou rien.
 *
 * ⚠️ ET AUCUNE REQUÊTE À L'EXÉCUTION. Le fichier est lu depuis le disque, côté
 * serveur uniquement (`server-only`). Une librairie qui irait chercher sa table
 * chez un tiers échouerait en silence derrière un pare-feu, et la colonne
 * disparaîtrait sans que rien ne le dise.
 *
 * Le poids — 157 Ko — ne coûte rien au navigateur : les deux écrans qui s'en
 * servent sont rendus entièrement côté serveur.
 */
/*
 * ⚠️ LE JSON EST TYPÉ `string[]`, PAS UN TRIPLET, et le forcer d'un trait serait
 * un mensonge de typage : TypeScript ne peut pas savoir que chaque entrée porte
 * exactement trois éléments — nom, pays, site. On lit donc les cases une par
 * une, en traitant l'absence comme un cas normal : si une entrée était
 * malformée, la fonction rendrait `null` plutôt qu'un `undefined` déguisé en
 * `string`.
 */
const TABLE = catalogue as Record<string, readonly string[]>;

/*
 * ⚠️ LES PLATEFORMES D'ACHAT DE LA LISTE NE SONT PAS DES TRANSPORTEURS À NOMMER (audit du
 * 20/09/2026). La liste du fournisseur de suivi range une plateforme d'achat du vertical parmi
 * ses 3 502 « transporteurs » (code 190837). Si le fournisseur détectait ce code, son nom
 * s'afficherait dans les envois, les analyses, le tableau de bord, l'export CSV et
 * l'administration — la contrainte n° 2 interdit tout nom d'agent dans l'interface. Le code
 * est traité comme INCONNU : la cellule reste vide, comme pour tout code que la liste ignore.
 * `tests/unit/vocabulaire.test.ts` inventorie chaque nom rendu : une liste régénérée qui en
 * ajouterait un autre rougirait là.
 */
const PLATEFORMES_D_ACHAT: ReadonlySet<string> = new Set(["190837"]);

export interface Transporteur {
  readonly nom: string;
  /** Code pays ISO du transporteur, quand la source le donne. */
  readonly pays: string | null;
  /**
   * Le site officiel du transporteur, quand la source en donne un EN HTTPS.
   *
   * ⚠️ C'EST LE SITE, PAS LA PAGE DU COLIS, et le libellé de l'écran doit le
   * dire. Aucune source ne donne le gabarit d'URL de suivi par transporteur ;
   * fabriquer « site + /track?n=NUMÉRO » marcherait pour trois transporteurs et
   * produirait une page d'erreur pour les 3 499 autres. Le lien mène donc à
   * l'accueil, et le vendeur y recolle son numéro — ce qu'il fait déjà
   * aujourd'hui, à ceci près qu'il n'a plus à chercher le bon site.
   *
   * ⚠️ ET SEULEMENT EN HTTPS : 1 913 entrées sur 3 502. Un lien en clair depuis
   * une page authentifiée serait bloqué par la politique de sécurité du
   * document, sans rien afficher au vendeur.
   */
  readonly site: string | null;
}

/**
 * Rend le transporteur, ou `null` si le code est inconnu ou absent.
 *
 * ⚠️ `null` EST UNE RÉPONSE, PAS UN ÉCHEC À MASQUER. Un code que la liste ne
 * connaît pas — 17TRACK en ajoute — ne doit pas produire « Transporteur
 * inconnu » sur la ligne : *une information absente est OMISE, jamais remplacée
 * par un texte de remplacement*. L'écran laisse alors la cellule vide.
 */
export function lireTransporteur(code: number | null): Transporteur | null {
  if (code === null) return null;
  if (PLATEFORMES_D_ACHAT.has(String(code))) return null;
  const e = TABLE[String(code)];
  if (e === undefined) return null;
  const nom = e[0];
  if (nom === undefined || nom === "") return null;
  const pays = e[1];
  const site = e[2];
  return {
    nom,
    pays: pays === undefined || pays === "" ? null : pays,
    site: site === undefined || site === "" ? null : site,
  };
}

/**
 * LES COULEURS DE MONOGRAMME DU DESIGN SYSTEM, relevées dans `ShippingView`.
 *
 * Le kit le dit lui-même dans son source : « No carrier logos were supplied, so
 * each is a coloured tile with its initials ». Ce ne sont donc PAS des logos
 * reconstitués — c'est un dessin du design system, qu'on reprend à l'identique.
 * Les transporteurs qu'il ne dessine pas prennent son propre repli : fond creux,
 * encre de corps, initiales.
 */
const MONOGRAMMES: Record<string, { readonly fond: string; readonly encre: string; readonly court: string }> = {
  "La Poste": { fond: "#FFD400", encre: "#0B0B18", court: "LP" },
  DHL: { fond: "#FFCC00", encre: "#D40511", court: "DHL" },
  DPD: { fond: "#DC0032", encre: "#FFFFFF", court: "DPD" },
  Chronopost: { fond: "#00A3E0", encre: "#FFFFFF", court: "CP" },
  UPS: { fond: "#351C15", encre: "#FFB500", court: "UPS" },
  "Relais Colis": { fond: "#8CC63F", encre: "#FFFFFF", court: "RC" },
  "SF Express": { fond: "#0B0B18", encre: "#FFFFFF", court: "SF" },
  FedEx: { fond: "#4D148C", encre: "#FF6600", court: "FX" },
  Colissimo: { fond: "#FFD400", encre: "#0B0B18", court: "CO" },
};

export interface Monogramme {
  readonly fond: string | null;
  readonly encre: string | null;
  readonly court: string;
}

/**
 * Le monogramme d'un transporteur : les couleurs du kit s'il les donne, son
 * repli sinon.
 *
 * Le repli rend `null` pour les deux couleurs plutôt qu'une valeur en dur :
 * c'est l'appelant qui pose alors les classes du design system, et une couleur
 * écrite ici échapperait au thème.
 */
export function monogramme(nom: string): Monogramme {
  const m = MONOGRAMMES[nom];
  if (m !== undefined) return m;
  /* Deux lettres, comme le kit — et les majuscules viennent du NOM, pas d'une
     transformation CSS : `text-transform` sur une initiale accentuée rend un
     résultat différent selon la locale du navigateur. */
  return { fond: null, encre: null, court: nom.slice(0, 2).toUpperCase() };
}

/**
 * LES TRANSPORTEURS QUE L'ÉDITEUR PROPOSE, et seulement ceux-là.
 *
 * ⚠️ PAS LES 3 502. Une liste déroulante de trois mille entrées ne se parcourt
 * pas au pouce, et elle pèserait 157 Ko dans l'îlot client de l'éditeur. Le
 * champ ne sert qu'au cas où le fournisseur NE RECONNAÎT PAS le numéro : c'est
 * alors un transporteur courant de ceux qui vendent en direct — postes et
 * express d'Europe, expéditeurs depuis la Chine — qu'il faut pouvoir nommer.
 *
 * Les CODES viennent du catalogue officiel du dépôt, relevés le 18/09/2026, et
 * les NOMS sont lus dedans à l'exécution : rien n'est écrit de mémoire. Un code
 * qui disparaîtrait du catalogue disparaît de la liste au lieu d'y afficher un
 * nom inventé (`tests/unit/transporteurs-proposes.test.ts` exige qu'aucun ne
 * manque).
 */
export const CODES_PROPOSES: readonly number[] = [
  // France
  6051, 100273, 100304, 100461, 100027, 100072, 101272, 100029,
  // Europe et express
  100001, 7041, 100002, 100003, 19181, 2061, 14041, 19251, 9071, 11031, 100331, 21051,
  // Depuis la Chine
  3011, 3013, 190271, 190008, 190094, 190012, 100012, 190072, 100295,
];

export interface TransporteurPropose {
  /** Le code du fournisseur, en texte : c'est la valeur que porte `orders.carrier_code`. */
  readonly code: string;
  readonly nom: string;
}

/**
 * La liste de l'éditeur, triée par nom — plus le transporteur ACTUEL de la
 * commande s'il n'y figure pas, sans quoi la liste afficherait « détection
 * automatique » pour une commande qui porte un transporteur, c'est-à-dire
 * affirmerait ce que la base n'a pas (principe XII).
 *
 * Un code actuel NON NUMÉRIQUE (le texte libre de l'ancien champ) n'est pas
 * ajouté : la base le traite comme « détection automatique » (migration 164),
 * et c'est donc exactement ce que la liste doit montrer.
 */
export function transporteursProposes(actuel: string | null): readonly TransporteurPropose[] {
  const codes = new Set(CODES_PROPOSES.map(String));
  const code = (actuel ?? "").trim();
  if (/^[1-9][0-9]{0,8}$/.test(code)) codes.add(code);

  return [...codes]
    .map((c) => ({ code: c, nom: lireTransporteur(Number(c))?.nom ?? (c === code ? c : null) }))
    .filter((t): t is TransporteurPropose => t.nom !== null)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
}
