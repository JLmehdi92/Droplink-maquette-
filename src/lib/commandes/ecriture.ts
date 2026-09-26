import "server-only";
import { z } from "zod";
import { emettre, emettreApres } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import type { creerClientServeur } from "@/lib/supabase/server";
import { STATUTS_EXPEDITION, STATUTS_QC } from "./liste";
import { journaliserApres } from "./journal";
import { attacherColis } from "@/lib/tracking/attache";
import { quotaColisDepuisCode, type QuotaAtteint } from "./quota-atteint";

/**
 * LE CŒUR DES ÉCRITURES DE COMMANDE, hors d'un module `"use server"`.
 *
 * La séparation n'est pas cosmétique : dans un fichier `"use server"`, CHAQUE
 * EXPORT devient un point d'entrée atteignable depuis le navigateur. Une
 * fonction d'aide qui reçoit déjà un client et un identifiant de profil y serait
 * appelable directement, en sautant la garde de session qui la précède. Elle
 * vit donc ici, où seul le serveur peut l'importer.
 *
 * Ce module est aussi ce que les tests d'isolation exercent, avec un client
 * d'utilisateur RÉELLEMENT authentifié — rejouer ailleurs une écriture
 * équivalente prouverait que la copie est correcte, pas le produit.
 */

export type ClientEcriture = Awaited<ReturnType<typeof creerClientServeur>>;

/**
 * Champs que l'éditeur peut écrire. Toute colonne absente d'ici est hors de
 * portée.
 *
 * ⚠️ LES PLAFONDS SONT CEUX DE LA BASE, ET C'EST UN CONTRAT VÉRIFIÉ.
 * `tests/rls/bornes-de-saisie-concordantes` compare ces valeurs aux `CHECK` du
 * catalogue, colonne par colonne, et refuse un écart DANS LES DEUX SENS.
 *
 * TROIS DIVERGEAIENT, mesurées le 02/09/2026 : `customer_label` 80 contre 120,
 * `product_ref` 80 contre 200, `internal_notes` 2000 contre 5000. Aucune ne
 * cassait rien — une valeur trop longue était refusée proprement, son champ
 * nommé — et c'est précisément pourquoi elles ont vécu : le plafond le plus bas
 * gagnait en silence, et rien ne pouvait rougir.
 *
 * Ce n'est pas anodin sur `product_ref` : la première des trois features du
 * brief est l'import depuis un LIEN de commande agent, et 80 caractères ne
 * suffisent pas à un tel lien. La base avait prévu 200 ; le produit refusait à
 * 80 sans que personne ait décidé de ce chiffre.
 *
 * ⚠️ ET LE SENS INVERSE SERAIT PIRE. Un plafond Zod PLUS LARGE que la base
 * ferait annoncer à l'écran un enregistrement que la base refuse, avec une
 * erreur Postgres brute à l'arrivée — le principe XII à l'envers. C'est ce que
 * le contrôle ferme pour l'avenir, pas seulement l'écart d'aujourd'hui.
 */
const CHAMPS = {
  customer_label: z.string().trim().max(120),
  product_ref: z.string().trim().max(200),
  tracking_number: z.string().trim().max(64),
  // UN CODE 17TRACK OU RIEN (« détection automatique »). Le champ est une liste
  // du produit, mais une Server Action se rejoue avec n'importe quel corps : un
  // texte libre y redeviendrait « DHL », que la base traite comme rien. Le
  // plafond reste celui de la colonne (contrôle `bornes-de-saisie-concordantes`).
  carrier_code: z.string().trim().max(32).regex(/^(?:[1-9][0-9]{0,8})?$/),
  internal_notes: z.string().trim().max(5000),
  status: z.enum(STATUTS_EXPEDITION),
  qc_status: z.enum(STATUTS_QC),
} as const;

type NomChamp = keyof typeof CHAMPS;

export type ResultatEnregistrement =
  | {
      readonly statut: "ok";
      readonly modifieeLe: string;
      /**
       * LE NUMÉRO EST ENREGISTRÉ, MAIS LE SUIVI N'A PAS DÉMARRÉ : la base a refusé
       * d'attacher le colis au quota de colis. Absent partout ailleurs — un « ok » sans
       * ce champ n'affirme rien sur le suivi.
       */
      readonly suiviBloque?: QuotaAtteint;
    }
  | {
      readonly statut: "echec";
      readonly motif: "session" | "saisie" | "ecriture" | "introuvable";
      readonly champ: string;
      /** Valeur réellement en base, pour que l'écran puisse y revenir. */
      readonly valeurConfirmee?: string;
    };

/**
 * Relit la valeur d'UN champ, pour la rendre à l'écran quand l'écriture a
 * échoué. Rend `{}` si la relecture échoue à son tour : l'appelant retombe
 * alors sur son propre état confirmé, qui n'est pas pire qu'avant.
 */
async function relire(
  supabase: ClientEcriture,
  id: string,
  // `NomChamp` ET NON `string` : ce nom de colonne part dans un `select`, donc
  // c'est le TYPAGE qui doit borner ce qu'il peut valoir, pas la discipline de
  // l'appelant. Il vaut aujourd'hui l'une des sept clés de `CHAMPS`, validée par
  // une énumération Zod juste au-dessus — mais un futur appel depuis un autre
  // chemin ne repasserait pas forcément par elle.
  champ: NomChamp,
): Promise<{ valeurConfirmee?: string }> {
  try {
    const { data } = await supabase.from("orders").select(champ).eq("id", id).maybeSingle();
    const valeur = (data as Record<string, unknown> | null)?.[champ];
    return typeof valeur === "string" ? { valeurConfirmee: valeur } : {};
  } catch {
    return {};
  }
}

const Enregistrement = z.object({
  id: z.string().uuid(),
  champ: z.enum(Object.keys(CHAMPS) as [NomChamp, ...NomChamp[]]),
  valeur: z.string().max(4000),
});

/**
 * Crée un brouillon et ouvre son éditeur.
 *
 * AUCUN ÉVÉNEMENT DE CRÉATION ICI. La ligne existe, mais elle est vide : c'est
 * une intention, pas une commande. `order_editor_opened` est émis, et l'écart
 * entre ce compteur et `order_created` est précisément l'information qu'on
 * cherche.
 */
export async function appliquerChamp(
  supabase: ClientEcriture,
  profilId: string,
  id: unknown,
  champ: unknown,
  valeur: unknown,
): Promise<ResultatEnregistrement> {
  const analyse = Enregistrement.safeParse({ id, champ, valeur });
  if (!analyse.success) {
    // ON NE RENVOIE PAS LA VALEUR BRUTE. Le témoin de l'éditeur NOMME le champ
    // en échec, et ce nom vient de l'appelant : le rendre tel quel renverrait à
    // l'écran ce qu'on vient de refuser. Un champ inconnu n'a de toute façon pas
    // de témoin à allumer.
    return { statut: "echec", motif: "saisie", champ: typeof champ === "string" ? champ : "" };
  }

  const nom = analyse.data.champ;
  const forme = CHAMPS[nom].safeParse(analyse.data.valeur);
  if (!forme.success) {
    return { statut: "echec", motif: "saisie", champ: nom };
  }

  // La modification est construite par un AIGUILLAGE EXPLICITE, et non par une
  // clé calculée. Une clé calculée fait perdre le typage : la base accepterait
  // alors n'importe quel nom de colonne dont le code croirait qu'il fait partie
  // des champs éditables — c'est le typage qui doit l'interdire, pas la
  // relecture.
  //
  // Un champ de texte vidé redevient NULL et non une chaîne vide : une
  // information absente est OMISE sur la page publique, et « omis » se lit en
  // base comme NULL. Deux façons de dire « rien » finiraient par diverger.
  // `updated_at` N'EST PAS ÉCRITE ICI. Elle est tenue par un déclencheur, et la
  // colonne n'est même pas dans le `grant update` de `authenticated` : une date
  // de modification que l'application choisit affirme ce qu'on veut, pas ce qui
  // s'est passé.
  const texte = (v: string): string | null => (v === "" ? null : v);
  const modification =
    forme.data === undefined
      ? null
      : nom === "status"
        ? { status: forme.data as (typeof STATUTS_EXPEDITION)[number] }
        : nom === "qc_status"
          ? { qc_status: forme.data as (typeof STATUTS_QC)[number] }
          : nom === "customer_label"
            ? { customer_label: texte(forme.data) }
            : nom === "product_ref"
              ? { product_ref: texte(forme.data) }
              : nom === "tracking_number"
                ? { tracking_number: texte(forme.data) }
                : nom === "carrier_code"
                  ? { carrier_code: texte(forme.data) }
                  : { internal_notes: texte(forme.data) };

  if (modification === null) {
    return { statut: "echec", motif: "saisie", champ: nom };
  }

  const { data, error } = await supabase
    .from("orders")
    .update(modification)
    .eq("id", analyse.data.id)
    .select("updated_at")
    .maybeSingle();

  if (error !== null) {
    /*
     * ⚠️ `valeurConfirmee` ÉTAIT DÉCLARÉE, DOCUMENTÉE DEUX FOIS, ET RENSEIGNÉE
     * NULLE PART.
     *
     * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. Le champ existait dans le
     * type, le commentaire de `enregistrerChamp` promettait « en cas d'échec,
     * cette action rend la valeur RÉELLEMENT en base, pour que l'écran y
     * revienne », et `grep` n'en trouvait qu'une occurrence : la déclaration.
     * C'est L-014 dans un contrat de fonction.
     *
     * CE QUE L'ABSENCE COÛTAIT, ET SEULEMENT LÀ : l'écran revenait à SA dernière
     * valeur confirmée, qui est locale à l'onglet. Avec deux onglets ouverts —
     * un vendeur qui compare deux commandes, cas ordinaire à 200 commandes par
     * semaine — l'onglet B revenait à une valeur que l'onglet A avait déjà
     * remplacée. L'interface affirmait alors un état que la base n'avait pas,
     * ce qui est le principe XII exactement à l'envers.
     *
     * LA RELECTURE EST BORNÉE : une seule ligne, un seul champ, et son propre
     * échec est avalé — on est déjà sur un chemin d'échec, et lever ici
     * masquerait la cause première derrière un second incident. Sans valeur
     * relue, l'écran retombe sur son comportement d'avant, qui n'est pas pire.
     */
    return { statut: "echec", motif: "ecriture", champ: nom, ...(await relire(supabase, analyse.data.id, nom)) };
  }

  // `maybeSingle` rend `null` quand la RLS a filtré la ligne : la commande
  // existe peut-être, mais pas pour cet appelant. On ne distingue pas les deux —
  // le dire reviendrait à confirmer l'existence d'une commande d'un autre.
  if (data === null) {
    // Pas de relecture ici : `maybeSingle` a rendu `null` parce que la RLS a
    // filtré la ligne. Relire donnerait le même vide, et insister ferait deux
    // requêtes pour la même réponse.
    return { statut: "echec", motif: "introuvable", champ: nom };
  }

  // LE NUMÉRO DE SUIVI DÉCLENCHE L'ATTACHE D'UN COLIS. Elle vient APRÈS
  // l'écriture réussie : attacher un colis à une commande dont la sauvegarde a
  // échoué créerait un suivi que personne n'a demandé — et qui se paierait.
  //
  // ⚠️ SON REFUS ÉTAIT IGNORÉ JUSQU'AU 26/09/2026. Au quota de colis, la base refuse
  // l'attache (`DL070`, `DL051`) : le numéro restait enregistré, l'écran disait
  // « enregistré », et aucun suivi ne démarrait jamais — sans un mot. Le refus de
  // quota remonte désormais à l'éditeur, qui le dit dans le panneau de suivi. Les
  // autres échecs d'attache gardent leur ancien sort : la sauvegarde du CHAMP a
  // réussi, et la dire échouée ferait revenir l'écran sur un numéro que la base porte.
  let suiviBloque: QuotaAtteint | null = null;
  if (nom === "tracking_number" || nom === "carrier_code") {
    const attache = await attacherColis(supabase, analyse.data.id);
    if (attache.statut === "echec") suiviBloque = quotaColisDepuisCode(attache.motif);
  }

  await marquerPremierContenu(supabase, analyse.data.id, profilId);

  emettreApres(EVENEMENTS.COMMANDE_MODIFIEE, { sujet: profilId }, { champ: nom });

  // Le JOURNAL est distinct de l'instrumentation, et les deux ne se remplacent
  // pas : l'un dit au vendeur ce qui est arrivé à SA commande, l'autre nous dit
  // combien de vendeurs modifient. La VALEUR du champ n'y entre pas — les notes
  // internes portent le prix d'achat, et un journal qui montre tout devient une
  // surface de fuite.
  journaliserApres(supabase, analyse.data.id, "commande_modifiee", { champ: nom });

  return suiviBloque === null
    ? { statut: "ok", modifieeLe: data.updated_at }
    : { statut: "ok", modifieeLe: data.updated_at, suiviBloque };
}

/**
 * Émet `order_created`, exactement une fois.
 *
 * LA MARQUE ET L'ÉVÉNEMENT SONT DEUX CHOSES DIFFÉRENTES. `first_content_at` est
 * un FAIT sur la commande, posé par un déclencheur depuis la migration 006 — et
 * c'est bien qu'un déclencheur s'en charge, une règle en base ne peut pas être
 * oubliée dans un nouveau chemin de code. `created_event_at` est la trace qu'on
 * a émis l'événement correspondant, et c'est elle qu'on réclame ici.
 *
 * Les avoir confondues a coûté l'événement : la fonction de la migration 012
 * cherchait à poser une marque que le déclencheur venait déjà de poser, ne
 * trouvait jamais rien à écrire, et rendait toujours `false`. `order_created`
 * n'était JAMAIS émis. Rien ne cassait — et c'est le NUMÉRATEUR de la métrique
 * de verdict de la phase de validation.
 *
 * La condition est évaluée par la BASE, dans l'écriture elle-même : deux
 * sauvegardes simultanées ne peuvent pas produire deux émissions.
 *
 * L'événement part APRÈS — ET LA MARQUE EST RENDUE S'IL N'EST PAS PARTI.
 *
 * C'est le correctif d'un défaut critique : `emettre` rend `false` sans lever
 * quand le collecteur n'est pas joignable ou pas configuré, et la marque
 * restait consommée. L'événement n'était alors jamais réémis. Avec la clé
 * d'analytics vide — l'état actuel — cela signifiait 100 % de pertes,
 * définitives, sur le NUMÉRATEUR de la métrique de verdict.
 *
 * Rendre la marque plutôt que d'émettre avant : émettre d'abord ferait
 * réémettre à chaque sauvegarde tant que l'écriture échoue, donc du double
 * comptage — l'erreur symétrique, et celle-là gonfle du côté rassurant.
 */
async function marquerPremierContenu(
  supabase: ClientEcriture,
  id: string,
  profilId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("reclamer_evenement_creation", { p_order_id: id });

  // Jamais de `catch` muet : une instrumentation qui échoue en silence se
  // découvre au moment de décider, c'est-à-dire trop tard.
  if (error !== null) {
    console.warn("[commandes] réclamation de l’événement de création impossible : " + error.message);
    return;
  }

  if (data !== true) return;

  const parti = await emettre(EVENEMENTS.COMMANDE_CREEE, { sujet: profilId }, { commande: id });

  if (!parti) {
    // La marque est rendue : la prochaine sauvegarde de cette commande
    // réessaiera. Un échec de libération n'est pas rattrapable ici — on le dit
    // plutôt que de l'avaler, faute de quoi la perte redeviendrait invisible.
    const { error: erreurLiberation } = await supabase.rpc("liberer_evenement_creation", {
      p_order_id: id,
    });
    if (erreurLiberation !== null) {
      console.warn(
        "[commandes] événement de création perdu ET marque non rendue : " +
          erreurLiberation.message,
      );
    }
    return;
  }

  // Journalisé ICI et pas à l'ouverture de l'éditeur : la commande naît au
  // premier CONTENU RÉEL. Un brouillon ouvert puis abandonné n'a jamais existé
  // pour le client, et son historique n'a rien à raconter.
  journaliserApres(supabase, id, "commande_creee");
}
