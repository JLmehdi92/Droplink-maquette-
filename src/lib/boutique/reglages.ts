import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";

/**
 * LES RÉGLAGES DE MARQUE — ce qui habille TOUTES les pages publiques d'un
 * vendeur d'un seul geste.
 *
 * Ce module est `server-only` et reçoit son client en argument : c'est lui que
 * les tests exercent. Dans un module `"use server"`, chaque export est un point
 * d'entrée atteignable depuis le navigateur — le travail réel n'y vit jamais.
 *
 * DEUX LANGUES, ET ELLES SONT DISTINCTES. `profiles.locale` est la langue de
 * l'INTERFACE du vendeur ; `shops.default_language` est celle des pages que
 * voient ses CLIENTS. Un fournisseur de Guangzhou peut travailler en anglais et
 * livrer en France. Confondre les deux se voit chez le client, jamais chez le
 * vendeur — donc des semaines plus tard, quand quelqu'un finit par le dire.
 *
 * L'ÉCRITURE PASSE PAR LE CLIENT AVEC SESSION, donc sous RLS, et les colonnes
 * hors de cette liste ne sont même pas accordées à `authenticated` (migration
 * 001, complétée par la 004 qui a refermé `slug`). Le vendeur ne peut écrire
 * que ce qui suit parce que la BASE le lui interdit, pas parce que cette
 * requête est bien écrite.
 */

export const NOM_MAX = 60;

export const ReglagesMarque = z.object({
  // FACULTATIF, y compris ici. Un vendeur peut envoyer un lien sans avoir jamais
  // nommé sa boutique : la page publique OMET alors l'en-tête, et c'est le cas
  // le plus fréquent en début de vie d'un compte, pas un repli dégradé.
  nom: z.string().trim().max(NOM_MAX).optional(),
  couleurAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "couleur hexadécimale à six chiffres attendue"),
  languePublique: z.enum(["fr", "en"]),
  filigrane: z.boolean(),
});

export type ReglagesMarque = z.infer<typeof ReglagesMarque>;

/**
 * Applique les réglages à la boutique. Rend `true` si l'écriture a abouti.
 *
 * La couleur est stockée TELLE QUELLE et n'est jamais réécrite : le contraste
 * est dérivé au rendu. Corriger la valeur en base ferait voir au vendeur autre
 * chose que ce qu'il a choisi, sans le lui dire.
 */
export async function appliquerReglagesMarque(
  supabase: SupabaseClient<Database>,
  shopId: string,
  reglages: ReglagesMarque,
): Promise<boolean> {
  const nom = reglages.nom;

  const { error } = await supabase
    .from("shops")
    .update({
      // Une chaîne vide vaut ABSENCE, pas nom vide : la page publique décide
      // d'omettre l'en-tête sur `null`, et un nom vide produirait une barre de
      // titre vide plutôt que pas de barre du tout.
      name: nom === undefined || nom === "" ? null : nom,
      accent_color: reglages.couleurAccent.toLowerCase(),
      default_language: reglages.languePublique,
      watermark_enabled: reglages.filigrane,
    })
    .eq("id", shopId);

  return error === null;
}
