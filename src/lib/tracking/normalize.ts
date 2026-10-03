/**
 * NORMALISATION D'UN ÉTAT DE COLIS — module PUR, sans réseau, sans base.
 *
 * C'est le morceau du suivi qui décide ce que le client verra, et c'est aussi
 * celui qu'on ne peut pas éprouver en production sans attendre qu'un vrai colis
 * traverse la moitié du monde. Il est donc écrit sans aucune dépendance : on lui
 * donne un état, il rend une étape, et tout se teste à la milliseconde.
 *
 * TROIS RÈGLES, ET ELLES NE SE NÉGOCIENT PAS :
 *
 *  1. LE STATUT NE RECULE JAMAIS. Un client qui a lu « en transit » et qui lit
 *     « en préparation » le lendemain conclut que quelque chose s'est perdu.
 *     Les transporteurs, eux, reculent : un scan tardif arrive après un scan
 *     plus avancé, une correction d'erreur ramène un colis « en traitement ».
 *     C'est donc à nous de ne pas répercuter le recul.
 *  2. UN STATUT INCONNU NE FAIT RIEN BOUGER. Le fournisseur peut ajouter une
 *     valeur demain sans nous prévenir. La deviner reviendrait à inventer une
 *     position, et une position inventée est indiscernable d'une vraie.
 *  3. LE VENDEUR PRIME AVANT LA REMISE AU TRANSPORTEUR, LE TRANSPORTEUR APRÈS.
 *     Chacun est seul à savoir ce qu'il affirme : le vendeur sait qu'il prépare,
 *     le transporteur sait où est le colis. Tant que le transporteur ne dit rien
 *     de plus qu'« information reçue », c'est le vendeur qui décrit la réalité.
 */

/** Les quatre étapes de la frise, DANS L'ORDRE. L'ordre EST la règle. */
export const ETAPES = ["preparation", "expedie", "en_transit", "livre"] as const;
export type Etape = (typeof ETAPES)[number];

/** Rang d'une étape. C'est ce rang qui interdit le recul, pas une suite de `if`. */
export function rang(etape: Etape): number {
  return ETAPES.indexOf(etape);
}

/**
 * Correspondance entre les états du fournisseur et nos quatre étapes.
 *
 * ÉNUMÉRÉE ET FERMÉE. Ce qui n'y figure pas n'est pas traduit — et surtout pas
 * traduit « au mieux ». Un état non traduit laisse le colis là où il était et se
 * voit dans les données brutes, qu'on conserve pour cette raison précise.
 *
 * Les clefs sont écrites dans la casse du fournisseur et comparées SANS casse :
 * une correspondance sensible à la casse casserait le jour où il écrirait
 * `InTransit` au lieu de `INTRANSIT`, et le colis s'arrêterait d'avancer sans
 * qu'aucune erreur ne soit levée.
 */
const CORRESPONDANCE: Readonly<Record<string, Etape | null>> = {
  // Le numéro existe mais rien n'a encore été scanné. Ce n'est PAS une erreur —
  // c'est le cas le plus fréquent dans les heures qui suivent la saisie.
  notfound: null,
  // Le transporteur a reçu les informations, il n'a pas encore le colis.
  inforeceived: "preparation",
  intransit: "en_transit",
  availableforpickup: "en_transit",
  outfordelivery: "en_transit",
  // Une tentative de livraison ratée n'est pas une livraison, et ne fait pas
  // reculer : le colis est toujours chez le transporteur.
  deliveryfailure: "en_transit",
  delivered: "livre",
  // `Expired` est un abandon du fournisseur, `Exception` un incident : ni l'un
  // ni l'autre ne dit OÙ est le colis. Les traduire en étape reviendrait à
  // répondre à une question qui n'a pas été posée.
  expired: null,
  exception: null,
};

/**
 * Correspondance des JALONS datés, qui sont l'autre source du fournisseur.
 *
 * Ils comptent parce qu'ils portent une DATE : `PickedUp` est le seul signal qui
 * dit « le transporteur a le colis », et il n'existe pas dans les statuts.
 */
const JALONS: Readonly<Record<string, Etape | null>> = {
  inforeceived: "preparation",
  pickedup: "expedie",
  departure: "en_transit",
  arrival: "en_transit",
  availableforpickup: "en_transit",
  outfordelivery: "en_transit",
  delivered: "livre",
  // Un colis qui revient n'est pas livré, et ne recule pas non plus : il est
  // toujours en circulation. C'est un cas que l'écran devra nommer un jour ;
  // l'inventer ici serait pire que de ne rien dire.
  returning: null,
  returned: null,
};

/**
 * L'étape d'un PASSAGE (jalon daté) à partir de son stage brut 17TRACK (`PickedUp`,
 * `Departure`…) — la même table que la normalisation, une seule source de vérité. `null`
 * pour un stage inconnu ou sans étape (retour, retourné) : on n'interprète rien.
 */
export function etapeDuJalon(stage: string | null | undefined): Etape | null {
  if (stage === null || stage === undefined || stage.trim() === "") return null;
  return traduire(JALONS, stage).etape;
}

export interface EtatFournisseur {
  /** `latest_status.status`, tel quel. */
  readonly statut: string | null;
  /** Jalons datés. Un jalon sans date n'a pas eu lieu. */
  readonly jalons: readonly { readonly etape: string; readonly date: string | null }[];
}

export interface Normalisation {
  readonly etape: Etape;
  /** Vrai si le fournisseur a dit quelque chose que nous ne savons pas traduire. */
  readonly inconnu: boolean;
  /** Vrai si l'étape rendue est celle qu'on avait déjà, faute de mieux. */
  readonly inchange: boolean;
}

function traduire(table: Readonly<Record<string, Etape | null>>, valeur: string): {
  etape: Etape | null;
  connu: boolean;
} {
  const clef = valeur.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!Object.prototype.hasOwnProperty.call(table, clef)) return { etape: null, connu: false };
  return { etape: table[clef] ?? null, connu: true };
}

/**
 * Rend l'étape à afficher, en partant de celle déjà connue.
 *
 * `actuelle` n'est pas une commodité : c'est elle qui matérialise « le statut ne
 * recule jamais ». Une fonction qui rendrait l'étape « du moment » obligerait
 * chaque appelant à se souvenir de comparer, et le premier qui oublierait
 * ferait reculer un colis chez un client sans que rien n'échoue.
 */
export function normaliser(actuelle: Etape, etat: EtatFournisseur): Normalisation {
  let meilleure = actuelle;
  let inconnu = false;

  const avancer = (candidate: Etape | null): void => {
    if (candidate === null) return;
    if (rang(candidate) > rang(meilleure)) meilleure = candidate;
  };

  if (etat.statut !== null && etat.statut.trim() !== "") {
    const { etape, connu } = traduire(CORRESPONDANCE, etat.statut);
    if (!connu) inconnu = true;
    avancer(etape);
  }

  for (const jalon of etat.jalons) {
    // UN JALON SANS DATE N'A PAS EU LIEU. Le fournisseur rend le gabarit complet
    // des jalons possibles, dates nulles comprises : les compter reviendrait à
    // livrer tous les colis dès leur enregistrement.
    if (jalon.date === null || jalon.date.trim() === "") continue;
    const { etape, connu } = traduire(JALONS, jalon.etape);
    if (!connu) inconnu = true;
    avancer(etape);
  }

  return { etape: meilleure, inconnu, inchange: meilleure === actuelle };
}
