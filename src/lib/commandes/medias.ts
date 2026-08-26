import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { cleMedia, cleVignette, typesAcceptes } from "@/lib/storage/cles";
import { deciderDepot, estVideo, limites } from "@/lib/storage/limites";
import { lireTaille, signerDepot, supprimer } from "@/lib/storage/r2";
import type { creerClientServeur } from "@/lib/supabase/server";
import { journaliserApres } from "./journal";

/**
 * LES MÉDIAS D'UNE COMMANDE, côté serveur.
 *
 * Hors d'un module `"use server"` : chaque export d'un tel module est un point
 * d'entrée atteignable depuis le navigateur, et ces fonctions reçoivent déjà un
 * client et un profil — elles y seraient appelables en sautant la garde.
 *
 * LE DÉPÔT SE FAIT EN DEUX TEMPS, et ce n'est pas un détail d'implémentation :
 *
 *   1. `preparerDepot` décide, génère la clé et signe une URL `PUT`. Le fichier
 *      ne passe PAS par nous : une Server Action a une limite de corps de 1 Mo,
 *      et un dépôt à travers elle échouerait dès la première vidéo — piège
 *      d'autant plus vicieux qu'il PASSE en développement, sur de petits
 *      fichiers de test.
 *   2. `confirmerDepot` RELIT LA TAILLE chez le fournisseur de stockage et
 *      n'écrit la ligne qu'ensuite. La taille annoncée par le client n'est
 *      jamais retenue : c'est la base du modèle de coût, et un client qui
 *      annonce deux mégaoctets pour un fichier de quatre-vingts passerait tous
 *      les plafonds sans qu'aucun compteur ne bouge.
 *
 * LA CLÉ EST GÉNÉRÉE ICI, jamais reçue. Une clé fournie par le client
 * permettrait d'écraser le média d'un autre vendeur — le bucket ne connaît pas
 * nos vendeurs, il ne connaît que des chemins.
 */

export type ClientMedias = Awaited<ReturnType<typeof creerClientServeur>>;

export type PreparationDepot =
  | {
      readonly statut: "ok";
      readonly mediaId: string;
      readonly cle: string;
      readonly url: string;
      /**
       * En-têtes que le navigateur DOIT renvoyer : ils font partie de la
       * signature. `content-length` en fait partie, et le navigateur le pose
       * lui-même à partir du corps — c'est ce qui fait de la borne de taille une
       * borne réelle plutôt qu'une politesse.
       */
      readonly enTetes: Record<string, string>;
      readonly expireDansS: number;
    }
  | {
      readonly statut: "refus";
      readonly motif: string;
      readonly tailleReelle: number;
      readonly plafond: number;
    }
  | { readonly statut: "echec"; readonly motif: "introuvable" | "stockage" };

const Preparation = z.object({
  orderId: z.string().uuid(),
  typeMime: z.string().min(3).max(120),
  // Annoncée par le client, et utilisée UNIQUEMENT pour refuser tôt. Elle ne
  // fonde aucune écriture : la taille retenue est celle relue après dépôt.
  tailleAnnoncee: z.number().int().positive().max(2_000_000_000),
  dureeSecondes: z.number().int().positive().max(36_000).optional(),
});

/** Compte les médias d'une commande. Compté PAR LE SERVEUR — un plafond qu'on demande à l'intéressé de mesurer n'en est pas un. */
async function compter(
  supabase: ClientMedias,
  orderId: string,
): Promise<{ medias: number; videos: number } | null> {
  const { data, error } = await supabase
    .from("order_media")
    .select("type")
    .eq("order_id", orderId);

  if (error !== null || data === null) return null;
  return {
    medias: data.length,
    videos: data.filter((m) => m.type === "video").length,
  };
}

export async function preparerDepot(
  supabase: ClientMedias,
  profilId: string,
  shopId: string,
  entree: unknown,
): Promise<PreparationDepot> {
  const analyse = Preparation.safeParse(entree);
  if (!analyse.success) {
    return { statut: "refus", motif: "saisie", tailleReelle: 0, plafond: 0 };
  }

  const { orderId, typeMime, tailleAnnoncee, dureeSecondes } = analyse.data;

  // La commande doit être lisible par l'appelant. C'est la RLS qui tranche : on
  // ne filtre pas sur `shop_id`, on demande la ligne et on regarde si elle vient.
  const { data: commande } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();

  if (commande === null) return { statut: "echec", motif: "introuvable" };

  if (!typesAcceptes("media").includes(typeMime)) {
    emettreApres(
      EVENEMENTS.MEDIA_REFUSE,
      { sujet: profilId },
      { motif: "type_non_accepte", taille: tailleAnnoncee, type: typeMime },
    );
    return {
      statut: "refus",
      motif: "type_non_accepte",
      tailleReelle: tailleAnnoncee,
      plafond: 0,
    };
  }

  const compte = await compter(supabase, orderId);
  if (compte === null) return { statut: "echec", motif: "introuvable" };

  const decision = deciderDepot({
    typeMime,
    tailleOctets: tailleAnnoncee,
    mediasExistants: compte.medias,
    videosExistantes: compte.videos,
    ...(dureeSecondes === undefined ? {} : { dureeSecondes }),
  });

  if (!decision.accepte) {
    // REFUS INSTRUMENTÉ AVEC MOTIF **ET TAILLE RÉELLE** : sans la taille, on ne
    // saura pas de combien le plafond s'est trompé, donc on ne saura pas s'il
    // faut le relever ou si le vendeur envoyait n'importe quoi.
    emettreApres(
      EVENEMENTS.MEDIA_REFUSE,
      { sujet: profilId },
      { motif: decision.motif, taille: decision.tailleReelle, plafond: decision.plafond },
    );
    return {
      statut: "refus",
      motif: decision.motif,
      tailleReelle: decision.tailleReelle,
      plafond: decision.plafond,
    };
  }

  const mediaId = randomUUID();
  const cle = cleMedia({ shopId, orderId, mediaId, typeMime });

  try {
    const signature = await signerDepot({ cle, typeMime, tailleOctets: tailleAnnoncee });
    return {
      statut: "ok",
      mediaId,
      cle,
      url: signature.url,
      enTetes: signature.enTetesObligatoires,
      expireDansS: signature.expireDans,
    };
  } catch (erreur) {
    // JAMAIS DE `CATCH` VIDE. Celui-ci l'était, et c'est ce qui a rendu un
    // échec de dépôt impossible à diagnostiquer : le vendeur lisait « stockage
    // indisponible », et rien nulle part ne disait si la clé R2 manquait, si le
    // bucket refusait, ou si la signature était mal formée.
    console.error(
      "[medias] signature de dépôt impossible : " +
        (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return { statut: "echec", motif: "stockage" };
  }
}

/**
 * Signe le dépôt de la VIGNETTE d'un média.
 *
 * Sa clé est DÉRIVÉE de celle du média, jamais reçue : une vignette dont le
 * client choisirait l'emplacement pourrait écraser le média d'un autre — la
 * vignette n'est pas moins dangereuse que le média, c'est le même bucket.
 *
 * Le plafond dur est appliqué DEUX FOIS : ici sur la taille annoncée, pour
 * refuser tôt, et à la confirmation sur la taille relue, qui seule fait foi.
 */
export async function preparerDepotVignette(
  supabase: ClientMedias,
  shopId: string,
  entree: unknown,
): Promise<
  | { readonly statut: "ok"; readonly url: string; readonly enTetes: Record<string, string> }
  | { readonly statut: "echec"; readonly motif: "introuvable" | "trop_lourde" | "stockage" }
> {
  const analyse = z
    .object({
      orderId: z.string().uuid(),
      mediaId: z.string().uuid(),
      typeMime: z.string().min(3).max(120),
      tailleAnnoncee: z.number().int().positive(),
    })
    .safeParse(entree);
  if (!analyse.success) return { statut: "echec", motif: "introuvable" };

  const { orderId, mediaId, typeMime, tailleAnnoncee } = analyse.data;

  const { data: commande } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (commande === null) return { statut: "echec", motif: "introuvable" };

  if (tailleAnnoncee > limites().vignetteOctets) {
    return { statut: "echec", motif: "trop_lourde" };
  }

  const cle = cleVignette(cleMedia({ shopId, orderId, mediaId, typeMime }));

  try {
    const signature = await signerDepot({
      cle,
      typeMime: "image/webp",
      tailleOctets: tailleAnnoncee,
    });
    return { statut: "ok", url: signature.url, enTetes: signature.enTetesObligatoires };
  } catch (erreur) {
    console.error(
      "[medias] signature de dépôt de vignette impossible : " +
        (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return { statut: "echec", motif: "stockage" };
  }
}

export type ConfirmationDepot =
  | { readonly statut: "ok"; readonly mediaId: string; readonly tailleOctets: number }
  | {
      readonly statut: "refus";
      readonly motif: string;
      readonly tailleReelle: number;
      readonly plafond: number;
    }
  | { readonly statut: "echec"; readonly motif: "introuvable" | "absent" | "ecriture" };

const Confirmation = z.object({
  orderId: z.string().uuid(),
  mediaId: z.string().uuid(),
  typeMime: z.string().min(3).max(120),
  largeur: z.number().int().positive().max(100_000).optional(),
  hauteur: z.number().int().positive().max(100_000).optional(),
  dureeSecondes: z.number().int().positive().max(36_000).optional(),
});

export async function confirmerDepot(
  supabase: ClientMedias,
  profilId: string,
  shopId: string,
  entree: unknown,
): Promise<ConfirmationDepot> {
  const analyse = Confirmation.safeParse(entree);
  if (!analyse.success) return { statut: "echec", motif: "introuvable" };

  const { orderId, mediaId, typeMime, largeur, hauteur, dureeSecondes } = analyse.data;

  const { data: commande } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (commande === null) return { statut: "echec", motif: "introuvable" };

  // La clé est RECALCULÉE, jamais reçue. Recevoir la clé rendrait inutile de
  // l'avoir générée : il suffirait d'en présenter une autre à la confirmation.
  const cle = cleMedia({ shopId, orderId, mediaId, typeMime });

  const tailleReelle = await lireTaille(cle);
  if (tailleReelle === null) {
    // L'objet n'est pas là : le dépôt a échoué, ou n'a jamais eu lieu. On
    // n'écrit AUCUNE ligne — un média fantôme est le défaut le plus difficile à
    // rattraper, parce que l'écran l'affiche et que le fichier n'existe pas.
    return { statut: "echec", motif: "absent" };
  }

  const compte = await compter(supabase, orderId);
  if (compte === null) return { statut: "echec", motif: "introuvable" };

  // SECONDE DÉCISION, sur la taille RELUE. La première portait sur une valeur
  // annoncée : elle sert à refuser tôt, elle ne prouve rien.
  const decision = deciderDepot({
    typeMime,
    tailleOctets: tailleReelle,
    mediasExistants: compte.medias,
    videosExistantes: compte.videos,
    ...(dureeSecondes === undefined ? {} : { dureeSecondes }),
  });

  if (!decision.accepte) {
    // L'objet déposé est retiré : le garder ferait payer un stockage pour un
    // média que personne ne verra jamais.
    await supprimer(cle).catch(() => undefined);
    emettreApres(
      EVENEMENTS.MEDIA_REFUSE,
      { sujet: profilId },
      { motif: decision.motif, taille: decision.tailleReelle, plafond: decision.plafond, apresDepot: true },
    );
    return {
      statut: "refus",
      motif: decision.motif,
      tailleReelle: decision.tailleReelle,
      plafond: decision.plafond,
    };
  }

  /*
   * LA VIGNETTE EST VÉRIFIÉE PAR LE SERVEUR, jamais annoncée.
   *
   * `cle_vignette` n'est renseignée que si l'objet EXISTE réellement et respecte
   * le plafond dur. Une clé enregistrée pour un objet absent produirait une
   * image cassée sur la page d'un client — et une vignette hors budget ferait
   * dépasser le poids de page à cinquante lignes, ce qui ne se verrait qu'une
   * fois la volumétrie installée.
   */
  const cleDeVignette = cleVignette(cle);
  const tailleVignette = await lireTaille(cleDeVignette);
  const plafondVignette = limites().vignetteOctets;

  let vignetteRetenue: string | null = null;
  if (tailleVignette !== null) {
    if (tailleVignette <= plafondVignette) {
      vignetteRetenue = cleDeVignette;
    } else {
      // Elle est retirée : la garder ferait payer un stockage pour un objet que
      // rien ne référencera.
      await supprimer(cleDeVignette).catch(() => undefined);
      emettreApres(
        EVENEMENTS.MEDIA_REFUSE,
        { sujet: profilId },
        { motif: "vignette_trop_lourde", taille: tailleVignette, plafond: plafondVignette },
      );
    }
  }

  const { data, error } = await supabase
    .from("order_media")
    .insert({
      id: mediaId,
      order_id: orderId,
      type: estVideo(typeMime) ? "video" : "photo",
      cle,
      cle_vignette: vignetteRetenue,
      taille_octets: tailleReelle,
      position: compte.medias,
      largeur: largeur ?? null,
      hauteur: hauteur ?? null,
      duree_s: dureeSecondes ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error !== null || data === null) {
    /*
     * L'écriture a échoué — plafond en base, course, isolation. L'objet est
     * retiré pour la même raison que ci-dessus.
     *
     * ET LA CAUSE EST NOMMÉE. Elle ne l'était pas : le vendeur lisait
     * « Enregistrement impossible » et personne — nous compris — ne pouvait
     * savoir lequel des six déclencheurs de `order_media` avait refusé, ni si
     * c'était un plafond, une clé hors préfixe ou une policy. Un message d'échec
     * sans sa cause transforme un défaut d'une ligne en enquête.
     */
    console.error(
      "[medias] écriture refusée pour la commande " +
        orderId +
        " — " +
        (error === null ? "aucune ligne rendue" : `${error.code ?? "?"} : ${error.message}`),
    );
    await supprimer(cle).catch(() => undefined);
    return { statut: "echec", motif: "ecriture" };
  }

  emettreApres(
    EVENEMENTS.MEDIA_AJOUTE,
    { sujet: profilId },
    { commande: orderId, taille: tailleReelle, type: typeMime },
  );

  // La CLÉ de l'objet n'entre pas au journal : elle est dérivable en URL signée,
  // et l'historique est un écran de plus où elle pourrait fuiter.
  journaliserApres(supabase, orderId, "media_ajoute", {
    taille: tailleReelle,
    type: typeMime,
  });

  return { statut: "ok", mediaId, tailleOctets: tailleReelle };
}

/**
 * Supprime un média.
 *
 * LA LIGNE PART D'ABORD, L'OBJET ENSUITE. L'ordre inverse laisserait, si la
 * seconde opération échouait, une ligne qui désigne un objet absent — donc une
 * vignette cassée sur la page d'un client. Dans cet ordre, l'échec produit au
 * pire un objet orphelin : il coûte du stockage, il ne ment à personne.
 */
export async function supprimerMedia(
  supabase: ClientMedias,
  orderId: string,
  mediaId: string,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: "introuvable" }> {
  const analyse = z
    .object({ orderId: z.string().uuid(), mediaId: z.string().uuid() })
    .safeParse({ orderId, mediaId });
  if (!analyse.success) return { statut: "echec", motif: "introuvable" };

  const { data, error } = await supabase
    .from("order_media")
    .delete()
    .eq("id", mediaId)
    .eq("order_id", orderId)
    .select("cle")
    .maybeSingle();

  if (error !== null || data === null) return { statut: "echec", motif: "introuvable" };

  await supprimer(data.cle).catch(() => undefined);

  journaliserApres(supabase, analyse.data.orderId, "media_supprime");

  return { statut: "ok" };
}

/**
 * Réordonne les médias, en UNE SEULE écriture.
 *
 * Le travail est fait par la base : la fonction vérifie que la liste décrit
 * exactement les médias de la commande, et l'unicité différée rend l'état
 * intermédiaire acceptable. Faire cela en plusieurs écritures depuis
 * l'application laisserait un ordre à moitié posé si l'une d'elles échouait.
 */
export async function reordonnerMedias(
  supabase: ClientMedias,
  orderId: string,
  ids: readonly string[],
): Promise<{ statut: "ok"; nombre: number } | { statut: "echec"; motif: string }> {
  const analyse = z
    .object({ orderId: z.string().uuid(), ids: z.array(z.string().uuid()).max(50) })
    .safeParse({ orderId, ids });
  if (!analyse.success) return { statut: "echec", motif: "saisie" };

  const { data, error } = await supabase.rpc("reordonner_medias", {
    p_order_id: analyse.data.orderId,
    p_ids: analyse.data.ids,
  });

  if (error !== null) return { statut: "echec", motif: error.code ?? "ecriture" };

  journaliserApres(
    supabase,
    analyse.data.orderId,
    "medias_reordonnes",
    { nombre: data ?? 0 },
  );

  return { statut: "ok", nombre: data ?? 0 };
}

/** Plafonds à afficher. Lus côté serveur, jamais devinés par l'écran. */
export function plafondsAffichables(): { medias: number; videos: number; typesAcceptes: readonly string[] } {
  const l = limites();
  return {
    medias: l.mediasParCommande,
    videos: l.videosParCommande,
    typesAcceptes: typesAcceptes("media"),
  };
}
