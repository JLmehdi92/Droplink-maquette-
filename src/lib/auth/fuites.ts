import "server-only";
import { createHash } from "node:crypto";
import { fetchBorne } from "@/lib/reseau/fetch-borne";

/**
 * LE MOT DE PASSE CHOISI FIGURE-T-IL DANS UNE FUITE PUBLIQUE ?
 *
 * Décision de Wassim du 23/09/2026. Sans ce contrôle, le bourrage d'identifiants
 * est gratuit : un attaquant essaie les mots de passe des fuites connues, et ceux
 * que les gens réutilisent d'un site à l'autre passent.
 *
 * Supabase vend cette option (plan payant). La même base — Have I Been Pwned —
 * s'interroge gratuitement par K-ANONYMAT : on envoie les CINQ premiers
 * caractères de l'empreinte SHA-1, le service rend les centaines de suffixes qui
 * les partagent, et la comparaison se fait ICI. Ni le mot de passe ni son
 * empreinte entière ne quittent le serveur. `Add-Padding` fait rembourrer la
 * réponse de fausses lignes au compte nul, pour que sa taille ne trahisse rien.
 *
 * ⚠️ EN CAS DE PANNE DU SERVICE, LE MOT DE PASSE EST ACCEPTÉ — et c'est dit dans
 * le journal. Refuser toute inscription parce qu'un tiers ne répond pas
 * arrêterait le produit pour un incident qui n'est pas le nôtre ; ce contrôle
 * s'AJOUTE aux règles de longueur, qui, elles, ne dépendent de personne.
 */

/** Trois secondes : une inscription n'attend pas un tiers plus longtemps. */
export const BORNE_FUITES_MS = 3_000;

const SERVICE = "https://api.pwnedpasswords.com/range/";

export type VerdictFuite = "fuite" | "sain" | "inconnu";

export async function verifierFuite(motDePasse: string, sous?: typeof fetch): Promise<VerdictFuite> {
  const empreinte = createHash("sha1").update(motDePasse, "utf8").digest("hex").toUpperCase();
  const prefixe = empreinte.slice(0, 5);
  const suffixe = empreinte.slice(5);

  try {
    const reponse = await fetchBorne(BORNE_FUITES_MS, sous)(SERVICE + prefixe, {
      headers: { "Add-Padding": "true", "User-Agent": "DropLink" },
    });
    if (!reponse.ok) {
      console.warn("[fuites] service indisponible (" + String(reponse.status) + ") : mot de passe accepté sans vérification.");
      return "inconnu";
    }
    const corps = await reponse.text();
    for (const ligne of corps.split("\n")) {
      const [candidat, compte] = ligne.trim().split(":");
      // Une ligne de rembourrage porte un compte NUL : ce n'est pas une fuite.
      if (candidat?.toUpperCase() === suffixe && Number(compte) > 0) return "fuite";
    }
    return "sain";
  } catch (erreur) {
    console.warn(
      "[fuites] service injoignable : mot de passe accepté sans vérification. " +
        (erreur instanceof Error ? erreur.message : String(erreur)),
    );
    return "inconnu";
  }
}
