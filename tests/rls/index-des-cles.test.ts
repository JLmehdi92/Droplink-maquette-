import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * CHAQUE CLÉ ÉTRANGÈRE EST INDEXÉE — audit du 20/09/2026.
 *
 * `orders.cover_media_id` référence `order_media` avec `on delete set null`, et n'avait aucun
 * index. Retirer UNE photo faisait donc balayer TOUTES les commandes de la plateforme, pour
 * trouver celles dont c'était la couverture (EXPLAIN relevé : Seq Scan sur 19 200 lignes). Le
 * coût d'un geste de vendeur croissait avec le volume de tous les autres vendeurs réunis.
 *
 * Personne ne l'avait écrit, parce qu'aucun contrôle ne le demandait : un index oublié ne se
 * voit pas à faible volume. INVENTAIRE, donc : toute clé étrangère de `public` doit être le
 * PRÉFIXE d'un index, sauf exception déclarée avec sa raison. Et l'échec vaut dans les deux
 * sens : une exception qui ne désigne plus rien, ou dont la clé est désormais indexée, fait
 * échouer aussi.
 */

const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    "link_contests.decided_by",
    "l'administrateur qui a tranché une contestation : quelques lignes par mois, et aucune " +
      "suppression de compte administrateur ne balaie la table au point que l'index paie son entretien",
  ],
  [
    "system_settings.updated_by",
    "l'auteur d'un réglage système : une dizaine de lignes en tout, un balayage coûte moins qu'un index",
  ],
]);

let catalogue: Client;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await catalogue.end();
});

describe("Les clés étrangères de public", () => {
  test("chacune est le préfixe d'un index, sauf exception déclarée — et aucune exception n'est morte", async () => {
    const lignes = await interroger<{ cle: string; couverte: boolean }>(
      catalogue,
      `select c.conrelid::regclass::text || '.' ||
              string_agg(a.attname, ',' order by k.ord) as cle,
              exists (
                select 1 from pg_index i
                 where i.indrelid = c.conrelid
                   and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
              ) as couverte
         from pg_constraint c
         cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'f'
          and c.connamespace = 'public'::regnamespace
        group by c.oid, c.conrelid, c.conkey`,
    );
    const cles = lignes.map((l) => ({ cle: l.cle.replace(/^public\./, ""), couverte: l.couverte }));

    // UN ENSEMBLE VIDE PASSE TOUT.
    expect(cles.length, "aucune clé étrangère lue : la requête ne voit rien").toBeGreaterThan(10);
    // CONTRE-TEST : la requête sait reconnaître une clé couverte.
    expect(cles.filter((c) => c.couverte).length, "aucune clé reconnue comme indexée").toBeGreaterThan(5);

    const nues = cles.filter((c) => !c.couverte && !EXCEPTIONS.has(c.cle)).map((c) => c.cle);
    expect(nues, "clés étrangères sans index").toEqual([]);

    const parCle = new Map(cles.map((c) => [c.cle, c.couverte]));
    const mortes = [...EXCEPTIONS.keys()].filter((c) => !parCle.has(c) || parCle.get(c) === true);
    expect(mortes, "exceptions qui ne désignent plus une clé nue").toEqual([]);
  });
});
