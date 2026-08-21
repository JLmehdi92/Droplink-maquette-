import "server-only";
import { z } from "zod";
import {
  RETARD_VEILLEUR_MINUTES_DEFAUT,
  SEUIL_COLIS_DEFAUT,
  type ClientAdmin,
} from "@/lib/audit/panneau";

/**
 * LES PARAMÈTRES SYSTÈME — l'inventaire, les bornes, la lecture, l'écriture.
 *
 * L'INVENTAIRE EST CLOS, ET C'EST LA PROPRIÉTÉ PRINCIPALE DE CE MODULE. La
 * table `system_settings` accepte n'importe quelle clé : un écran qui laisserait
 * saisir la clé librement permettrait d'écrire `seuil_colis` au lieu de
 * `seuil_colis_par_compte`. La ligne existerait, la trace serait écrite, l'écran
 * afficherait la nouvelle valeur — et rien ne la lirait jamais. Une valeur qui a
 * la FORME d'une configuration franchit toutes les validations de présence :
 * valider qu'un réglage EXISTE ne dit rien de sa SUBSTITUTION.
 *
 * LES BORNES SONT VÉRIFIÉES CÔTÉ SERVEUR, et elles ne sont pas cosmétiques. Un
 * seuil de colis à zéro signalerait tous les comptes ayant pris un seul colis en
 * charge ; un retard de veilleur à zéro le déclarerait en panne en permanence.
 * Dans les deux cas l'alerte partirait tout le temps — et une alerte qui se
 * trompe est une alerte qu'on apprend à ignorer, donc c'est ainsi qu'on rate la
 * vraie.
 *
 * LE DÉFAUT N'EST PAS ÉCRIT EN BASE. Une clé absente signifie « jamais décidé »,
 * ce qui est l'état normal du produit ; insérer les défauts au démarrage ferait
 * croire qu'ils ont été choisis alors qu'ils n'ont été que subis, et l'écran ne
 * pourrait plus distinguer les deux.
 */

export interface DefinitionParametre {
  readonly cle: string;
  readonly defaut: number;
  readonly min: number;
  readonly max: number;
}

/**
 * L'inventaire. Toute clé absente d'ici est REFUSÉE à l'écriture.
 *
 * Les deux entrées correspondent exactement aux deux seuils que `lireSeuils()`
 * consulte : c'est ce qui garantit qu'un réglage modifiable est un réglage lu.
 * Ajouter une entrée ici sans ajouter sa lecture ailleurs produirait précisément
 * le défaut que ce module existe pour empêcher.
 */
export const PARAMETRES: readonly DefinitionParametre[] = [
  {
    cle: "seuil_colis_par_compte",
    defaut: SEUIL_COLIS_DEFAUT,
    // 1 et non 0 : à zéro, tout compte ayant pris un colis en charge serait
    // signalé, donc le panneau signalerait l'usage normal du produit.
    min: 1,
    max: 1_000_000,
  },
  {
    cle: "retard_veilleur_minutes",
    defaut: RETARD_VEILLEUR_MINUTES_DEFAUT,
    // Sous la période du planificateur lui-même, le veilleur serait déclaré en
    // retard entre deux battements normaux : l'alerte décrirait la cadence, pas
    // une panne.
    min: 5,
    max: 10_080,
  },
] as const;

const CLES = new Set(PARAMETRES.map((p) => p.cle));

export function definitionDe(cle: string): DefinitionParametre | null {
  return PARAMETRES.find((p) => p.cle === cle) ?? null;
}

/**
 * Un paramètre tel que l'écran doit le montrer.
 *
 * `ecrit` porte l'information qui manque partout ailleurs : la valeur a-t-elle
 * été DÉCIDÉE, ou est-elle celle que personne n'a jamais changée ? Deux
 * situations opposées derrière le même chiffre.
 */
export interface ParametreAffiche {
  readonly cle: string;
  readonly valeur: number;
  readonly defaut: number;
  readonly min: number;
  readonly max: number;
  readonly ecrit: boolean;
  readonly modifieLe: string | null;
  /** `null` quand le compte qui l'a modifié n'existe plus. Nommé, jamais omis. */
  readonly modifiePar: string | null;
}

export async function lireParametres(supabase: ClientAdmin): Promise<ParametreAffiche[]> {
  const { data, error } = await supabase.rpc("lister_parametres");

  // JAMAIS DE REPLI MUET SUR LES DÉFAUTS ICI. Le panneau, lui, peut retomber sur
  // un défaut : il ne fait qu'afficher un seuil. Cet écran-ci sert à MODIFIER —
  // montrer des défauts au lieu d'une erreur ferait écraser une configuration
  // existante en croyant partir de zéro.
  if (error !== null) {
    throw new Error("lecture des paramètres impossible : " + error.message);
  }

  const ecrits = new Map((data ?? []).map((l) => [l.cle, l]));

  return PARAMETRES.map((p) => {
    const ligne = ecrits.get(p.cle);
    const brute = ligne === undefined ? null : Number(ligne.valeur);
    const valide = brute !== null && Number.isFinite(brute);

    return {
      cle: p.cle,
      // Une valeur écrite hors bornes — par une migration, par un script — est
      // AFFICHÉE telle quelle. La corriger en silence ferait voir à l'écran
      // autre chose que ce que le produit applique réellement.
      valeur: valide ? brute : p.defaut,
      defaut: p.defaut,
      min: p.min,
      max: p.max,
      ecrit: valide,
      modifieLe: ligne?.modifie_le ?? null,
      modifiePar: ligne?.modifie_par ?? null,
    };
  });
}

export type ResultatEcriture =
  | { statut: "ok"; cle: string }
  | { statut: "erreur"; motif: "cle" | "bornes" | "refuse" | "panne" };

/**
 * Écrit un paramètre, après avoir vérifié qu'il est de l'inventaire ET dans ses
 * bornes.
 *
 * LA VALIDATION EST REFAITE ICI même si l'appelant est typé. Un type TypeScript
 * décrit ce que l'appelant PROMET, pas ce qu'il envoie : personne d'hostile
 * n'appelle notre module, on appelle PostgREST. Et la Server Action qui mène ici
 * est un point d'entrée atteignable par une requête forgée.
 */
export async function ecrireParametre(
  supabase: ClientAdmin,
  cle: string,
  valeur: number,
): Promise<ResultatEcriture> {
  const definition = definitionDe(cle);
  if (definition === null || !CLES.has(cle)) return { statut: "erreur", motif: "cle" };

  const analyse = z.number().int().min(definition.min).max(definition.max).safeParse(valeur);
  if (!analyse.success) return { statut: "erreur", motif: "bornes" };

  const { error } = await supabase.rpc("ecrire_parametre", {
    p_cle: cle,
    p_valeur: analyse.data,
  });

  if (error !== null) {
    // DL031 est le refus de la garde en base. Il est distingué d'une panne :
    // confondre les deux ferait annoncer un incident là où il y a un refus, et
    // chercher une panne inexistante.
    return { statut: "erreur", motif: error.code === "DL031" ? "refuse" : "panne" };
  }

  return { statut: "ok", cle };
}
