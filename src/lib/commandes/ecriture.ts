import "server-only";
import { z } from "zod";
import { emettre } from "@/lib/instrumentation/emettre";
import { EVENEMENTS } from "@/lib/instrumentation/evenements";
import type { creerClientServeur } from "@/lib/supabase/server";
import { STATUTS_EXPEDITION, STATUTS_QC } from "./liste";
import { journaliser } from "./journal";
import { attacherColis } from "@/lib/tracking/attache";

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

/** Champs que l'éditeur peut écrire. Toute colonne absente d'ici est hors de portée. */
const CHAMPS = {
  customer_label: z.string().trim().max(80),
  product_ref: z.string().trim().max(80),
  tracking_number: z.string().trim().max(64),
  carrier_code: z.string().trim().max(32),
  internal_notes: z.string().trim().max(2000),
  status: z.enum(STATUTS_EXPEDITION),
  qc_status: z.enum(STATUTS_QC),
} as const;

type NomChamp = keyof typeof CHAMPS;

export type ResultatEnregistrement =
  | { readonly statut: "ok"; readonly modifieeLe: string }
  | {
      readonly statut: "echec";
      readonly motif: "session" | "saisie" | "ecriture" | "introuvable";
      readonly champ: string;
      /** Valeur réellement en base, pour que l'écran puisse y revenir. */
      readonly valeurConfirmee?: string;
    };

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
  id: string,
  champ: string,
  valeur: string,
): Promise<ResultatEnregistrement> {
  const analyse = Enregistrement.safeParse({ id, champ, valeur });
  if (!analyse.success) {
    return { statut: "echec", motif: "saisie", champ };
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
    return { statut: "echec", motif: "ecriture", champ: nom };
  }

  // `maybeSingle` rend `null` quand la RLS a filtré la ligne : la commande
  // existe peut-être, mais pas pour cet appelant. On ne distingue pas les deux —
  // le dire reviendrait à confirmer l'existence d'une commande d'un autre.
  if (data === null) {
    return { statut: "echec", motif: "introuvable", champ: nom };
  }

  // LE NUMÉRO DE SUIVI DÉCLENCHE L'ATTACHE D'UN COLIS. Elle vient APRÈS
  // l'écriture réussie : attacher un colis à une commande dont la sauvegarde a
  // échoué créerait un suivi que personne n'a demandé — et qui se paierait.
  if (nom === "tracking_number" || nom === "carrier_code") {
    await attacherColis(supabase, analyse.data.id);
  }

  await marquerPremierContenu(supabase, analyse.data.id, profilId);

  await emettre(EVENEMENTS.COMMANDE_MODIFIEE, { sujet: profilId }, { champ: nom });

  // Le JOURNAL est distinct de l'instrumentation, et les deux ne se remplacent
  // pas : l'un dit au vendeur ce qui est arrivé à SA commande, l'autre nous dit
  // combien de vendeurs modifient. La VALEUR du champ n'y entre pas — les notes
  // internes portent le prix d'achat, et un journal qui montre tout devient une
  // surface de fuite.
  await journaliser(supabase, analyse.data.id, "commande_modifiee", { champ: nom });

  return { statut: "ok", modifieeLe: data.updated_at };
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
  await journaliser(supabase, id, "commande_creee");
}
