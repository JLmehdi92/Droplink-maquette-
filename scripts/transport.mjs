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
 * sa première séparation. Il est importé par `charger-env.ts`, donc évalué AVANT
 * que `dotenv` n'ait chargé `.env.local` : y lire `process.env` rendrait des
 * valeurs vides, silencieusement.
 *
 * ⚠️ ET IL VIT DANS `scripts/` ET NON DANS `tests/`, DEPUIS LE 01/09/2026.
 * `pnpm fumee` est un script `.mjs` : il ne peut pas importer de TypeScript, et
 * il fabrique son PROPRE client Supabase. Il subissait donc le hoquet de
 * transport sans aucune protection — mesuré le jour même : une écriture de mise
 * en place perdue, et trois écarts qui accusaient l'éditeur deux cents lignes
 * plus loin. Le remède devait couvrir les DEUX, donc vivre là où les deux
 * peuvent le lire. `tests/aide/transport.ts` n'en est plus que la façade typée.
 */

/** @type {readonly number[]} */
const REESSAIS_TRANSPORT_MS = Object.freeze([300, 900, 2_000]);

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
/**
 * @param {{status?: number|undefined, message: string}|null} erreur
 * @returns {boolean}
 */
export function estReseauInstable(erreur) {
  if (erreur === null) return false;
  if (erreur.status === 502 || erreur.status === 503 || erreur.status === 504) return true;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminated/i.test(
    erreur.message,
  );
}

/** @param {number} ms */
export async function patienter(ms) {
  await new Promise((resoudre) => setTimeout(resoudre, ms));
}

/**
 * @param {RequestInfo|URL} entree
 * @param {RequestInit} [options]
 * @param {readonly number[]} [attentes]
 * @param {(e: RequestInfo|URL, o?: RequestInit) => Promise<Response>} [base]
 * @returns {Promise<Response>}
 */
export async function fetchResilient(
  entree,
  options,
  // Injectable pour que la suite puisse éprouver la borne sans attendre 3,2 s.
  // `supabase-js` n'appelle jamais qu'avec deux arguments : le défaut règne.
  attentes = REESSAIS_TRANSPORT_MS,
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
  base = (e, o) => fetch(e, o),
) {
  /** @type {unknown} */
  let derniere = null;

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


/**
 * LES HÔTES QU'AUCUNE SUITE NE DOIT JOINDRE, ET POURQUOI CEUX-LÀ.
 *
 * ⚠️ DÉFAUT RÉEL, CONSTATÉ LE 01/09/2026 À LA MINUTE OÙ LES CLÉS ONT ÉTÉ
 * POSÉES. Tant que `.env.local` était vide, la suite ne pouvait joindre
 * personne. Les clés renseignées, la MÊME suite s'est mise à :
 *
 *   - appeler `/register` chez le fournisseur de suivi, dont le quota est de
 *     **200 prises en charge À VIE** — mesuré après coup : `quota_used: 0`,
 *     parce qu'un enregistrement REJETÉ ne coûte rien. C'était de la CHANCE,
 *     pas de la conception : un numéro qu'ils auraient accepté aurait brûlé du
 *     quota définitivement ;
 *   - émettre de VRAIS événements d'usage dans le projet d'analytics de
 *     production — `order_created` en tête, qui est le DÉNOMINATEUR du taux
 *     d'activation. « Une métrique de verdict légèrement faussée est pire
 *     qu'une métrique cassée, parce qu'elle reste crédible. »
 *
 * Le second est le plus grave : il ne coûte pas d'argent, il corrompt le seul
 * livrable de la phase de validation.
 *
 * ⚠️ CE BLOCAGE EST LA VRAIE PROTECTION ; retirer les clés de l'environnement
 * n'en est pas une. Une protection qui tient à une ABSENCE n'est pas une
 * protection (L-029) : il suffirait que quelqu'un relise une clé autrement, ou
 * qu'un module la mémorise avant la neutralisation, pour que les appels
 * repartent. Ici, c'est le TRANSPORT qui refuse, et il refuse bruyamment.
 *
 * ⚠️ CE QUI N'EST PAS BLOQUÉ, ET DÉLIBÉRÉMENT : Supabase (c'est le système sous
 * test) et le dépôt d'objets, que `pnpm check:r2` éprouve pour de vrai de bout
 * en bout. On ne bloque que ce dont un appel COÛTE ou POLLUE.
 */
const HOTES_INTERDITS = [
  // Le fournisseur de suivi : 200 prises en charge à vie.
  "api.17track.net",
  // L'analytics : chaque événement de test fausse la métrique de verdict.
  "posthog.com",
  "i.posthog.com",
];

/** Vrai si l'hôte est interdit, sous-domaines compris. */
/** @param {string} hote @returns {boolean} */
function hoteInterdit(hote) {
  const propre = hote.toLowerCase();
  return HOTES_INTERDITS.some((i) => propre === i || propre.endsWith("." + i));
}

/**
 * L'hôte visé par un appel, quelle que soit la forme de son premier argument.
 *
 * `fetch` accepte une chaîne, une `URL` ou une `Request` : n'en traiter qu'une
 * laisserait les deux autres passer, et la garde regarderait à côté.
 */
/**
 * @param {RequestInfo|URL} entree
 * @returns {string|null}
 */
export function hoteDe(entree) {
  try {
    if (typeof entree === "string") return new URL(entree).hostname;
    if (entree instanceof URL) return entree.hostname;
    return new URL(/** @type {Request} */ (entree).url).hostname;
  } catch {
    // Une URL relative n'a pas d'hôte : elle ne peut viser aucun tiers.
    return null;
  }
}

/** Ce que le transport oppose à un appel interdit. Exporté pour être éprouvé. */
/**
 * @param {RequestInfo|URL} entree
 * @returns {Error|null}
 */
export function refusDHote(entree) {
  const hote = hoteDe(entree);
  if (hote === null || !hoteInterdit(hote)) return null;
  return new Error(
    `[harnais] APPEL SORTANT REFUSÉ vers « ${hote} ». Aucune suite ne doit ` +
      "joindre ce tiers : chez le fournisseur de suivi un enregistrement " +
      "consomme un quota de 200 À VIE, et chez l'analytics chaque événement " +
      "fausse la métrique de verdict de la phase. Substituer `fetch` dans le " +
      "test, ou éprouver ce chemin par un script dédié hors de la suite.",
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
/** @returns {void} */
export function installerTransportResilient() {
  if (installe) return;
  installe = true;

  // CAPTURÉ AVANT LA SUBSTITUTION. Sans cette copie, l'enrobage relirait
  // `globalThis.fetch` — donc lui-même — et récurserait jusqu'à la pile pleine.
  const natif = globalThis.fetch.bind(globalThis);

  globalThis.fetch = /** @type {typeof globalThis.fetch} */ ((entree, options) => {
    // LE REFUS VIENT AVANT LE RÉESSAI : réessayer un appel interdit le ferait
    // partir trois fois de plus.
    const refus = refusDHote(entree);
    if (refus !== null) return Promise.reject(refus);
    return fetchResilient(entree, options, REESSAIS_TRANSPORT_MS, natif);
  });
}
