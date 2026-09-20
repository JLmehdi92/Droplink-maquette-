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

/*
 * LES BORNES VIVENT DANS `bornes.ts`, ET ELLES Y SONT ALLEES POUR UNE RAISON
 * MESUREE : ce module est `server-only`, et le compteur du formulaire — un
 * composant client — en a besoin. Le build refusait, ce qui est exactement ce
 * que cette barriere doit faire.
 */
export { NOM_MAX, DESCRIPTION_MAX } from "./bornes";
import { NOM_MAX, DESCRIPTION_MAX } from "./bornes";

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
  /*
   * LA DESCRIPTION — une ligne sous le nom, sur la page du client.
   *
   * ⚠️ LA BORNE EST LA MÊME QU'EN BASE (migration 147) ET QUE CELLE DU
   * COMPTEUR DU KIT : 150. Trois endroits, une seule valeur — `DESCRIPTION_MAX`
   * la porte, et la contrainte de colonne la fait respecter même par un chemin
   * d'écriture qu'on n'aurait pas prévu.
   */
  description: z.string().trim().max(DESCRIPTION_MAX).optional(),
  couleurAccent: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "couleur hexadécimale à six chiffres attendue"),
  languePublique: SchemaLangue,
  filigrane: z.boolean(),
  /**
   * Retirer la carte « Propulsé par DropLink » de la page client. Réservé au plan Pro, mais
   * ce schéma ne le sait pas et n'a pas à le savoir : c'est le déclencheur de la migration 167
   * qui refuse (DL059). Une garde ici se contournerait par un appel direct à PostgREST.
   *
   * FACULTATIF, et l'absence veut dire « ne pas toucher » : l'onboarding appelle la même
   * écriture sans connaître cet interrupteur, et il ne doit pas le rabaisser en passant.
   */
  masquerMarque: z.boolean().optional(),
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
      // Même règle que le nom : la chaîne vide vaut ABSENCE, et la page client
      // omet alors la ligne plutôt que d'en rendre une vide (décision 26).
      description: vide(reglages.description),
      accent_color: reglages.couleurAccent.toLowerCase(),
      default_language: reglages.languePublique,
      watermark_enabled: reglages.filigrane,
      ...(reglages.masquerMarque === undefined ? {} : { hide_droplink_brand: reglages.masquerMarque }),
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

/**
 * LE NOM DE LIEN — `droplink.fr/<nom>/<jeton>` au lieu de `/p/<jeton>`.
 *
 * ⚠️ AUCUNE VALIDATION DE FORME ICI, ET C'EST DÉLIBÉRÉ. La forme est décidée
 * par `public.slug_valide()` (migrations 182-184), qui est aussi ce qui fait
 * tenir la contrainte `CHECK` de la table : la recopier en Zod créerait une
 * SECONDE source de vérité, qui divergerait au premier ajustement — et c'est
 * l'application qui gagnerait à l'écran pendant que la base refuserait, ou
 * l'inverse. On borne seulement la LONGUEUR, pour ne pas expédier dix kilo-
 * octets à la base, et on laisse la base trancher.
 *
 * La borne est volontairement plus large que les 40 caractères admis : refuser
 * ici à 40 rendrait le message « nom trop long » au lieu de « nom invalide »,
 * donc deux messages pour une seule règle.
 */
export const NomDeLien = z.string().trim().max(200);

/**
 * Ce que la base a répondu. Énumération FERMÉE : un cas ajouté en base sans
 * être traité ici fait rougir le compilateur là où il faut décider quoi dire au
 * vendeur, plutôt que de retomber en silence sur « une erreur est survenue ».
 */
export type ResultatNomDeLien =
  | "pose"
  /** Déjà le sien : réenregistrer le même formulaire est un geste ordinaire. */
  | "inchange"
  /** DL059 — réservé au plan Pro. */
  | "reserve-pro"
  /** DL071 — la forme ne convient pas. */
  | "invalide"
  /** DL072 — porté par une AUTRE boutique, y compris dans son passé. */
  | "deja-pris"
  | "echec";

/**
 * Pose le nom de lien de la boutique de l'appelant.
 *
 * ⚠️ TOUT PASSE PAR LA FONCTION, JAMAIS PAR UN `update`. `authenticated` n'a
 * aucun droit d'écriture sur `shops.slug` : c'est ce qui garde son sens à la
 * falsification `slug-ouvert`, qui ouvre précisément ce droit pour éprouver la
 * garde. Une vérification de plan écrite ICI se contournerait par un appel
 * direct à PostgREST.
 *
 * ⚠️ UN NOM VIDE NE VIDE RIEN, IL NE FAIT RIEN. Un nom abandonné reste réservé
 * à vie — c'est ce qui fait qu'un lien déjà envoyé continue de répondre — donc
 * « effacer » ne libérerait rien et ne ferait que retirer au vendeur l'adresse
 * qu'il a déjà partagée. Le champ vide signifie « ne pas toucher ».
 */
export async function definirNomDeLien(
  supabase: SupabaseClient<Database>,
  nom: string,
  nomActuel: string | null,
): Promise<ResultatNomDeLien> {
  const voulu = nom.trim().toLowerCase();
  if (voulu === "") return "inchange";
  if (voulu === (nomActuel ?? "")) return "inchange";

  const { error } = await supabase.rpc("definir_slug_boutique", { p_slug: voulu });
  if (error === null) return "pose";

  // Le code vient de `raise … using errcode`, et PostgREST le fait remonter tel
  // quel. On ne lit JAMAIS le message : il est en français dans la migration,
  // il n'est pas traduit, et le montrer au vendeur ferait fuiter du vocabulaire
  // interne dans une interface qui parle trois langues.
  switch (error.code) {
    case "DL059":
      return "reserve-pro";
    case "DL071":
      return "invalide";
    case "DL072":
      return "deja-pris";
    default:
      return "echec";
  }
}
