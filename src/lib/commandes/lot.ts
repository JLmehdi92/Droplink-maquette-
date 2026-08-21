import { z } from "zod";

/**
 * Le résultat d'une action groupée, tel qu'il revient dans l'URL.
 *
 * ENSEMBLE FERMÉ, validé par Zod, parce que la valeur finit dans une clef de
 * traduction. Une chaîne libre venue de la barre d'adresse ferait lever le rendu
 * sur une clef inexistante : `?lot=n_importe_quoi` suffirait à casser l'écran le
 * plus utilisé du produit, pour tout le monde, sans rien exploiter.
 *
 * `catch(null)` plutôt qu'une erreur : une valeur inconnue n'est pas un incident,
 * c'est une URL recopiée de travers. On n'affiche simplement aucun message.
 */
export const ETATS_LOT = ["ok", "vide", "partiel", "ecriture"] as const;
export type EtatLot = (typeof ETATS_LOT)[number];

export const EtatLot = z.enum(ETATS_LOT).nullable().catch(null);

/** Le nombre traité, borné : il n'est affiché que pour informer. */
export const NombreLot = z.coerce.number().int().min(0).max(200).catch(0);
