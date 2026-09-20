import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * CE QUE LEMON SQUEEZY NOUS ENVOIE, ET CE QU'ON EN CROIT.
 *
 * ⚠️ AUCUNE DONNÉE DE PAIEMENT NE TRAVERSE CE FICHIER. Lemon Squeezy est un
 * MERCHANT OF RECORD : il encaisse, il facture, il collecte et reverse la TVA.
 * Ce module ne lit ni carte, ni montant, ni moyen de paiement — seulement
 * l'ÉTAT d'un abonnement, et l'identité du vendeur qu'il concerne.
 *
 * ── LA SIGNATURE EST LA SEULE GARDE, ET ELLE PORTE SUR DES OCTETS ──────────
 *
 * `/api/*` est exclu du middleware : cette surface n'est protégée par rien
 * d'autre que ce qui est écrit ici. Sans vérification, n'importe qui pourrait
 * POSTer `{"status":"active","custom_data":{"profil_id":"…"}}` et s'offrir un
 * abonnement — c'est-à-dire exactement ce que Wassim veut faire payer.
 *
 * La signature porte sur le CORPS BRUT. `request.json()` puis un
 * `JSON.stringify` rendraient des octets différents — ordre des clés, espaces,
 * précision des nombres — et la vérification porterait sur un contenu qui n'est
 * plus celui reçu. D'où un contrat en `string`, jamais en objet.
 */

/** Le nom du fournisseur, tel qu'il est stocké en base. */
export const FOURNISSEUR = "lemon_squeezy";

/**
 * Les événements qu'on TRAITE, et eux seuls.
 *
 * Lemon Squeezy en envoie bien d'autres (commandes, remboursements, clés de
 * licence). Les ignorer explicitement vaut mieux que de les laisser tomber dans
 * un `default` : un événement inconnu doit être ARCHIVÉ et répondu 200 — sans
 * quoi le fournisseur le rejouerait indéfiniment — mais jamais appliqué.
 */
export const EVENEMENTS_TRAITES = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
  "subscription_paused",
  "subscription_unpaused",
] as const;

/**
 * Vérifie la signature `X-Signature` sur le corps BRUT.
 *
 * ⚠️ `timingSafeEqual` LÈVE quand les longueurs diffèrent — et une exception
 * ici, sur un chemin de garde, se lirait comme une panne plutôt que comme un
 * refus. On compare donc les longueurs D'ABORD, et un écart est un refus.
 *
 * ⚠️ ET LA COMPARAISON RESTE À TEMPS CONSTANT malgré ce raccourci : la longueur
 * d'un HMAC-SHA256 en hexadécimal est publique (64 caractères), la divulguer ne
 * dit rien du secret. Ce qui doit rester constant est la comparaison du
 * CONTENU, et elle l'est.
 */
export function verifierSignature(
  corpsBrut: string,
  signature: string | null,
  secret: string,
): boolean {
  if (signature === null || signature === "") return false;
  if (secret === "") return false;

  const attendue = Buffer.from(
    createHmac("sha256", secret).update(corpsBrut, "utf8").digest("hex"),
    "utf8",
  );
  const presentee = Buffer.from(signature, "utf8");

  if (attendue.length !== presentee.length) return false;
  return timingSafeEqual(attendue, presentee);
}

/**
 * LES STATUTS SONT UN ENSEMBLE FERMÉ, ET UN INCONNU EST REFUSÉ.
 *
 * Accepter n'importe quelle chaîne ferait tomber un statut inventé — ou
 * simplement nouveau chez le fournisseur — dans le `else` de
 * `plan_pour_statut`, c'est-à-dire sur `gratuit`. Un vendeur qui paie perdrait
 * son plan parce que Lemon Squeezy a ajouté un mot à sa liste.
 */
const Statut = z.enum([
  "on_trial",
  "active",
  "paused",
  "past_due",
  "unpaid",
  "cancelled",
  "expired",
]);

const Horodatage = z.string().datetime({ offset: true }).nullable().optional();

const Evenement = z.object({
  meta: z.object({
    event_name: z.string().min(1),
    custom_data: z
      .object({
        // On passe NOTRE identifiant de profil au moment du paiement. C'est le
        // lien le plus sûr : il ne dépend ni de l'adresse e-mail que le vendeur
        // a saisie chez le fournisseur, ni de son orthographe.
        profil_id: z.string().uuid().optional(),
      })
      .partial()
      .optional(),
  }),
  data: z.object({
    // ⚠️ L'identifiant du fournisseur est une CHAÎNE dans l'enveloppe JSON:API,
    // et un NOMBRE dans certains champs d'attributs. Le lire en `string` et
    // rien d'autre évite qu'un `42` et un `"42"` désignent deux abonnements.
    id: z.string().min(1),
    attributes: z.object({
      status: Statut,
      user_email: z.string().email().nullable().optional(),
      renews_at: Horodatage,
      ends_at: Horodatage,
    }),
  }),
});

export type EvenementAbonnement = z.infer<typeof Evenement>;

export type LectureEvenement =
  | { readonly statut: "ok"; readonly evenement: EvenementAbonnement }
  | { readonly statut: "illisible"; readonly motif: string };

/**
 * Analyse le corps APRÈS que la signature l'a authentifié.
 *
 * L'ordre est la garde : analyser d'abord ferait exécuter du code sur une
 * charge que personne n'a authentifiée, et ferait surtout vérifier la signature
 * d'un contenu reconstruit.
 */
export function lireEvenement(corpsBrut: string): LectureEvenement {
  let brut: unknown;
  try {
    brut = JSON.parse(corpsBrut);
  } catch {
    return { statut: "illisible", motif: "JSON invalide" };
  }

  const analyse = Evenement.safeParse(brut);
  if (!analyse.success) {
    // On NOMME le champ fautif sans recopier la charge : elle porte l'adresse
    // e-mail d'un vendeur, et un journal n'est pas l'endroit où la ranger.
    const champs = analyse.error.issues.map((i) => i.path.join(".")).join(", ");
    return { statut: "illisible", motif: "champs invalides : " + champs };
  }

  return { statut: "ok", evenement: analyse.data };
}

export type Destinataire =
  | { readonly par: "profil"; readonly profilId: string }
  | { readonly par: "courriel"; readonly courriel: string }
  | { readonly par: "rien" };

/**
 * À QUI CET ABONNEMENT APPARTIENT-IL ?
 *
 * DEUX VOIES, ET L'ORDRE COMPTE. L'identifiant de profil qu'on a nous-mêmes
 * glissé dans le paiement est la voie sûre. L'adresse e-mail est le FILET :
 * elle rattrape le vendeur qui a payé depuis un lien générique, et c'est
 * exactement le cas qui, sans filet, produit un paiement encaissé sans plan
 * posé — le pire résultat possible.
 *
 * ⚠️ ET SI LES DEUX ÉCHOUENT, ON N'INVENTE PAS. Pas de « premier compte qui
 * ressemble », pas de création de compte : l'appelant signale, et un humain
 * tranche. Poser un plan sur le mauvais compte est plus grave que de ne pas le
 * poser, parce que personne ne le découvrirait.
 */
export function destinataireDe(evenement: EvenementAbonnement): Destinataire {
  const profilId = evenement.meta.custom_data?.profil_id;
  if (typeof profilId === "string" && profilId !== "") {
    return { par: "profil", profilId };
  }

  const courriel = evenement.data.attributes.user_email;
  if (typeof courriel === "string" && courriel !== "") {
    return { par: "courriel", courriel: courriel.trim().toLowerCase() };
  }

  return { par: "rien" };
}
