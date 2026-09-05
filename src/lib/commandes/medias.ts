import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { emettreApres } from "@/lib/instrumentation/emettre";
import { verifierQuotaDepot } from "@/lib/limitation/quota";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import { cleCouverture, cleMedia, cleVignette, typesAcceptes } from "@/lib/storage/cles";
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
      /**
       * Preuve, à rendre avec chaque dérivée, que ce `mediaId` vient d'ici.
       * Voir `laissezPasser` : sans elle, l'identifiant serait libre.
       */
      readonly laissezPasser: string;
    }
  | {
      readonly statut: "refus";
      readonly motif: string;
      readonly tailleReelle: number;
      readonly plafond: number;
    }
  | { readonly statut: "echec"; readonly motif: "introuvable" | "stockage" | "cadence" };

const Preparation = z.object({
  orderId: z.string().uuid(),
  typeMime: z.string().min(3).max(120),
  // Annoncée par le client, et utilisée UNIQUEMENT pour refuser tôt. Elle ne
  // fonde aucune écriture : la taille retenue est celle relue après dépôt.
  tailleAnnoncee: z.number().int().positive().max(2_000_000_000),
  dureeSecondes: z.number().int().positive().max(36_000).optional(),
});

/**
 * LE LAISSEZ-PASSER D'UNE DÉRIVÉE — la preuve que son média vient de nous.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. `mediaId` était un UUID
 * LIBRE : rien ne vérifiait qu'il désigne quoi que ce soit. Un vendeur
 * authentifié obtenait donc autant d'URL `PUT` qu'il voulait sur des clés
 * `medias/{sa boutique}/{sa commande}/{n'importe quel UUID}.vignette.webp`, et
 * les objets déposés là n'ont AUCUNE ligne en base. Ils n'entrent donc ni dans
 * `shops.stockage_octets` (migration 049, qui ne somme que
 * `order_media.taille_octets`), ni dans le plafond de stockage (migration 077),
 * ni dans aucun compteur d'usage : le seul poste de coût que le brief désigne
 * comme pouvant déraper était écrivable **sans borne ET sans mesure**.
 *
 * POURQUOI UNE SIGNATURE PLUTÔT QU'UNE VÉRIFICATION. À cet instant du dépôt, la
 * ligne `order_media` n'existe pas encore — elle est écrite par
 * `confirmerDepot`, APRÈS les dérivées (séquence dans `carte-medias.tsx`).
 * Interroger la base ne prouverait donc rien, et interroger le STOCKAGE
 * mettrait un appel réseau dans la suite `rls`, qui doit tenir sans compte
 * Cloudflare. Le laissez-passer se vérifie HORS LIGNE, sans état : il ne peut
 * être émis que par `preparerDepot`, c'est-à-dire par le chemin qui plafonne le
 * type, la taille, le nombre de médias et le débit.
 *
 * IL EST LIÉ AUX TROIS IDENTIFIANTS, pas seulement au média : un laissez-passer
 * obtenu sur sa propre commande ne vaut rien sur une autre, ni sous une autre
 * boutique. Le sel est celui du produit, avec un préfixe de domaine — sans lui,
 * une empreinte d'adresse IP et un laissez-passer partageraient le même espace
 * de valeurs.
 */
function laissezPasser(shopId: string, orderId: string, mediaId: string): string {
  const sel = process.env["HASH_SALT"] ?? "";
  if (sel.length < 16) {
    throw new Error(
      "HASH_SALT absent ou trop court : impossible de signer le laissez-passer " +
        "d'une dérivée. Sans lui, n'importe quel identifiant de média serait " +
        "accepté, et le stockage deviendrait écrivable sans borne ni mesure.",
    );
  }
  return createHash("sha256")
    .update(`derivee:${sel}:${shopId}:${orderId}:${mediaId}`)
    .digest("hex");
}

/**
 * Retire un média ET SES DEUX DÉRIVÉES du stockage.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. Les trois chemins de retrait
 * — refus après relecture de la taille, échec d'écriture en base, suppression
 * demandée par le vendeur — n'effaçaient QUE `cle`. Or un média porte jusqu'à
 * trois objets : lui-même, sa vignette et sa couverture, et le client dépose
 * les deux dérivées AVANT d'appeler `confirmerDepot`. Chaque refus tardif et
 * chaque suppression laissaient donc jusqu'à 110 Ko derrière eux.
 *
 * CES ORPHELINS SONT PIRES QUE DU STOCKAGE PERDU : ils sont INVISIBLES. Aucune
 * ligne ne les référence, donc ils n'entrent ni dans `shops.stockage_octets`,
 * ni dans le plafond de la migration 077, ni dans l'écran d'administration qui
 * prétend dire ce qu'un compte consomme. Le commentaire au-dessus du premier
 * des trois sites énonçait pourtant la règle — « le garder ferait payer un
 * stockage pour un média que personne ne verra jamais ». Elle était tenue pour
 * un tiers de ce qui avait été déposé.
 *
 * L'ÉCHEC DE CHAQUE EFFACEMENT EST AVALÉ SÉPARÉMENT, délibérément : ne pas
 * réussir à retirer la vignette ne doit pas empêcher de retirer le média.
 */
async function supprimerAvecDerivees(cle: string): Promise<void> {
  await Promise.all(
    [cle, cleVignette(cle), cleCouverture(cle)].map((c) =>
      supprimer(c).catch(() => undefined),
    ),
  );
}

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

  /*
   * LE PLAFOND DE DÉBIT PASSE AVANT TOUTE LECTURE, et cet ordre est la seule
   * raison d'être du contrôle. Placé après le comptage des médias, il bornerait
   * le nombre d'URL signées sans borner le travail : chaque appel refusé aurait
   * déjà coûté deux lectures en base. Un plafond qui s'applique après la dépense
   * qu'il prétend éviter n'est pas un plafond.
   */
  const cadence = await verifierQuotaDepot(profilId);
  if (!cadence.autorise) return { statut: "echec", motif: "cadence" };

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
      laissezPasser: laissezPasser(shopId, orderId, mediaId),
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
async function preparerDepotDerivee(
  supabase: ClientMedias,
  profilId: string,
  shopId: string,
  entree: unknown,
  genre: "vignette" | "couverture",
): Promise<
  | { readonly statut: "ok"; readonly url: string; readonly enTetes: Record<string, string> }
  | {
      readonly statut: "echec";
      readonly motif: "introuvable" | "trop_lourde" | "stockage" | "cadence";
    }
> {
  const analyse = z
    .object({
      orderId: z.string().uuid(),
      mediaId: z.string().uuid(),
      typeMime: z.string().min(3).max(120),
      tailleAnnoncee: z.number().int().positive(),
      laissezPasser: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .safeParse(entree);
  if (!analyse.success) return { statut: "echec", motif: "introuvable" };

  const { orderId, mediaId, typeMime, tailleAnnoncee } = analyse.data;

  /*
   * LE LAISSEZ-PASSER EST VÉRIFIÉ AVANT TOUT LE RESTE, et sa comparaison est à
   * TEMPS CONSTANT : comparer deux empreintes avec `===` fuit leur préfixe
   * commun, ce qui suffit à les reconstruire octet par octet.
   */
  const attendu = Buffer.from(laissezPasser(shopId, orderId, mediaId), "hex");
  const presente = Buffer.from(analyse.data.laissezPasser, "hex");
  if (attendu.length !== presente.length || !timingSafeEqual(attendu, presente)) {
    return { statut: "echec", motif: "introuvable" };
  }

  /*
   * LE PLAFOND DE DÉBIT S'APPLIQUE ICI AUSSI, ET IL Y MANQUAIT.
   *
   * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. `preparerDepot` pose le
   * plafond en tête et explique pourquoi ; ce chemin-ci ne le posait pas. Or il
   * signe lui aussi des URL `PUT`, donc il ouvre lui aussi une écriture chez le
   * fournisseur de stockage. Le seuil du brief — « 60 dépôts par minute » —
   * était donc appliqué à UN des TROIS points d'entrée de signature.
   *
   * C'est L-025 dans sa forme littérale : la garde a été écrite au moment où le
   * dépôt de média était le seul chemin, et les deux dérivées sont nées après,
   * hors de son champ de vision.
   */
  const cadence = await verifierQuotaDepot(profilId);
  if (!cadence.autorise) return { statut: "echec", motif: "cadence" };

  const { data: commande } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (commande === null) return { statut: "echec", motif: "introuvable" };

  const plafond = genre === "vignette" ? limites().vignetteOctets : limites().couvertureOctets;
  if (tailleAnnoncee > plafond) {
    return { statut: "echec", motif: "trop_lourde" };
  }

  const cleDuMedia = cleMedia({ shopId, orderId, mediaId, typeMime });
  const cle = genre === "vignette" ? cleVignette(cleDuMedia) : cleCouverture(cleDuMedia);

  try {
    const signature = await signerDepot({
      cle,
      typeMime: "image/webp",
      tailleOctets: tailleAnnoncee,
    });
    return { statut: "ok", url: signature.url, enTetes: signature.enTetesObligatoires };
  } catch (erreur) {
    console.error(
      "[medias] signature de dépôt de " + genre + " impossible : " +
        (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return { statut: "echec", motif: "stockage" };
  }
}

/** Signe le dépôt de la VIGNETTE — 200 px, la tuile de la grille. */
export function preparerDepotVignette(
  supabase: ClientMedias,
  profilId: string,
  shopId: string,
  entree: unknown,
) {
  return preparerDepotDerivee(supabase, profilId, shopId, entree, "vignette");
}

/**
 * Signe le dépôt de la COUVERTURE — 900 px, le plus gros élément de la page.
 *
 * MÊME CHEMIN QUE LA VIGNETTE, délibérément. Les deux dérivées partagent tout
 * ce qui compte : clé dérivée et jamais reçue, plafond appliqué DEUX FOIS —
 * tôt sur la taille annoncée, puis à la confirmation sur la taille relue, qui
 * seule fait foi. Les écrire séparément aurait laissé deux chemins vivre leur
 * vie : celui qu'on corrige et celui qu'on oublie.
 */
export function preparerDepotCouverture(
  supabase: ClientMedias,
  profilId: string,
  shopId: string,
  entree: unknown,
) {
  return preparerDepotDerivee(supabase, profilId, shopId, entree, "couverture");
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
    // média que personne ne verra jamais. LES DEUX DÉRIVÉES PARTENT AVEC LUI :
    // le client les a déjà déposées à ce stade (voir `supprimerAvecDerivees`).
    await supprimerAvecDerivees(cle);
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

  /*
   * LA COUVERTURE SUIT EXACTEMENT LA MÊME RÈGLE QUE LA VIGNETTE : elle n'est
   * enregistrée que si l'objet EXISTE et respecte son plafond dur, relu ici.
   *
   * Son absence est un cas NORMAL, pas une erreur : la page publique retombe
   * alors sur la vignette. C'est ce qui permet de poser cette dérivée sans rien
   * casser de l'existant — aucun média déjà déposé n'en a, et nous n'avons aucun
   * encodeur côté serveur pour les rattraper.
   */
  /*
   * ⚠️ UNE DÉRIVÉE ABSENTE SE DIT. Elle ne se disait PAS, et ce silence est ce
   * qui a laissé une page de client entièrement vide atteindre un vrai
   * destinataire le 05/09/2026.
   *
   * Le chemin est fait pour ne pas bloquer — c'est correct, une photo vaut
   * mieux qu'un refus. Mais « non bloquant » avait glissé en « invisible » :
   * `cle_vignette` restait nulle et RIEN, nulle part, ne disait qu'une dérivée
   * attendue n'était jamais arrivée. Le trop-lourd, lui, était déjà nommé —
   * l'absence pure ne l'était pas, alors que c'est le cas le plus fréquent
   * puisqu'il couvre AUSSI le refus de signature côté client, avalé sans
   * branche d'erreur.
   *
   * On le NOMME sans refuser : le vendeur garde son média, et nous savons.
   * Le journal du serveur est ce qui se lit AUJOURD'HUI ; l'événement d'usage
   * ne portera que le jour où l'instrumentation sera branchée.
   *
   * Seulement pour les PHOTOS : une vidéo n'a pas de couverture par
   * conception, et sa capture d'aperçu est explicitement « échec non
   * bloquant » — la signaler ferait chercher un défaut qui n'existe pas.
   */
  const estPhoto = typeMime.startsWith("image/");
  if (estPhoto && tailleVignette === null) {
    console.warn(
      "[medias] vignette absente pour un média accepté — la tuile retombera sur " +
        "l'image pleine. Dépôt de la dérivée refusé ou jamais parvenu.",
    );
    emettreApres(
      EVENEMENTS.MEDIA_REFUSE,
      { sujet: profilId },
      { motif: "vignette_absente", taille: tailleReelle },
    );
  }

  const cleDeCouverture = cleCouverture(cle);
  const tailleCouverture = await lireTaille(cleDeCouverture);
  const plafondCouverture = limites().couvertureOctets;

  let couvertureRetenue: string | null = null;
  if (tailleCouverture !== null) {
    if (tailleCouverture <= plafondCouverture) {
      couvertureRetenue = cleDeCouverture;
    } else {
      await supprimer(cleDeCouverture).catch(() => undefined);
      emettreApres(
        EVENEMENTS.MEDIA_REFUSE,
        { sujet: profilId },
        { motif: "couverture_trop_lourde", taille: tailleCouverture, plafond: plafondCouverture },
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
      cle_couverture: couvertureRetenue,
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
    await supprimerAvecDerivees(cle);
    return { statut: "echec", motif: "ecriture" };
  }

  emettreApres(
    EVENEMENTS.MEDIA_AJOUTE,
    { sujet: profilId },
    {
      commande: orderId,
      taille: tailleReelle,
      type: typeMime,
      /*
       * UNE VIDÉO ACCEPTÉE SANS DURÉE DÉCLARÉE EST COMPTÉE COMME TELLE.
       *
       * Le plafond de 60 s est déclaratif : la durée vient du navigateur et
       * peut manquer — le fichier n'a pas été décodable, ou le champ a été
       * omis. On accepte quand même, parce que refuser ferait payer au vendeur
       * une limite qui est la nôtre. Mais on ne peut pas décider s'il faut
       * s'en inquiéter sans savoir à quelle fréquence cela arrive, et ce
       * compteur ne peut pas être branché après coup : il démarrerait vide.
       */
      duree_inconnue: estVideo(typeMime) && dureeSecondes === undefined,
    },
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
  orderId: unknown,
  mediaId: unknown,
): Promise<{ statut: "ok" } | { statut: "echec"; motif: "introuvable" }> {
  const analyse = z
    .object({ orderId: z.string().uuid(), mediaId: z.string().uuid() })
    .safeParse({ orderId, mediaId });
  if (!analyse.success) return { statut: "echec", motif: "introuvable" };

  const { data, error } = await supabase
    .from("order_media")
    .delete()
    .eq("id", analyse.data.mediaId)
    .eq("order_id", analyse.data.orderId)
    .select("cle")
    .maybeSingle();

  if (error !== null || data === null) return { statut: "echec", motif: "introuvable" };

  await supprimerAvecDerivees(data.cle);

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
  orderId: unknown,
  ids: unknown,
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
