import "server-only";
import { z } from "zod";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import type { creerClientServeur } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types-base";
import { journaliser } from "./journal";

/**
 * LE CYCLE DE VIE D'UNE COMMANDE : révoquer le lien, dupliquer, archiver.
 *
 * Hors d'un module `"use server"`, comme les autres : chaque export d'un tel
 * module est un point d'entrée atteignable depuis le navigateur, et ces
 * fonctions reçoivent déjà un client et un profil.
 */

export type ClientCycle = Awaited<ReturnType<typeof creerClientServeur>>;
type InsertCommande = Database["public"]["Tables"]["orders"]["Insert"];

const Identifiant = z.string().uuid();

export type Revocation =
  | { readonly statut: "ok"; readonly nouveauJeton: string }
  | { readonly statut: "echec"; readonly motif: "saisie" | "introuvable" | "ecriture" };

/**
 * Révoque le lien public et en régénère un.
 *
 * C'EST LA SEULE ACTION QUI CHANGE LE JETON. Le déclencheur d'immuabilité refuse
 * toute autre écriture, et cette fonction ne le contourne pas : elle passe par
 * `regenerer_jeton_public`, qui pose le drapeau attendu, vérifie la propriété
 * dans son corps, et fait tourner LES DEUX JETONS.
 *
 * Les deux, et pas seulement le premier : oublier celui de désabonnement
 * laisserait un pouvoir résiduel à qui détient le lien fuité.
 *
 * LE NOUVEAU LIEN EST RENDU IMMÉDIATEMENT. Un vendeur qui doit recharger sa page
 * pour retrouver son lien hésitera à révoquer — et le lien fuité restera actif.
 */
export async function revoquerLien(
  supabase: ClientCycle,
  profilId: string,
  orderId: string,
): Promise<Revocation> {
  const analyse = Identifiant.safeParse(orderId);
  if (!analyse.success) return { statut: "echec", motif: "saisie" };

  const { data, error } = await supabase.rpc("regenerer_jeton_public", {
    p_order_id: analyse.data,
  });

  if (error !== null) {
    // `DL012` est le refus métier de la fonction : la commande n'est pas à
    // l'appelant, ou n'existe pas. Les deux se répondent pareil — distinguer
    // révélerait l'existence de la commande d'un autre vendeur.
    return { statut: "echec", motif: error.code === "DL012" ? "introuvable" : "ecriture" };
  }

  if (typeof data !== "string" || data === "") {
    return { statut: "echec", motif: "ecriture" };
  }

  // AUCUN appel au journal ici, et c'est délibéré : `regenerer_jeton_public`
  // écrit sa propre ligne, DANS LA MÊME TRANSACTION que la rotation (025). Un
  // second appel depuis l'application ajouterait une ligne en double — et une
  // trace qui compte double se relit comme deux révocations, sur la pièce
  // exacte qu'on produirait en cas de litige. Un fait, un point d'émission.
  await emettre(EVENEMENTS.LIEN_REVOQUE, { sujet: profilId }, { commande: analyse.data });

  return { statut: "ok", nouveauJeton: data };
}

export type Duplication =
  | { readonly statut: "ok"; readonly nouvelleCommande: string }
  | { readonly statut: "echec"; readonly motif: "saisie" | "introuvable" | "ecriture" };

/**
 * Duplique une commande — comme GABARIT, pas comme copie.
 *
 * TROIS EXCLUSIONS, chacune pour une raison différente :
 *
 *  - LE NOM DU CLIENT. Envoyer une page portant le pseudo de quelqu'un d'autre
 *    est le défaut le plus visible que ce produit puisse produire. C'est aussi
 *    le plus facile à commettre : on duplique justement parce que la commande
 *    précédente ressemble à la suivante.
 *  - LES MÉDIAS. Les copier doublerait le seul poste de coût qui peut déraper ;
 *    les PARTAGER créerait un couplage invisible — supprimer un média dans une
 *    commande le ferait disparaître d'une autre, y compris sur un lien déjà
 *    envoyé.
 *  - LE SUIVI. Un numéro de colis appartient à un colis. Le recopier ferait
 *    afficher au nouveau client le trajet de l'ancien.
 *
 * Restent la référence produit et les notes internes : ce qu'un vendeur
 * retape réellement d'une commande à l'autre.
 */
export async function dupliquerCommande(
  supabase: ClientCycle,
  profilId: string,
  shopId: string,
  orderId: string,
): Promise<Duplication> {
  const analyse = Identifiant.safeParse(orderId);
  if (!analyse.success) return { statut: "echec", motif: "saisie" };

  // Lecture sous RLS : si la commande n'est pas à l'appelant, elle ne vient pas.
  const { data: source } = await supabase
    .from("orders")
    .select("product_ref, internal_notes")
    .eq("id", analyse.data)
    .maybeSingle();

  if (source === null) return { statut: "echec", motif: "introuvable" };

  // Les deux jetons sont posés par un déclencheur `BEFORE INSERT` que
  // l'introspection du schéma ne voit pas : elle croit les colonnes
  // obligatoires. Le contournement est borné à cette insertion.
  const gabarit = {
    shop_id: shopId,
    product_ref: source.product_ref,
    internal_notes: source.internal_notes,
  } as unknown as InsertCommande;

  const { data, error } = await supabase.from("orders").insert(gabarit).select("id").maybeSingle();

  if (error !== null || data === null) return { statut: "echec", motif: "ecriture" };

  await emettre(
    EVENEMENTS.COMMANDE_DUPLIQUEE,
    { sujet: profilId },
    { source: analyse.data, copie: data.id },
  );

  // Journalisé sur la COPIE : c'est son historique à elle qui doit dire d'où
  // elle vient. L'écrire sur la source répondrait à une autre question.
  await journaliser(supabase, data.id, "commande_dupliquee", { source: analyse.data });

  return { statut: "ok", nouvelleCommande: data.id };
}

export type Archivage =
  | { readonly statut: "ok"; readonly archivee: boolean }
  | { readonly statut: "echec"; readonly motif: "saisie" | "introuvable" | "ecriture" };

/**
 * Archive une commande, ou la sort des archives.
 *
 * ARCHIVER NE RETIRE PAS LA PAGE. `archived_at` ne figure pas dans le filtre de
 * la vue publique : l'archivage range le plan de travail du vendeur, il ne casse
 * pas la promesse faite au client. Un lien envoyé il y a trois semaines continue
 * de répondre.
 *
 * C'est réversible, et c'est pour cela qu'il n'y a aucune confirmation : une
 * gêne posée sur une action qu'un clic défait n'apprend rien, elle apprend
 * seulement à cliquer sans lire.
 */
export async function archiverCommande(
  supabase: ClientCycle,
  profilId: string,
  orderId: string,
  archiver: boolean,
): Promise<Archivage> {
  const analyse = Identifiant.safeParse(orderId);
  if (!analyse.success) return { statut: "echec", motif: "saisie" };

  const { data, error } = await supabase
    .from("orders")
    .update({ archived_at: archiver ? new Date().toISOString() : null })
    .eq("id", analyse.data)
    .select("id, archived_at")
    .maybeSingle();

  if (error !== null) return { statut: "echec", motif: "ecriture" };
  if (data === null) return { statut: "echec", motif: "introuvable" };

  await emettre(
    EVENEMENTS.COMMANDE_ARCHIVEE,
    { sujet: profilId },
    { commande: analyse.data, archivee: archiver },
  );

  await journaliser(supabase, analyse.data, "commande_archivee", { archivee: archiver });

  return { statut: "ok", archivee: data.archived_at !== null };
}
