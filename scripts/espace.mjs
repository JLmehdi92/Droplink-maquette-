/**
 * QUELLES TABLES RENDRE À L'ESPACE — la décision, séparée de son exécution.
 *
 * ⚠️ POURQUOI CETTE PIÈCE EXISTE, ET CE QU'ELLE REMPLACE.
 *
 * `purger-residus-de-test.mjs` portait une liste de cinq noms écrite en dur :
 * `order_events`, `orders`, `link_views`, `order_media`, `tracked_parcels`.
 * Mesuré le 01/09/2026 sur une base à 265 Mo juste après `pnpm test:perf` :
 *
 *     163 MB   9 lignes   public.orders
 *      37 MB 105 lignes   public.order_events
 *      21 MB   1 ligne    public.link_views
 *    7992 kB   1 ligne    public.tracked_parcels
 *    4976 kB   3 lignes   public.shops          ← ABSENTE de la liste
 *    3272 kB   4 lignes   public.usage_counters ← ABSENTE de la liste
 *
 * La liste attrapait l'essentiel et laissait huit mégaoctets par terre, sans que
 * rien ne le dise. C'est le défaut habituel d'une SÉLECTION : elle ne connaît
 * que ce que son auteur avait sous les yeux le jour où il l'a écrite, et le
 * schéma, lui, continue de grandir. Une nouvelle table qui gonfle n'y entrera
 * jamais toute seule.
 *
 * → ON INVENTORIE. La base rend ses tables et leur taille RÉELLE ; cette
 * fonction ne fait que trancher sur un seuil. Le jour où une table apparaît,
 * elle est couverte sans que personne n'ait à y penser.
 */

/**
 * Un mégaoctet.
 *
 * En dessous, `vacuum full` prend un verrou exclusif pour rendre quelques
 * kilooctets : le remède coûterait plus que le mal. Ce seuil n'est PAS une
 * valeur par défaut cachée — l'appelant le passe, pour que le coût soit lisible
 * à l'endroit où la décision se prend.
 */
export const SEUIL_RESTITUTION_OCTETS = 1_048_576;

/**
 * Les tables à compacter, de la plus grosse à la plus petite.
 *
 * L'ORDRE COMPTE. Un `vacuum full` peut être interrompu — délai, coupure,
 * Ctrl-C. Commencer par la plus grosse fait que ce qui a été rendu avant
 * l'interruption est le gros du gain, et non trois tables de deux mégaoctets.
 *
 * @param {readonly {table: string, octets: number|string|bigint}[]} inventaire
 * @param {number} seuilOctets
 * @returns {string[]}
 */
export function tablesARendre(inventaire, seuilOctets) {
  if (!Number.isFinite(seuilOctets) || seuilOctets <= 0) {
    throw new Error("seuil de restitution absent ou absurde : " + String(seuilOctets));
  }

  return [...inventaire]
    .filter((t) => Number(t.octets) >= seuilOctets)
    .sort((a, b) => Number(b.octets) - Number(a.octets))
    .map((t) => t.table);
}
