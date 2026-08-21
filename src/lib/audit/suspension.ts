import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * SUSPENDRE ET RÉACTIVER — la capacité qui fonde notre statut d'hébergeur.
 *
 * Le travail réel vit ici, en `server-only`, et non dans le module `"use
 * server"` : dans un module d'actions, CHAQUE export est un point d'entrée
 * atteignable depuis le navigateur. C'est ce module-ci que les tests exercent.
 *
 * TOUT PASSE PAR LA FONCTION EN BASE. Elle vérifie le rôle, refuse
 * l'auto-suspension et la suspension d'un administrateur, exige un motif, écrit
 * l'audit et modifie le statut — le tout dans une seule transaction. Une écriture
 * directe sur `profiles` contournerait les cinq à la fois, et `status` n'est de
 * toute façon accordé en écriture à personne.
 */

export const MOTIF_MIN = 8;
export const MOTIF_MAX = 500;

/**
 * Le motif est obligatoire des DEUX CÔTÉS.
 *
 * La base le refuse déjà vide ; le contrôle applicatif refuse plus tôt et avec
 * un meilleur message. Un plancher de quelques caractères écarte le « ok » ou le
 * point isolé : ce qu'on relira dans six mois doit dire quelque chose.
 */
export const DemandeSuspension = z.object({
  profilId: z.string().uuid(),
  motif: z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX),
  /**
   * L'email RECOPIÉ par l'administrateur, comparé à celui du compte visé.
   *
   * LA GÊNE EST LE MÉCANISME, pas un effet secondaire. Cette confirmation
   * n'existe pas pour rattraper une faute de frappe — elle existe pour FORCER À
   * LIRE quel compte on suspend. Une case à cocher se coche sans regarder ; un
   * email se recopie en le regardant.
   */
  confirmation: z.string().trim().max(320),
});

export type DemandeSuspension = z.infer<typeof DemandeSuspension>;

export type ResultatSuspension =
  | { statut: "ok" }
  | {
      statut: "erreur";
      motif: "saisie" | "confirmation" | "refuse" | "introuvable" | "ecriture";
    };

export type ClientAdmin = SupabaseClient<Database>;

/**
 * Traduit le code d'erreur de la base en cause métier.
 *
 * LE CODE FAIT PARTIE DU CONTRAT. On ne devine pas la cause en cherchant des
 * mots dans un message : un message se traduit, se reformule, et le contrôle qui
 * s'appuierait dessus deviendrait faux sans que rien ne le signale.
 */
function causeDeLErreur(code: string | undefined): ResultatSuspension {
  switch (code) {
    case "DL032":
      return { statut: "erreur", motif: "saisie" };
    case "DL033":
    case "DL034":
      return { statut: "erreur", motif: "refuse" };
    case "DL031":
      return { statut: "erreur", motif: "introuvable" };
    default:
      return { statut: "erreur", motif: "ecriture" };
  }
}

/**
 * Suspend un compte.
 *
 * `emailAttendu` est relu EN BASE par l'appelant, jamais transporté depuis le
 * formulaire : comparé à une valeur que le client fournit lui-même, le contrôle
 * de confirmation se réduirait à « recopier ce qu'on vient de m'envoyer », ce
 * qui ne force plus personne à lire quoi que ce soit.
 */
export async function suspendreCompte(
  supabase: ClientAdmin,
  demande: DemandeSuspension,
  emailAttendu: string,
  empreinteIp: string,
): Promise<ResultatSuspension> {
  /*
   * LA VALIDATION SE FAIT ICI, MÊME SI L'ARGUMENT EST DÉJÀ TYPÉ.
   *
   * Un type TypeScript disparaît à la compilation : il décrit ce que l'appelant
   * PROMET, jamais ce qu'il envoie. Sans ce contrôle, un motif de deux
   * caractères passait — la base ne refuse que le motif VIDE, et « ok » n'est
   * pas vide. Le geste le plus lourd du produit se serait retrouvé justifié par
   * une chaîne qui ne dit rien, précisément ce qu'on relira dans six mois.
   *
   * Zod sur toute entrée externe, y compris ce qui « vient de notre formulaire ».
   */
  const analyse = DemandeSuspension.safeParse(demande);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };
  const valide = analyse.data;

  // La comparaison ignore la casse et les espaces de bord — un email n'est pas
  // sensible à la casse, et refuser « Alice@ » pour « alice@ » ferait douter de
  // l'outil au lieu de faire relire le compte.
  if (valide.confirmation.trim().toLowerCase() !== emailAttendu.trim().toLowerCase()) {
    return { statut: "erreur", motif: "confirmation" };
  }

  const { error } = await supabase.rpc("suspendre_compte", {
    p_profil: valide.profilId,
    p_motif: valide.motif,
    p_ip_hash: empreinteIp,
  });

  if (error !== null) return causeDeLErreur(error.code);
  return { statut: "ok" };
}

/**
 * Réactive un compte.
 *
 * PAS DE CONFIRMATION PAR RECOPIE ICI. La gêne se justifie devant un geste qui
 * coupe le service de quelqu'un ; réactiver ne casse rien, et l'exiger
 * apprendrait surtout à recopier machinalement — ce qui affaiblirait la
 * confirmation là où elle compte.
 */
export async function reactiverCompte(
  supabase: ClientAdmin,
  profilId: string,
  motif: string,
  empreinteIp: string,
): Promise<ResultatSuspension> {
  const analyse = z.string().trim().min(MOTIF_MIN).max(MOTIF_MAX).safeParse(motif);
  if (!analyse.success) return { statut: "erreur", motif: "saisie" };

  const { error } = await supabase.rpc("reactiver_compte", {
    p_profil: profilId,
    p_motif: analyse.data,
    p_ip_hash: empreinteIp,
  });

  if (error !== null) return causeDeLErreur(error.code);
  return { statut: "ok" };
}
