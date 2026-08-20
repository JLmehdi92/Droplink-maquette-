import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fabrique d'utilisateurs RÉELLEMENT authentifiés.
 *
 * Un test qui simule RLS ne teste pas RLS. Les policies s'exécutent avec le rôle
 * APPELANT et lisent `auth.uid()` depuis le jeton : sans vrai jeton, on ne
 * mesure que la capacité du client de service à tout lire, ce qu'on sait déjà.
 *
 * Chaque utilisateur créé ici déclenche en base la création de son profil et de
 * son shop. Le nettoyage supprime le compte auth, et la cascade emporte le
 * reste.
 */

const URL_SUPABASE = process.env["NEXT_PUBLIC_SUPABASE_URL"] as string;
const CLE_PUBLIABLE = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as string;
const CLE_SERVICE = process.env["SUPABASE_SERVICE_ROLE_KEY"] as string;

export interface UtilisateurDeTest {
  readonly email: string;
  readonly motDePasse: string;
  readonly userId: string;
  readonly profilId: string;
  readonly shopId: string;
  /** Client porteur de la session RÉELLE de cet utilisateur. */
  readonly client: SupabaseClient;
}

export function clientService(): SupabaseClient {
  return createClient(URL_SUPABASE, CLE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client anonyme, sans aucune session. Ce que voit un visiteur quelconque. */
export function clientAnonyme(): SupabaseClient {
  return createClient(URL_SUPABASE, CLE_PUBLIABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let compteur = 0;

export async function creerUtilisateur(etiquette: string): Promise<UtilisateurDeTest> {
  compteur += 1;
  const email = `test-${etiquette}-${Date.now()}-${compteur}@droplink-test.invalid`;
  const motDePasse = `Mdp-de-test-${Math.random().toString(36).slice(2)}-9!`;

  const service = clientService();
  const { data: creation, error: erreurCreation } = await service.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  if (erreurCreation !== null || creation.user === null) {
    throw new Error(`Création d'utilisateur impossible : ${erreurCreation?.message ?? "inconnu"}`);
  }
  const userId = creation.user.id;

  // Le profil et le shop naissent d'un déclencheur `after insert on auth.users`.
  // On les relit avec le client de service : à ce stade l'utilisateur n'a pas
  // encore de session, et sa propre RLS l'empêcherait de se voir.
  const { data: profil, error: erreurProfil } = await service
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (erreurProfil !== null || profil === null) {
    throw new Error(
      `Aucun profil créé pour ${email} : le déclencheur d'inscription n'a pas agi. ` +
        (erreurProfil?.message ?? ""),
    );
  }

  const { data: shop, error: erreurShop } = await service
    .from("shops")
    .select("id")
    .eq("owner_id", profil.id)
    .single();
  if (erreurShop !== null || shop === null) {
    throw new Error(`Aucun shop créé pour ${email} : ${erreurShop?.message ?? ""}`);
  }

  // Session réelle, obtenue par une vraie authentification.
  const client = clientAnonyme();
  const { error: erreurConnexion } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (erreurConnexion !== null) {
    throw new Error(`Connexion impossible pour ${email} : ${erreurConnexion.message}`);
  }

  return { email, motDePasse, userId, profilId: profil.id, shopId: shop.id, client };
}

export async function supprimerUtilisateur(u: UtilisateurDeTest): Promise<void> {
  await u.client.auth.signOut();
  const service = clientService();
  const { error } = await service.auth.admin.deleteUser(u.userId);
  if (error !== null) {
    // Pas de `catch` muet : un nettoyage qui échoue laisse des comptes derrière
    // lui, et le prochain passage mesurera une base polluée.
    throw new Error(`Suppression de ${u.email} impossible : ${error.message}`);
  }
}
