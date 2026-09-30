import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { estReseauInstable, fetchResilient, patienter, type ErreurAuth } from "./transport";

/**
 * Le transport vit dans `transport.ts` — il est importé par le fichier de mise
 * en place, donc évalué AVANT `dotenv`, et ne peut lire aucune variable
 * d'environnement. Il est réexporté ici pour que les suites gardent un seul
 * point d'entrée.
 */
export { estReseauInstable, fetchResilient, type ErreurAuth };

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
    global: { fetch: fetchResilient },
  });
}

/** Client anonyme, sans aucune session. Ce que voit un visiteur quelconque. */
export function clientAnonyme(): SupabaseClient {
  return createClient(URL_SUPABASE, CLE_PUBLIABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchResilient },
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
 * ⚠️ SECONDE CLASSE D'ALÉA, AJOUTÉE LE 01/09/2026 APRÈS UN ROUGE MAL ATTRIBUÉ.
 *
 * Une exécution a rendu `632/642` avec dix échecs répartis sur trois fichiers
 * sans rapport, tous portant `fetch failed` sur la création ou la suppression
 * d'un compte. La base était saine — 30 Mo, lecture seule OFF — et l'API
 * d'authentification répondait en 37 ms quand je l'ai mesurée. C'était un aléa
 * réseau, rien d'autre.
 *
 * Or l'enrobage ne patientait QUE sur le quota : toute autre erreur remontait
 * immédiatement, y compris une coupure réseau d'une seconde. Le commentaire
 * ci-dessus dit pourtant déjà l'essentiel — « un rouge qu'on attribue au
 * mauvais endroit est pire qu'un rouge » — et c'est exactement ce qui s'est
 * produit : dix tests ont accusé le produit d'un défaut qui n'existait pas.
 *
 * LES ATTENTES SONT COURTES, ET C'EST LE POINT. Un quota se libère en dizaines
 * de secondes ; un aléa réseau se résorbe en une ou deux. Réutiliser le rythme
 * du quota ferait payer 60 s à chaque hoquet, et on finirait par retirer le
 * réessai parce qu'il rend la suite insupportable.
 *
 * ⚠️ CE N'EST PAS « RÉESSAYER JUSQU'AU VERT ». La liste est BORNÉE — trois
 * tentatives, douze secondes en tout — et toute erreur qui n'est ni un quota ni
 * un aléa réseau remonte toujours IMMÉDIATEMENT. Élargir le réessai à n'importe
 * quelle erreur masquerait un vrai défaut derrière une lenteur, ce que
 * l'enrobage refuse depuis le premier jour.
 */
const ATTENTES_RESEAU_MS = [1_000, 3_000, 8_000] as const;

export function estQuotaAtteint(erreur: ErreurAuth | null): boolean {
  if (erreur === null) return false;
  return erreur.status === 429 || /rate limit/i.test(erreur.message);
}

/**
 * Exécute une étape d'authentification, en patientant sur les DEUX aléas
 * d'infrastructure — quota atteint, transport instable — et sur eux seuls.
 *
 * ⚠️ ELLE S'APPELAIT `malgreLeQuota`. Le nom a changé parce qu'il ne décrivait
 * plus ce que la fonction fait : elle encaisse désormais deux classes d'aléa.
 * Un nom qui ne dit qu'une moitié du comportement est un mensonge en attente —
 * le prochain à le lire croirait qu'une coupure réseau remonte immédiatement.
 *
 * Les deux classes ont leur PROPRE compteur et leur propre rythme : un quota
 * qui se libère n'a rien à voir avec un socket qui se rétablit, et les
 * mélanger ferait épuiser l'un par l'autre.
 *
 * TOUTE AUTRE ERREUR REMONTE IMMÉDIATEMENT, sans une seconde d'attente. C'est
 * la propriété qui fait la valeur de cet enrobage : il rend les aléas
 * d'infrastructure invisibles SANS rendre les défauts invisibles.
 */
export async function malgreLAlea<T>(
  quoi: string,
  etape: () => Promise<{ erreur: ErreurAuth | null; valeur: T }>,
  attentesQuota: readonly number[] = ATTENTES_QUOTA_MS,
  attentesReseau: readonly number[] = ATTENTES_RESEAU_MS,
): Promise<T> {
  let essaisQuota = 0;
  let essaisReseau = 0;

  for (;;) {
    const { erreur, valeur } = await etape();
    if (erreur === null) return valeur;

    if (estQuotaAtteint(erreur)) {
      const attente = attentesQuota[essaisQuota];
      essaisQuota += 1;
      if (attente === undefined) {
        throw new Error(
          `${quoi} : quota d'authentification Supabase épuisé après ${attentesQuota.length + 1} ` +
            "tentatives. CE N'EST PAS LE PRODUIT — c'est la limite de l'API d'authentification, " +
            "atteinte parce que la suite a été relancée plusieurs fois de suite. " +
            `Dernier message : ${erreur.message}`,
        );
      }
      console.warn(
        `[harnais] Quota d'authentification atteint (${quoi}). ` +
          `Attente de ${attente / 1000} s. Ce n'est PAS un défaut du produit : ` +
          "la suite ouvre des sessions réelles, et l'API d'authentification les limite " +
          "par adresse. Le seuil se règle côté Supabase (Auth → Rate Limits).",
      );
      await patienter(attente);
      continue;
    }

    if (estReseauInstable(erreur)) {
      const attente = attentesReseau[essaisReseau];
      essaisReseau += 1;
      if (attente === undefined) {
        throw new Error(
          `${quoi} : transport instable après ${attentesReseau.length + 1} tentatives. ` +
            "CE N'EST PAS LE PRODUIT — la requête n'a pas atteint l'API " +
            "d'authentification. Vérifier la connectivité avant de chercher une " +
            `régression. Dernier message : ${erreur.message}`,
        );
      }
      console.warn(
        `[harnais] Transport instable (${quoi}) : ${erreur.message}. ` +
          `Nouvelle tentative dans ${attente / 1000} s. Ce n'est PAS un défaut du produit.`,
      );
      await patienter(attente);
      continue;
    }

    // UNE ERREUR ORDINAIRE NE PATIENTE PAS. Attendre sur autre chose qu'un aléa
    // d'infrastructure masquerait un vrai défaut derrière une lenteur.
    throw new Error(`${quoi} : ${erreur.message}`);
  }
}

export async function creerUtilisateur(etiquette: string): Promise<UtilisateurDeTest> {
  compteur += 1;
  const email = `test-${etiquette}-${Date.now()}-${compteur}@droplink-test.invalid`;
  const motDePasse = `Mdp-de-test-${Math.random().toString(36).slice(2)}-9!`;

  const service = clientService();
  const userId = await malgreLAlea(`Création d'utilisateur ${email} impossible`, async () => {
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
  /*
   * ⚠️ CES DEUX LECTURES PRODUISAIENT UN DIAGNOSTIC MENSONGER.
   *
   * Elles n'étaient pas enrobées : un `fetch failed` sur la lecture du profil
   * faisait lever « Aucun profil créé pour … : le déclencheur d'inscription n'a
   * pas agi ». Le message accusait un déclencheur SQL qui, lui, avait
   * parfaitement fonctionné — la requête n'était simplement jamais arrivée.
   *
   * C'est pire qu'un rouge mal placé : c'est un rouge qui DÉSIGNE un coupable,
   * et qui enverrait le prochain lecteur relire une migration pendant que la
   * cause est un câble. On enrobe donc, et le message d'échec ne reste que pour
   * le cas où la lecture a bel et bien abouti sans rien trouver.
   */
  const profilId = await malgreLAlea(`Lecture du profil de ${email} impossible`, async () => {
    const { data, error } = await service.from("profiles").select("id").eq("user_id", userId).single();
    return { erreur: error, valeur: data?.id ?? null };
  });
  if (profilId === null) {
    throw new Error(
      `Aucun profil créé pour ${email} : le déclencheur d'inscription n'a pas agi.`,
    );
  }

  const shopId = await malgreLAlea(`Lecture du shop de ${email} impossible`, async () => {
    const { data, error } = await service.from("shops").select("id").eq("owner_id", profilId).single();
    return { erreur: error, valeur: data?.id ?? null };
  });
  if (shopId === null) {
    throw new Error(`Aucun shop créé pour ${email} : le déclencheur n'a pas agi.`);
  }

  // Session réelle, obtenue par une vraie authentification.
  const client = clientAnonyme();
  await malgreLAlea(`Connexion impossible pour ${email}`, async () => {
    const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
    return { erreur: error, valeur: null };
  });

  return { email, motDePasse, userId, profilId, shopId, client };
}

/**
 * Passe un compte de test au plan `pro`.
 *
 * ⚠️ À N'EMPLOYER QUE QUAND LA SUITE A BESOIN DE PLUS DE COMMANDES QUE LE QUOTA
 * GRATUIT, et à dire dans un commentaire pourquoi.
 *
 * Depuis la migration 176, un compte GRATUIT est borné à un quota de commandes À VIE (15 alors, 5 depuis la 210)
 * (décision de Wassim du 20/09/2026). Une suite qui en crée davantage sans le
 * vouloir rougit sur `DL067` — ce qui est le bon comportement du produit, et un
 * mauvais diagnostic pour la suite : elle croirait mesurer sa propre règle.
 *
 * Le marquer `pro` est plus VRAI que commode : une suite qui a besoin de vingt
 * commandes modélise un vendeur qui travaille, donc un vendeur qui paie. Et
 * rien n'est encaissé ici non plus — le plan est un état du compte, posé à la
 * main dans l'administration (contrainte n° 1).
 */
export async function passerEnPro(u: UtilisateurDeTest): Promise<void> {
  const { error } = await clientService()
    .from("profiles")
    .update({ plan: "pro" })
    .eq("id", u.profilId);
  if (error !== null) {
    throw new Error("passage en pro impossible pour " + u.email + " : " + error.message);
  }
}

export async function supprimerUtilisateur(u: UtilisateurDeTest): Promise<void> {
  /*
   * ⚠️ LA FERMETURE DE SESSION NE DOIT PAS BLOQUER LA SUPPRESSION.
   *
   * `signOut` part sur le réseau, donc elle peut échouer pour la même raison
   * que tout le reste. Or la session qu'elle ferme est celle d'un compte qu'on
   * s'apprête à effacer : elle mourra avec lui. La faire échouer bruyamment
   * empêcherait le nettoyage et laisserait un compte derrière — l'inverse du
   * but. L'échec est NOMMÉ, jamais avalé.
   */
  await u.client.auth.signOut().catch((erreur: unknown) => {
    console.warn(
      `[harnais] Fermeture de session impossible pour ${u.email} : ` +
        `${erreur instanceof Error ? erreur.message : String(erreur)}. ` +
        "Sans conséquence — le compte est supprimé juste après.",
    );
  });

  /*
   * ⚠️ CETTE SUPPRESSION N'ÉTAIT PAS ENROBÉE, ET C'EST ELLE QUI POLLUE.
   *
   * Un `fetch failed` ici ne fait pas que rougir : il laisse le compte en base.
   * J'ai mesuré TROIS comptes résiduels après l'exécution du 01/09/2026 —
   * chacun sera purgé au passage suivant par `amorcage.ts`, mais entre-temps
   * il fausse toute mesure qui compte les comptes.
   *
   * Le commentaire d'origine avait raison sur le principe — « pas de `catch`
   * muet : un nettoyage qui échoue laisse des comptes derrière lui » — il en
   * tirait simplement la mauvaise conclusion. Face à un aléa de transport, la
   * réponse n'est pas de lever tout de suite : c'est de réessayer, PUIS de
   * lever si ça ne passe toujours pas.
   */
  const service = clientService();
  await malgreLAlea(`Suppression de ${u.email} impossible`, async () => {
    const { error } = await service.auth.admin.deleteUser(u.userId);
    return { erreur: error, valeur: null };
  });
}
