/**
 * UN APPEL À SUPABASE QUI NE RÉPOND PAS EST ABANDONNÉ — il n'est pas attendu.
 *
 * Mesuré le 04/09/2026 : `/fr/analyses` a rendu un 500 après 10,7 s, le serveur
 * d'authentification ne répondant pas. Le refus était voulu ; c'est l'ATTENTE
 * qui n'était bornée nulle part. Le `fetch` de Node n'a pas de délai par défaut
 * sur la réponse : une connexion ouverte et muette retenait la page aussi
 * longtemps que la pile réseau le voulait, et les requêtes suivantes du même
 * vendeur s'empilaient derrière.
 *
 * La borne est posée dans le `fetch` de CHAQUE client Supabase du serveur. Au-delà,
 * l'appel est abandonné par un `TimeoutError`, dont le message (« …timeout ») est
 * reconnu par `estPanneDeTransport` : il emprunte donc les chemins de panne qui
 * existent déjà — `SessionIndisponible` pour l'authentification, « lecture
 * illisible » pour les panneaux — au lieu d'en inventer un nouveau.
 *
 * ⚠️ DIX SECONDES, ET PAS MOINS. Les lectures les plus lourdes du produit se
 * mesurent en dizaines de millisecondes (banc `test:perf`, 9 600 commandes) ; la
 * borne ne doit couper qu'une attente qui n'aboutira pas, jamais une requête
 * lente mais saine. Un export de 5 000 lignes ne s'en approche pas.
 */
export const BORNE_SUPABASE_MS = 10_000;

/**
 * Enrobe `fetch` d'une borne de durée. Le signal de l'appelant, s'il y en a un,
 * est toujours honoré : la borne s'AJOUTE à l'annulation, elle ne la remplace pas.
 *
 * Le `fetch` sous-jacent est lu AU MOMENT DE L'APPEL, pas à la création : un
 * enrobage posé ailleurs sur `globalThis.fetch` (instrumentation, tests) reste
 * traversé.
 */
export function fetchBorne(borneMs: number = BORNE_SUPABASE_MS, sous?: typeof fetch): typeof fetch {
  return async (entree, init) => {
    /*
     * Une minuterie EXPLICITE plutôt que `AbortSignal.timeout` : elle est
     * libérée dès que la réponse arrive — des milliers d'appels ne laissent pas
     * des milliers de minuteries de dix secondes en vol — et elle obéit aux
     * horloges simulées des tests, qui ne pilotent pas celle de `timeout`.
     */
    /*
     * ⚠️ NOMMÉE `AbortError`, ET C'EST MESURÉ. `postgrest-js` 2.112 RÉESSAIE
     * seul une lecture en échec réseau — trois fois, après 1, 2 puis 4 s — sauf
     * si l'erreur s'appelle `AbortError`. Nommée `TimeoutError`, une lecture
     * muette attendait 10 + 1 + 10 + 2 + 10 + 4 + 10 ≈ 47 s : la borne aurait
     * quadruplé l'attente qu'elle devait couper. Après dix secondes de silence,
     * réessayer n'est pas de la résilience. Les coupures FRANCHES (connexion
     * réinitialisée) restent réessayées par la bibliothèque, comme prévu.
     *
     * Le message garde « timeout » : c'est ce que `estPanneDeTransport` lit.
     */
    const controleur = new AbortController();
    const minuterie = setTimeout(() => {
      controleur.abort(new DOMException("The operation was aborted due to timeout", "AbortError"));
    }, borneMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, controleur.signal]) : controleur.signal;
    try {
      return await (sous ?? globalThis.fetch)(entree, { ...init, signal });
    } finally {
      clearTimeout(minuterie);
    }
  };
}
