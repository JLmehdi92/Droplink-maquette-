import "server-only";
import { z } from "zod";
import { SchemaLangue } from "@/i18n/schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { normaliserLien, type CleLien } from "@/lib/boutique/normaliser-lien";

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

/**
 * LES TROIS RÉSEAUX, ET LEUR DOMAINE ATTENDU.
 *
 * UN LIEN LIBRE SERAIT UNE REDIRECTION OUVERTE offerte à qui contrôle un compte
 * vendeur : `javascript:`, `data:`, ou simplement un domaine d'hameçonnage
 * portant le nom du vendeur, rendu sur une page que son client croit être la
 * sienne. Le schéma exige donc `https` ET le domaine du réseau.
 *
 * LES MÊMES MOTIFS EXISTENT EN CONTRAINTE DE BASE (migration 085), et ce n'est
 * pas une redite : celui-ci EXPLIQUE au vendeur quel champ ne va pas, celle-là
 * EMPÊCHE quel que soit le chemin d'écriture. Les deux ne remplacent pas le
 * même défaut.
 *
 * ANCRÉS AUX DEUX BOUTS. Sans l'ancre de fin,
 * `https://instagram.com.attaquant.example/x` passerait — c'est la façon la
 * plus courante de croire qu'on a validé un domaine.
 */
export const MOTIFS_RESEAUX = {
  instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._/?=&%-]{1,180}$/,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._/?=&%-]{1,180}$/,
  whatsapp: /^https:\/\/(wa\.me|api\.whatsapp\.com)\/[A-Za-z0-9._/?=&%+-]{1,180}$/,
} as const;

/**
 * LE SITE DU VENDEUR — le seul lien dont l'hôte n'est pas contraint, parce que
 * c'est le sien. Ce qui tient à la place du domaine attendu : `https` en
 * toutes lettres (donc `javascript:` et `data:` fermés par le fait qu'UN SEUL
 * schéma est autorisé, jamais par une liste d'interdits), et **aucune arobase
 * dans l'autorité** — sans quoi `https://instagram.com@attaquant.example/x`
 * s'afficherait comme Instagram et mènerait ailleurs.
 *
 * LE MÊME MOTIF EXISTE EN CONTRAINTE DE BASE (migration 133), et les deux ne
 * remplacent pas le même défaut : celui-ci EXPLIQUE au vendeur, celle-là
 * EMPÊCHE quel que soit le chemin d'écriture.
 */
export const MOTIF_SITE =
  /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(\/[A-Za-z0-9._~:/?#=@!$&'()*+,;%-]{0,180})?$/;

/**
 * Un lien : vide vaut ABSENCE, et l'absence est `null` en base.
 *
 * La chaîne vide est acceptée à la SAISIE — c'est ainsi qu'un vendeur retire un
 * lien — puis convertie en `null` à l'écriture. La refuser obligerait à un
 * bouton « supprimer » distinct pour un geste qui est naturellement « effacer
 * le champ ».
 *
 * ⚠️ LA NORMALISATION VIENT AVANT LE MOTIF, ET NE LE REMPLACE PAS.
 *
 * `.transform()` s'exécute avant `.refine()` : la saisie est mise en forme
 * canonique, PUIS confrontée au motif ancré aux deux bouts. Un vendeur qui
 * colle `www.tiktok.com/@laplanque92` obtient donc un lien valide, et
 * `https://instagram.com.attaquant.example/x` reste refusé — la normalisation
 * ne sait pas fabriquer ce domaine-là, elle le rend inchangé et le motif
 * tranche. Le détail des cas couverts est dans `normaliser-lien`.
 *
 * `.max(200)` est appliqué APRÈS la normalisation parce que c'est la valeur
 * NORMALISÉE qui est écrite en base, donc elle qui doit tenir dans la borne de
 * la contrainte.
 */
const lienNormalise = (clef: CleLien, motif: RegExp) =>
  z
    .string()
    .trim()
    .transform((v) => normaliserLien(clef, v))
    .refine((v) => v.length <= 200, "lien trop long")
    .refine((v) => v === "" || motif.test(v), "lien attendu")
    .optional();

export const ReglagesMarque = z.object({
  // FACULTATIF, y compris ici. Un vendeur peut envoyer un lien sans avoir jamais
  // nommé sa boutique : la page publique OMET alors l'en-tête, et c'est le cas
  // le plus fréquent en début de vie d'un compte, pas un repli dégradé.
  nom: z.string().trim().max(NOM_MAX).optional(),
  couleurAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "couleur hexadécimale à six chiffres attendue"),
  languePublique: SchemaLangue,
  filigrane: z.boolean(),
  instagram: lienNormalise("instagram", MOTIFS_RESEAUX.instagram),
  tiktok: lienNormalise("tiktok", MOTIFS_RESEAUX.tiktok),
  whatsapp: lienNormalise("whatsapp", MOTIFS_RESEAUX.whatsapp),
  site: lienNormalise("site", MOTIF_SITE),
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
  const vide = (v: string | undefined): string | null =>
    v === undefined || v.trim() === "" ? null : v.trim();

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
      // Même règle que le nom : la chaîne vide vaut ABSENCE. C'est `null` qui
      // fait omettre le bloc des réseaux sur la page publique ; une chaîne vide
      // produirait un lien qui ne mène nulle part.
      instagram_url: vide(reglages.instagram),
      tiktok_url: vide(reglages.tiktok),
      whatsapp_url: vide(reglages.whatsapp),
      site_url: vide(reglages.site),
    })
    .eq("id", shopId);

  return error === null;
}
