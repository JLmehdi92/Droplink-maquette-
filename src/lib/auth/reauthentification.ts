import "server-only";

import { creerClientVerification } from "@/lib/supabase/verification";
import { verifierQuotaMotDePasse } from "@/lib/limitation/quota";

/**
 * « CE MOT DE PASSE EST-IL BIEN CELUI DE CE COMPTE ? » — avant un geste sensible.
 *
 * UNE SESSION NE SUFFIT PAS À CHANGER CE QUI PROTÈGE LE COMPTE. Un cookie volé
 * en est une, un poste resté déverrouillé aussi. Changer d'adresse, de mot de
 * passe ou fermer les autres appareils depuis une simple session transformerait
 * un accès momentané en prise de compte définitive : l'intrus changerait
 * l'adresse, recevrait la réinitialisation, et le propriétaire serait dehors.
 * C'est le défaut déjà corrigé sur `nouveau-mot-de-passe` (voir
 * `lib/auth/recuperation.ts`), et chaque geste de l'écran de paramètres en
 * hérite.
 *
 * TROIS PROPRIÉTÉS, ET LA DERNIÈRE EST CELLE QU'ON OUBLIE :
 *
 *  1. LE QUOTA DU MOT DE PASSE EST CONSOMMÉ AVANT L'APPEL — le même compteur
 *     que la connexion, indexé sur l'adresse du compte. Sans lui, quelqu'un qui
 *     tient une session pourrait éprouver des mots de passe depuis cet écran
 *     sans jamais toucher la limite de l'écran de connexion.
 *  2. L'ADRESSE VIENT DE LA BASE, jamais du formulaire : la demander au client
 *     permettrait de vérifier le mot de passe d'UN AUTRE compte et d'agir sur
 *     celui-ci.
 *  3. LA SESSION DE VÉRIFICATION EST FERMÉE AUSSITÔT, et elle n'est jamais celle
 *     du vendeur : voir `lib/supabase/verification.ts`. Laissée ouverte, chaque
 *     vérification ajouterait une session vivante de quatre cents jours à la
 *     liste des appareils du compte — c'est-à-dire exactement ce que « fermer
 *     les autres appareils » prétend retirer.
 *
 * Le plancher de temps reste à l'appelant, qui le connaît : il doit couvrir
 * TOUT le geste, pas seulement cette vérification.
 */
export type Reauthentification = "ok" | "refuse" | "trop_de_tentatives";

export async function verifierMotDePasseActuel(
  adresseDuCompte: string,
  motDePasse: string,
): Promise<Reauthentification> {
  if (motDePasse.length === 0 || motDePasse.length > 1024) return "refuse";

  const quota = await verifierQuotaMotDePasse(adresseDuCompte);
  if (!quota.autorise) return "trop_de_tentatives";

  const client = creerClientVerification();
  const { data, error } = await client.auth.signInWithPassword({
    email: adresseDuCompte,
    password: motDePasse,
  });

  if (error !== null || data.session === null) {
    // La limite de débit du serveur d'authentification ne dépend pas du mot de
    // passe essayé : la nommer ne renseigne personne, et elle évite de faire
    // réessayer aussitôt quelqu'un qu'on vient de freiner.
    return error?.status === 429 ? "trop_de_tentatives" : "refuse";
  }

  // `local` ferme CETTE session jetable et elle seule — celle du vendeur vit
  // dans ses cookies, que ce client ne connaît pas.
  const { error: erreurFermeture } = await client.auth.signOut({ scope: "local" });
  if (erreurFermeture !== null) {
    console.error("[auth] session de vérification non fermée — " + erreurFermeture.message);
  }

  return "ok";
}
