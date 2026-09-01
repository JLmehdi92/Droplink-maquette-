/**
 * LE TRANSPORT DU HARNAIS — réessaie une COUPURE, jamais une RÉPONSE.
 *
 * ⚠️ POURQUOI CECI EXISTE.
 *
 * Le 01/09/2026, deux exécutions complètes ont rendu `632/642` puis `641/642`,
 * chaque échec portant `fetch failed` dans un fichier différent. La cause a été
 * cherchée au lieu de relancer :
 *   - la base était saine — 29 Mo, lecture seule OFF ;
 *   - l'API d'authentification répondait en 37 ms ;
 *   - une rafale de 200 appels RPC est passée en 5,5 s, **zéro échec**.
 *
 * Ce n'est donc ni une limite de débit, ni un épuisement de connexions : c'est
 * un hoquet de transport sporadique, de l'ordre de 1 appel sur 640. Sur une
 * suite qui en fait des milliers, il tombe presque à chaque exécution — et il
 * tombe AILLEURS à chaque fois, ce qui le fait passer pour une régression.
 *
 * ⚠️ ON NE RÉESSAIE QUE LORSQUE `fetch` REJETTE, c'est-à-dire quand il n'y a eu
 * AUCUNE réponse HTTP. Un 403 de RLS, un 409 de contrainte, un 400 de refus
 * sont des RÉPONSES — ce sont précisément celles que ces tests cherchent à
 * obtenir, et les réessayer les masquerait tout en ralentissant la suite. La
 * distinction n'est pas une nuance de confort : c'est ce qui sépare « rendre
 * les aléas invisibles » de « rendre les défauts invisibles ».
 *
 * ⚠️ CE FICHIER NE LIT AUCUNE VARIABLE D'ENVIRONNEMENT, et c'est la raison de
 * son existence séparée. Il est importé par `charger-env.ts`, donc évalué AVANT
 * que `dotenv` n'ait chargé `.env.local` : y lire `process.env` rendrait des
 * valeurs vides, silencieusement.
 */

const REESSAIS_TRANSPORT_MS = [300, 900, 2_000] as const;

/**
 * `status` peut être absent, et `exactOptionalPropertyTypes` distingue « absent »
 * de « vaut undefined ». Le déclarer explicitement évite d'élargir le type de
 * retour de la bibliothèque pour lui faire accepter un contrat plus étroit.
 */
export interface ErreurAuth {
  readonly status?: number | undefined;
  readonly message: string;
}

/**
 * Un aléa d'INFRASTRUCTURE, par opposition à un refus.
 *
 * La liste est volontairement ÉTROITE et énumérée : ce sont les formes sous
 * lesquelles une coupure de transport se présente, jamais un message métier.
 * Un `Invalid login credentials` ou un `duplicate key` n'y entre pas — et ne
 * doit jamais y entrer, sous peine de transformer l'enrobage en machine à
 * cacher les défauts.
 *
 * Les trois codes 5xx sont là parce qu'une passerelle qui rend 502 ne dit rien
 * du produit : elle dit qu'elle n'a pas pu joindre ce qu'il y a derrière.
 */
export function estReseauInstable(erreur: ErreurAuth | null): boolean {
  if (erreur === null) return false;
  if (erreur.status === 502 || erreur.status === 503 || erreur.status === 504) return true;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminated/i.test(
    erreur.message,
  );
}

export async function patienter(ms: number): Promise<void> {
  await new Promise((resoudre) => setTimeout(resoudre, ms));
}

export async function fetchResilient(
  entree: RequestInfo | URL,
  options?: RequestInit,
  // Injectable pour que la suite puisse éprouver la borne sans attendre 3,2 s.
  // `supabase-js` n'appelle jamais qu'avec deux arguments : le défaut règne.
  attentes: readonly number[] = REESSAIS_TRANSPORT_MS,
  /**
   * Le `fetch` réellement employé.
   *
   * ⚠️ IL EST RÉSOLU À L'APPEL, PAS À L'IMPORT, et c'est délibéré : les tests de
   * cette pièce posent un `fetch` de substitution par `vi.stubGlobal`, et un
   * `fetch` capturé au chargement du module ne le verrait jamais. Seul
   * `installerTransportResilient` passe une base explicite — celle qu'il a
   * capturée avant de se mettre à la place du global, sans quoi l'enrobage
   * s'appellerait lui-même indéfiniment.
   */
  base: (e: RequestInfo | URL, o?: RequestInit) => Promise<Response> = (e, o) => fetch(e, o),
): Promise<Response> {
  let derniere: unknown = null;

  for (let essai = 0; essai <= attentes.length; essai += 1) {
    try {
      return await base(entree, options);
    } catch (erreur) {
      derniere = erreur;
      const message = erreur instanceof Error ? erreur.message : String(erreur);

      // Une requête ANNULÉE volontairement n'est pas un hoquet : la réessayer
      // irait contre l'intention de celui qui a annulé.
      if (options?.signal?.aborted === true || /abort/i.test(message)) throw erreur;
      if (!estReseauInstable({ message })) throw erreur;

      const attente = attentes[essai];
      if (attente === undefined) break;
      console.warn(
        `[harnais] Transport interrompu (${message}). Nouvelle tentative dans ` +
          `${attente} ms. Ce n'est PAS un défaut du produit.`,
      );
      await patienter(attente);
    }
  }

  throw new Error(
    `[harnais] Transport interrompu après ${attentes.length + 1} tentatives. ` +
      "CE N'EST PAS LE PRODUIT — aucune réponse HTTP n'a été obtenue. " +
      `Dernier message : ${derniere instanceof Error ? derniere.message : String(derniere)}`,
  );
}

let installe = false;

/**
 * Pose le transport résilient comme `fetch` AMBIANT du processus de test.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ POURQUOI CELA NE SUFFISAIT PAS DE L'INSTALLER SUR LES CLIENTS DU HARNAIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La première version du remède, posée le 01/09/2026, passait `fetchResilient`
 * aux seuls clients fabriqués ICI, et son commentaire disait : « les clients du
 * produit gardent le `fetch` par défaut ». C'était vrai du champ de vision de
 * la correction — les dix échecs de ce jour-là portaient tous sur la création
 * ou la suppression d'un compte, donc sur un client du harnais.
 *
 * Le lendemain, `tests/rls/veille.test.ts` est parti en rouge sur exactement le
 * même `fetch failed`, mais à l'intérieur de `veillerSur`, c'est-à-dire dans un
 * client que le PRODUIT fabrique lui-même et qu'aucune injection n'atteint. La
 * garde regardait là où le défaut n'est plus : c'est L-025, appliqué au harnais
 * cette fois. Le remède est donc remonté d'un cran, au `fetch` du processus.
 *
 * ⚠️ CE N'EST PAS « PLIER LE PRODUIT AU TEST ». Le produit n'est pas modifié :
 * il continue de LEVER quand une lecture échoue, ce qui est le comportement
 * voulu — un écran d'administration doit échouer visiblement plutôt qu'afficher
 * un chiffre faux, et un veilleur qui n'a pas pu lire n'a pas veillé. Ce qui
 * change est l'ENVIRONNEMENT dans lequel il tourne pendant les tests, et il ne
 * change que pour la classe d'erreur où `fetch` n'a rendu AUCUNE réponse. Un
 * défaut du produit se présente sous forme de réponse HTTP ou d'erreur logique ;
 * ni l'une ni l'autre n'est réessayée ici.
 *
 * ⚠️ ELLE N'EST PAS POSÉE SUR LE PROJET `unit`, qui n'a pas de fichier de mise
 * en place : les tests qui éprouvent `fetchResilient` y substituent le `fetch`
 * global, et un enrobage ambiant les ferait mesurer autre chose qu'eux-mêmes.
 */
export function installerTransportResilient(): void {
  if (installe) return;
  installe = true;

  // CAPTURÉ AVANT LA SUBSTITUTION. Sans cette copie, l'enrobage relirait
  // `globalThis.fetch` — donc lui-même — et récurserait jusqu'à la pile pleine.
  const natif = globalThis.fetch.bind(globalThis);

  globalThis.fetch = ((entree: RequestInfo | URL, options?: RequestInit) =>
    fetchResilient(entree, options, REESSAIS_TRANSPORT_MS, natif)) as typeof globalThis.fetch;
}
