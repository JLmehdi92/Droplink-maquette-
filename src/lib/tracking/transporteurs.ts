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
 * Le poids — 98 Ko — ne coûte rien au navigateur : les deux écrans qui s'en
 * servent sont rendus entièrement côté serveur.
 */
/*
 * ⚠️ LE JSON EST TYPÉ `string[]`, PAS `[string, string]`, et le forcer d'un
 * trait serait un mensonge de typage : TypeScript ne peut pas savoir que chaque
 * entrée porte exactement deux éléments. On lit donc les cases une par une, en
 * traitant l'absence comme un cas normal — si une entrée était malformée, la
 * fonction rendrait `null` plutôt que `undefined` déguisé en `string`.
 */
const TABLE = catalogue as Record<string, readonly string[]>;

export interface Transporteur {
  readonly nom: string;
  /** Code pays ISO du transporteur, quand la source le donne. */
  readonly pays: string | null;
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
  const e = TABLE[String(code)];
  if (e === undefined) return null;
  const nom = e[0];
  if (nom === undefined || nom === "") return null;
  const pays = e[1];
  return { nom, pays: pays === undefined || pays === "" ? null : pays };
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
