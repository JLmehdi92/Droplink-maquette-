import "server-only";
import { creerClientServeur } from "@/lib/supabase/server";

/**
 * LE JOURNAL D'UNE COMMANDE — côté vendeur.
 *
 * Deux portes existent en base, et elles ne sont pas interchangeables :
 * `journaliser` (rôle système, écrit tout, y compris l'arbitrage du client) et
 * `journaliser_vendeur` (le vendeur, pour ses commandes, pour ses seules
 * actions). Ce module n'a accès qu'à la seconde. Un vendeur ne doit pas pouvoir
 * écrire « le client a approuvé » : c'est la seule ligne du journal qui puisse
 * être contestée, donc la seule qu'il aurait intérêt à fabriquer.
 *
 * L'ACTEUR N'EST PAS UN ARGUMENT. Il est écrit en dur par la base. Un acteur
 * fourni par l'appelant est un acteur que l'appelant choisit.
 */

/**
 * Les types que le journal accepte, TOUS acteurs confondus.
 *
 * Cette liste est comparée à la contrainte de la table DANS LES DEUX SENS : un
 * type ici sans exister en base fait échouer l'écriture — et la transaction
 * étant partagée, annule la mutation entière ; un type en base absent d'ici est
 * une valeur que plus personne n'écrit, donc un journal qui promet une
 * information qu'il ne contient pas.
 */
export const TYPES_EVENEMENT = [
  "commande_creee",
  "commande_modifiee",
  "commande_archivee",
  "commande_dupliquee",
  "media_ajoute",
  "media_supprime",
  "medias_reordonnes",
  "lien_revoque",
  "qc_approuve",
  "qc_refuse",
] as const;

export type TypeEvenement = (typeof TYPES_EVENEMENT)[number];

/** Ce qu'un VENDEUR peut écrire. Strictement inclus dans `TYPES_EVENEMENT`. */
export const TYPES_VENDEUR = [
  "commande_creee",
  "commande_modifiee",
  "commande_archivee",
  "commande_dupliquee",
  "media_ajoute",
  "media_supprime",
  "medias_reordonnes",
] as const;

export type TypeVendeur = (typeof TYPES_VENDEUR)[number];

export type ChargeJournal = Record<string, string | number | boolean>;

/**
 * Le strict nécessaire pour écrire au journal.
 *
 * Le client est INJECTÉ comme partout ailleurs dans ce module : il porte la
 * session du vendeur, donc la RLS. Le fabriquer ici ferait de cette fonction la
 * seule du lot à décider elle-même sous quelle identité elle écrit — et une
 * exception de ce genre finit toujours par être celle qu'on oublie de regarder.
 */
export type ClientJournal = Awaited<ReturnType<typeof creerClientServeur>>;

/**
 * Écrit une entrée au nom du vendeur connecté.
 *
 * NE LÈVE JAMAIS, et ne fait pas échouer la mutation qu'elle accompagne : une
 * trace manquante est un défaut, une mutation annulée parce que sa trace a
 * échoué en est un pire. L'échec n'est pas silencieux pour autant — il part dans
 * le journal serveur, où il se compte.
 *
 * L'ORDRE COMPTE : appeler APRÈS la mutation, jamais avant. Une trace écrite
 * d'avance décrit une action qui peut ne pas avoir eu lieu, et c'est exactement
 * le genre de ligne qu'on croira en cas de litige.
 */
export async function journaliser(
  supabase: ClientJournal,
  commandeId: string,
  type: TypeVendeur,
  charge: ChargeJournal = {},
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("journaliser_vendeur", {
      p_order_id: commandeId,
      p_type: type,
      p_payload: charge,
    });
    if (error !== null) {
      console.error("[journal] entrée perdue :", type, error.message);
      return false;
    }
    return true;
  } catch (erreur) {
    // Jamais de `catch` vide : on n'interrompt pas la mutation, mais on nomme.
    console.error(
      "[journal] entrée perdue :",
      type,
      erreur instanceof Error ? erreur.message : String(erreur),
    );
    return false;
  }
}
