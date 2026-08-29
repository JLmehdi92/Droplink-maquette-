import "server-only";
import { seuil } from "@/lib/limitation/quota";
import { limites } from "@/lib/storage/limites";
import { FENETRE_VIDE_JOURS, INTERROGATIONS_VIDES_MAX } from "@/lib/tracking/schedule";
import { SEUIL_SILENCE_JOURS } from "@/lib/tracking/silence";

/**
 * LES RÉGLAGES QUE LE PRODUIT APPLIQUE SANS QU'ON PUISSE LES MODIFIER ICI.
 *
 * L'écran des paramètres montrait trois seuils. La planche en dessine quatorze,
 * et la tentation était d'ouvrir les onze autres à l'écriture. C'est exactement
 * le défaut que `parametres.ts` existe pour empêcher : une clé qu'aucun chemin
 * de code ne lit produit une ligne, une trace et un affichage parfaitement
 * crédibles — et ne substitue rien.
 *
 * ALORS ON LES MONTRE SANS LES OUVRIR, et on dit d'où ils viennent. C'est la
 * règle du brief pour la surface d'administration, prise dans l'autre sens :
 * omettre une valeur ferait croire qu'il n'y a rien à surveiller. Un
 * administrateur DÉCIDE — il lui faut voir ce que le produit applique
 * réellement, même là où la décision passe par un déploiement.
 *
 * ⚠️ CHAQUE VALEUR EST LUE À SA SOURCE, JAMAIS RECOPIÉE. Un écran qui réécrirait
 * « 20 » de son côté resterait juste tant que personne ne change la
 * configuration, puis afficherait un plafond que le produit n'applique plus —
 * et c'est le pire état possible pour un tableau de bord, parce qu'il rassure.
 *
 * TROIS DE CES VALEURS VIENNENT DE MODULES PURS (`silence`, `schedule`). Elles
 * ne peuvent PAS devenir des réglages en base sans détruire ce qui fait leur
 * valeur : ces modules portent toute la logique de suivi décidable hors réseau,
 * et c'est cette pureté qui les rend éprouvables sans fournisseur. Deux autres
 * viennent de `limites`, lisible depuis le NAVIGATEUR pour refuser un fichier
 * avant de le faire monter — une lecture en base y est impossible par
 * construction.
 */

const MO = 1024 * 1024;

/**
 * La rétention des réponses brutes.
 *
 * ⚠️ ELLE VIT EN SQL, dans `purger_donnees_de_suivi`, et rien en TypeScript ne
 * peut la lire. Cette constante est donc une RECOPIE, c'est-à-dire exactement ce
 * que le commentaire ci-dessus interdit. Elle est tolérée parce qu'une suite la
 * compare au corps de la fonction réellement appliquée en base, et échoue si les
 * deux divergent : une recopie surveillée par une exécution n'est plus une
 * recopie, c'est une assertion.
 */
export const PURGE_JOURS = 90;

/** Une valeur appliquée par le produit, avec l'endroit où elle se change. */
export interface ReglageConstate {
  /** Identifiant de traduction, jamais affiché. */
  readonly id: string;
  /** Déjà mise en forme : l'unité fait partie de la valeur pour qui décide. */
  readonly valeur: number;
  readonly unite: "nombre" | "jours" | "minutes" | "megaoctets";
}

export function reglagesConstates(): readonly ReglageConstate[] {
  const l = limites();
  return [
    { id: "medias_par_commande", valeur: l.mediasParCommande, unite: "nombre" },
    { id: "poids_video", valeur: Math.round(l.videoOctets / MO), unite: "megaoctets" },
    { id: "silence_jours", valeur: SEUIL_SILENCE_JOURS, unite: "jours" },
    { id: "abandon_jours", valeur: FENETRE_VIDE_JOURS, unite: "jours" },
    { id: "purge_jours", valeur: PURGE_JOURS, unite: "jours" },
    { id: "debit_inconnu", valeur: seuil("publique-inconnu").plafond, unite: "nombre" },
    { id: "debit_valide", valeur: seuil("publique-requetes").plafond, unite: "nombre" },
    { id: "debit_depot", valeur: seuil("depot").plafond, unite: "nombre" },
  ];
}

/** Ce que les libellés d'aide doivent pouvoir citer sans le recopier. */
export function detailsConstates(): Readonly<Record<string, number>> {
  const l = limites();
  return {
    videosParCommande: l.videosParCommande,
    interrogationsVides: INTERROGATIONS_VIDES_MAX,
  };
}
