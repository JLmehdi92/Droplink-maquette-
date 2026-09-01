import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types-base";
import { cleLogo } from "@/lib/storage/cles";
import { limites } from "@/lib/storage/limites";
import { lireTaille, signerDepot, supprimer } from "@/lib/storage/r2";

/**
 * LE DÉPÔT DU LOGO, partagé par l'onboarding et les réglages de marque.
 *
 * Deux écrans font exactement le même geste. Le dupliquer laisserait deux
 * chemins vivre leur vie : celui qu'on corrige et celui qu'on oublie. Or ce
 * geste porte trois contrôles dont aucun n'est évident à retrouver de mémoire —
 * la clé générée par le serveur, le refus du SVG, et la taille relue après coup.
 *
 * PAS DE SVG. Le format est accepté par le module de clés mais refusé ici : un
 * SVG est un document capable de porter du script, et l'assainir exige de le
 * relire côté serveur après dépôt. Tant que cet assainissement n'existe pas,
 * l'accepter reviendrait à héberger du script fourni par l'utilisateur.
 */

export const TYPES_LOGO_ACCEPTES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * LA FORME DES ARGUMENTS QUI VIENNENT DU NAVIGATEUR.
 *
 * ⚠️ CES TROIS SCHÉMAS NE REMPLACENT AUCUNE RÈGLE MÉTIER — le type accepté, le
 * plafond de taille et la forme canonique de la clé restent décidés plus bas,
 * là où ils étaient. Ils ne garantissent que le TYPE, et c'est précisément ce
 * que TypeScript ne garantit pas : les annotations sont effacées à l'exécution,
 * et l'appelant d'une Server Action est le navigateur.
 *
 * ⚠️ DÉFAUT MESURÉ LE 01/09/2026. Les actions de logo déclaraient
 * `typeMime: string` et `cle: string`, et personne ne les vérifiait :
 *   - `preparerLogo(null, 1)` levait sur `.split` ;
 *   - `confirmerLogo("logos/{monShop}/x")` franchissait le contrôle de
 *     PROPRIÉTÉ — trois segments, le bon shop — puis `exigerCleCanonique`
 *     levait, et rien ne l'attrapait.
 * Dans les deux cas la Server Action rendait 500. Un point d'entrée qui plante
 * sur une requête forgée apprend à qui la forge qu'il a planté, et il écrit une
 * trace d'erreur à chaque tentative : de quoi noyer un journal à volonté. La
 * route `commandes/geste` porte cette règle depuis toujours ; les Server
 * Actions l'avaient perdue.
 */
export const TypeMimeDemande = z.string().max(120);
export const TailleDemandee = z.number();
export const CleDeposee = z.string().max(300);

export type PreparationLogo =
  | { statut: "pret"; url: string; cle: string; enTetes: Record<string, string> }
  | { statut: "erreur"; motif: "type" | "taille" };

/**
 * Signe un dépôt direct navigateur → R2.
 *
 * LE FICHIER NE TRANSITE PAS PAR UNE SERVER ACTION : leur corps est plafonné à
 * un mégaoctet, et le piège est vicieux parce qu'il PASSE en développement sur
 * de petites images de test.
 *
 * LA CLÉ EST GÉNÉRÉE ICI, JAMAIS FOURNIE PAR LE CLIENT : une clé choisie par le
 * client permettrait d'écraser le logo — ou le média — d'un autre vendeur.
 */
export async function preparerDepotDeLogo(
  shopId: string,
  typeMime: string,
  tailleOctets: number,
): Promise<PreparationLogo> {
  const normalise = typeMime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!(TYPES_LOGO_ACCEPTES as readonly string[]).includes(normalise)) {
    return { statut: "erreur", motif: "type" };
  }

  const plafond = limites().logoOctets;
  if (!Number.isInteger(tailleOctets) || tailleOctets <= 0 || tailleOctets > plafond) {
    return { statut: "erreur", motif: "taille" };
  }

  const cle = cleLogo({ shopId, logoId: randomUUID(), typeMime: normalise });
  const { url, enTetesObligatoires } = await signerDepot({
    cle,
    typeMime: normalise,
    tailleOctets,
  });

  return { statut: "pret", url, cle, enTetes: enTetesObligatoires };
}

/**
 * Vrai si la clé appartient bien à CE vendeur.
 *
 * ⚠️ LA COMPARAISON PORTE SUR LE SEGMENT, PAS SUR LE PRÉFIXE.
 *
 * L'ancienne version faisait `cle.startsWith("logos/" + shopId + "/")`. Elle
 * était vraie pour `logos/{monShop}/../../medias/{victime}/…`, et `new URL()`
 * normalisait les `..` au moment de signer : le vendeur obtenait une URL sur
 * l'objet d'un autre, et `retirerLogo` le supprimait. Un contrôle de préfixe
 * répond à « par quoi ça commence », jamais à « qu'est-ce que c'est ».
 *
 * On découpe donc, et on exige la forme exacte `logos/{shop}/{logo}.{ext}` —
 * trois segments, pas quatre. `exigerCleCanonique` refuse déjà tout le reste
 * en amont ; ce contrôle-ci ne répond qu'à la question de la PROPRIÉTÉ, et il
 * reste juste même si la liste des formes s'allonge un jour.
 */
export function cleAppartientAuShop(cle: string, shopId: string): boolean {
  const segments = cle.split("/");
  return segments.length === 3 && segments[0] === "logos" && segments[1] === shopId;
}

/**
 * Confirme le dépôt : relit la taille RÉELLE côté serveur, puis enregistre.
 *
 * On ne croit jamais le client sur la taille d'un fichier — c'est la base du
 * modèle de coût. La signature borne déjà ce qui peut être envoyé, mais cette
 * relecture est ce qui rend la borne VÉRIFIÉE plutôt que supposée, et elle
 * attrape aussi le cas où rien n'est arrivé.
 */
export async function confirmerDepotDeLogo(
  supabase: SupabaseClient<Database>,
  shopId: string,
  cle: string,
): Promise<boolean> {
  if (!cleAppartientAuShop(cle, shopId)) return false;

  const taille = await lireTaille(cle);
  if (taille === null) return false;

  if (taille > limites().logoOctets) {
    // Refus APRÈS mesure réelle : on retire l'objet plutôt que de le laisser
    // occuper l'espace d'un fichier qu'on vient de déclarer inacceptable.
    await supprimer(cle);
    return false;
  }

  const { error } = await supabase.from("shops").update({ logo_url: cle }).eq("id", shopId);
  return error === null;
}

/**
 * Retire le logo.
 *
 * LA BASE D'ABORD, L'OBJET ENSUITE. Dans cet ordre, un échec après la première
 * étape laisse un objet orphelin dans le stockage — invisible, sans référence,
 * et qui coûte quelques kilo-octets. Dans l'autre ordre, il laisserait une
 * référence vers un objet disparu : la page publique demanderait une URL signée
 * pour un fichier absent, et l'en-tête du vendeur casserait chez son client.
 * Entre un déchet et une page cassée, on choisit le déchet.
 */
export async function retirerLogo(
  supabase: SupabaseClient<Database>,
  shopId: string,
  cleActuelle: string | null,
): Promise<boolean> {
  const { error } = await supabase.from("shops").update({ logo_url: null }).eq("id", shopId);
  if (error !== null) return false;

  if (cleActuelle !== null && cleAppartientAuShop(cleActuelle, shopId)) {
    // L'échec de suppression ne remet pas le logo : du point de vue du vendeur,
    // il est retiré, et c'est vrai — il n'est plus servi nulle part.
    await supprimer(cleActuelle).catch(() => undefined);
  }

  return true;
}
