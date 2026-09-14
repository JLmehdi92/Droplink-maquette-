/**
 * DEUX SÉRIES CONCORDANTES — le protocole de mesure du projet, en un seul
 * exemplaire.
 *
 * ⚠️ IL VIVAIT EN QUATRE COPIES, ET ELLES AVAIENT DIVERGÉ. Trois refusaient deux
 * séries discordantes ; celle du banc des boutiques ne vérifiait RIEN et
 * retenait la pire des deux, quelle qu'elle soit. Une règle recopiée finit par
 * se contredire, et la copie la plus permissive est celle qu'on ne relit pas.
 *
 * LE PROTOCOLE : deux rodages JETÉS (mesuré le 31/08/2026, un seul laissait
 * passer un accès disque froid), puis deux séries. Si elles concordent — moins
 * de 60 % d'écart, ou toutes deux sous 10 ms —, la PIRE est retenue.
 *
 * ⚠️ SINON, UNE TROISIÈME SÉRIE, ET UNE SEULE. Mesuré le 14/09/2026 : « 8,6 ms
 * puis 30,7 ms » sur une requête de quelques millisecondes. Le temps relevé est
 * celui d'EXÉCUTION côté serveur, et les fichiers du banc tournent un par un :
 * c'est la charge de l'instance partagée qui a pris vingt millisecondes à une
 * série. Ce n'est pas relancer jusqu'au vert — l'exigence reste deux séries
 * concordantes au même seuil, la troisième départage, la pire valeur de la
 * paire est comparée au seuil, et la série écartée est ÉCRITE. Si aucune paire
 * ne concorde, la mesure échoue.
 */

export interface Chronometre {
  readonly ms: number;
}

export function concordent(a: Chronometre, b: Chronometre): boolean {
  const ecart = Math.abs(a.ms - b.ms) / Math.max(a.ms, b.ms);
  return !(ecart > 0.6 && Math.max(a.ms, b.ms) > 10);
}

function pire<M extends Chronometre>(a: M, b: M): M {
  return a.ms >= b.ms ? a : b;
}

export async function seriesConcordantes<M extends Chronometre>(mesurer: () => Promise<M>): Promise<M> {
  await mesurer();
  await mesurer(); // second rodage, jeté lui aussi
  const a = await mesurer();
  const b = await mesurer();
  if (concordent(a, b)) return pire(a, b);

  const c = await mesurer();
  if (concordent(a, c) || concordent(b, c)) {
    const [x, ecartee] = concordent(a, c) ? [a, b] : [b, a];
    console.warn(`  [banc] série écartée : ${ecartee.ms.toFixed(1)} ms (les deux autres concordent)`);
    return pire(x, c);
  }
  throw new Error(
    `Séries discordantes : ${a.ms.toFixed(1)}, ${b.ms.toFixed(1)} puis ${c.ms.toFixed(1)} ms. ` +
      "Aucune paire ne concorde : la mesure ne décrit rien de stable.",
  );
}
