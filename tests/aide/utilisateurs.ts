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

/**
 * LE QUOTA D'AUTHENTIFICATION SUPABASE, BORNÉ — pas contourné.
 *
 * La suite ouvre 43 sessions RÉELLES par exécution, et c'est délibéré : un test
 * qui simule RLS ne teste pas RLS. Mais l'API d'authentification limite les
 * connexions par adresse, et une falsification consiste à relancer la suite
 * plusieurs fois de suite — le quota s'épuise donc exactement pendant l'exercice
 * qui sert à prouver que les gardes détectent.
 *
 * CE N'EST PAS UN « RELANCER JUSQU'AU VERT ». La règle interdit de réessayer une
 * ASSERTION qui échoue par intermittence : là, c'est le produit qui serait
 * douteux. Ici rien n'est asserté — c'est la mise en place qui bute sur un quota
 * d'infrastructure, et le seul comportement correct est d'attendre puis de
 * DIRE ce qui s'est passé. Une erreur d'assertion, elle, n'est jamais réessayée.
 *
 * ET SURTOUT : L'ÉCHEC EST NOMMÉ. Avant cette borne, le quota produisait
 * « Cannot read properties of undefined (reading 'client') » dans trois fichiers
 * sans rapport — un rouge qui ressemblait à une régression du produit. Un rouge
 * qu'on attribue au mauvais endroit est pire qu'un rouge : c'est ainsi qu'on
 * s'habitue à en ignorer.
 */
const ATTENTES_QUOTA_MS = [15_000, 45_000] as const;

/**
 * `status` peut être absent, et `exactOptionalPropertyTypes` distingue « absent »
 * de « vaut undefined ». Le déclarer explicitement évite d'élargir le type de
 * retour de la bibliothèque pour lui faire accepter un contrat plus étroit.
 */
interface ErreurAuth {
  readonly status?: number | undefined;
  readonly message: string;
}

export function estQuotaAtteint(erreur: ErreurAuth | null): boolean {
  if (erreur === null) return false;
  return erreur.status === 429 || /rate limit/i.test(erreur.message);
}

async function patienter(ms: number): Promise<void> {
  await new Promise((resoudre) => setTimeout(resoudre, ms));
}

/**
 * Exécute une étape d'authentification, en attendant si — et SEULEMENT si — le
 * quota est atteint. Toute autre erreur remonte immédiatement.
 */
export async function malgreLeQuota<T>(
  quoi: string,
  etape: () => Promise<{ erreur: ErreurAuth | null; valeur: T }>,
  attentes: readonly number[] = ATTENTES_QUOTA_MS,
): Promise<T> {
  let derniere: ErreurAuth | null = null;

  for (let essai = 0; essai <= attentes.length; essai += 1) {
    const { erreur, valeur } = await etape();
    if (erreur === null) return valeur;
    derniere = erreur;

    // UNE ERREUR ORDINAIRE NE PATIENTE PAS. Attendre sur autre chose que le
    // quota masquerait un vrai défaut derrière une lenteur.
    if (!estQuotaAtteint(erreur)) {
      throw new Error(`${quoi} : ${erreur.message}`);
    }

    const attente = attentes[essai];
    if (attente === undefined) break;
    console.warn(
      `[harnais] Quota d'authentification atteint (${quoi}). ` +
        `Attente de ${attente / 1000} s. Ce n'est PAS un défaut du produit : ` +
        "la suite ouvre des sessions réelles, et l'API d'authentification les limite " +
        "par adresse. Le seuil se règle côté Supabase (Auth → Rate Limits).",
    );
    await patienter(attente);
  }

  throw new Error(
    `${quoi} : quota d'authentification Supabase épuisé après ${attentes.length + 1} ` +
      "tentatives. CE N'EST PAS LE PRODUIT — c'est la limite de l'API d'authentification, " +
      "atteinte parce que la suite a été relancée plusieurs fois de suite. " +
      `Dernier message : ${derniere?.message ?? "inconnu"}`,
  );
}

export async function creerUtilisateur(etiquette: string): Promise<UtilisateurDeTest> {
  compteur += 1;
  const email = `test-${etiquette}-${Date.now()}-${compteur}@droplink-test.invalid`;
  const motDePasse = `Mdp-de-test-${Math.random().toString(36).slice(2)}-9!`;

  const service = clientService();
  const userId = await malgreLeQuota(`Création d'utilisateur ${email} impossible`, async () => {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
    });
    if (error === null && data.user === null) {
      return { erreur: { message: "aucun utilisateur rendu" }, valeur: "" };
    }
    return { erreur: error, valeur: data.user?.id ?? "" };
  });

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
  await malgreLeQuota(`Connexion impossible pour ${email}`, async () => {
    const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
    return { erreur: error, valeur: null };
  });

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
