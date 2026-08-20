import "server-only";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientServeur } from "@/lib/supabase/server";
import { trousseauDeSignature } from "./jwks";

/**
 * Lecture de la session, côté serveur.
 *
 * VÉRIFICATION CRYPTOGRAPHIQUE LOCALE, PAS UN APPEL RÉSEAU. La clé de signature
 * en service sur ce projet est en ES256 : la signature du jeton se vérifie avec
 * la clé publique, sans demander son avis au serveur d'authentification. À
 * l'échelle, c'est la différence entre un appel réseau par requête et aucun.
 *
 * Ce n'est PAS un raccourci sur la sécurité : une signature valide est une
 * preuve, pas une supposition. Ce qu'elle ne prouve pas, c'est l'état COURANT du
 * compte — un jeton reste valide jusqu'à son expiration même si le compte a été
 * suspendu entre-temps. D'où la règle du brief, qui vaut toujours : le rôle
 * admin et le statut du compte se vérifient EN BASE, à chaque requête, jamais
 * depuis une revendication du jeton. Ce module ne répond qu'à « qui est-ce ? ».
 */

export type Session = {
  readonly userId: string;
  readonly email: string | null;
};

function extraireSession(claims: Record<string, unknown>): Session | null {
  const sub = claims["sub"];
  if (typeof sub !== "string" || sub === "") return null;
  const email = claims["email"];
  return { userId: sub, email: typeof email === "string" ? email : null };
}

/** Lit la session depuis un client déjà construit. Rend `null` si absente. */
export async function lireSessionDepuis(client: SupabaseClient): Promise<Session | null> {
  // ON REGARDE S'IL Y A UNE SESSION AVANT DE TOUCHER AU TROUSSEAU. Charger les
  // clés d'abord ferait payer un aller-retour réseau à chaque VISITEUR ANONYME
  // de la landing, sur une instance froide — c'est-à-dire précisément à ceux qui
  // n'ont aucune session à vérifier, et sur la page qui doit être la plus
  // rapide du produit.
  const { data: donneesSession } = await client.auth.getSession();
  const jeton = donneesSession.session?.access_token;
  if (jeton === undefined || jeton === "") return null;

  const { data, error } = await client.auth.getClaims(jeton, {
    // Le trousseau vient de NOTRE cache, pas de celui du client : le cache du
    // SDK vit sur l'instance, et on construit un client par requête, si bien
    // qu'il repartirait vide à chaque fois — le trousseau serait retéléchargé à
    // CHAQUE requête, en croyant avoir supprimé l'appel réseau.
    keys: await trousseauDeSignature(),
  });
  if (error !== null || data === null) return null;
  return extraireSession(data.claims as unknown as Record<string, unknown>);
}

/** Lit la session dans un Server Component ou une Server Action. */
export async function lireSession(): Promise<Session | null> {
  const client = await creerClientServeur();
  return lireSessionDepuis(client);
}

/**
 * Exige une session, sinon redirige vers la connexion.
 *
 * À appeler EN TÊTE DE CHAQUE Server Action et de chaque page de l'espace
 * authentifié. Le middleware ne protège aucune donnée à lui seul : il choisit
 * une réponse avant que la page ne s'exécute, et une nouvelle route ajoutée
 * demain n'hériterait de rien. La garde qui fait autorité est celle qui vit dans
 * le code qui lit les données.
 */
export async function exigerSession(locale: string): Promise<Session> {
  const session = await lireSession();
  if (session === null) {
    redirect(`/${locale}/connexion?erreur=session`);
  }
  return session;
}
