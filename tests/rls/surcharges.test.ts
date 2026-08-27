import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * AUCUNE FONCTION DE `public` NE PORTE DEUX SIGNATURES.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE SONDE EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `appliquer_etat_colis` a vécu en DEUX exemplaires pendant plusieurs
 * migrations : une version à huit arguments rendant `integer`, et la vraie à
 * neuf. La seconde ne venait d'aucune migration — elle venait du
 * FALSIFICATEUR, dont la cible `statut-colis-recule` écrivait un
 * `create or replace` avec l'ancienne liste d'arguments.
 *
 * ⚠️ LA CONSÉQUENCE N'ÉTAIT PAS LE RÉSIDU, C'ÉTAIT LA FALSIFICATION ELLE-MÊME.
 * Cette cible devait prouver que le statut d'un colis ne peut pas reculer. Elle
 * n'a jamais touché la fonction qu'elle visait : elle en créait une seconde,
 * que personne n'appelle. La suite restait verte — non parce que la garde
 * tenait, mais parce que l'outil chargé de la casser tapait à côté.
 *
 * Le piège est documenté dans le dépôt depuis longtemps : `create or replace`
 * NE REMPLACE PAS une fonction dont la liste d'arguments change, il en crée une
 * SECONDE, les deux coexistent, et un appel résout l'ANCIENNE sans la moindre
 * erreur. Le connaître n'a pas suffi. Ce qui manquait, c'est quelque chose qui
 * l'INTERROGE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI AUCUNE RELECTURE NE POUVAIT LE VOIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le défaut ne vivait dans AUCUN fichier. Chaque migration, prise seule, était
 * correcte ; le falsificateur, lu seul, était plausible. Seul le catalogue le
 * portait. C'est la même famille que les droits d'exécution : une propriété qui
 * vit en base est invisible à toute lecture de code, et ne peut être établie
 * que par une requête.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LA SONDE FAIT, ET DANS LES DEUX SENS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle INVENTORIE plutôt que de sélectionner : elle rend TOUTES les fonctions de
 * `public` portant plus d'une signature, et le test déclare les exceptions avec
 * leur raison. Elle échoue donc dans les deux sens — une surcharge non déclarée,
 * ET une déclaration devenue inutile, qui couvrirait le jour où le problème
 * revient.
 *
 * Une surcharge n'est pas interdite par nature ; elle est interdite PAR DÉFAUT,
 * parce que dans ce dépôt elle a toujours été un accident et jamais une
 * intention.
 */

/**
 * Les surcharges ADMISES, avec leur raison.
 *
 * Vide aujourd'hui, et c'est une information : aucune fonction de ce produit
 * n'a jamais eu besoin de deux signatures. Le jour où une entrée apparaît ici,
 * elle doit dire pourquoi les deux versions sont voulues et laquelle les
 * appels résolvent.
 */
const SURCHARGES_ADMISES: ReadonlyMap<string, string> = new Map();

interface Surcharge extends Record<string, unknown> {
  readonly nom: string;
  readonly nombre: number;
  readonly signatures: string;
}

let catalogue: Client;
let toutes: Surcharge[] = [];
let nombreDeFonctions = 0;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();

  const total = await interroger<{ n: number }>(
    catalogue,
    `select count(*)::int as n
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'`,
  );
  nombreDeFonctions = total[0]?.n ?? 0;

  toutes = await interroger<Surcharge>(
    catalogue,
    `select p.proname as nom,
            count(*)::int as nombre,
            string_agg(pg_get_function_identity_arguments(p.oid), ' || '
                       order by pg_get_function_identity_arguments(p.oid)) as signatures
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
      group by p.proname
     having count(*) > 1
      order by p.proname`,
  );
}, 60_000);

afterAll(async () => {
  await catalogue.end();
});

describe("Les surcharges du schéma public", () => {
  test("la sonde inspecte réellement le catalogue — un ensemble vide passe tout", () => {
    /*
     * TOUT GARDE DOIT PROUVER QU'IL INSPECTE QUELQUE CHOSE avant de prouver que
     * ce quelque chose est correct. Sans ce contrôle, une requête qui viserait
     * le mauvais schéma, ou un `prokind` mal choisi, rendrait zéro ligne — et
     * zéro surcharge non déclarée, donc un test vert qui n'a rien regardé.
     */
    expect(
      nombreDeFonctions,
      "aucune fonction relevée dans public : la requête vise à côté",
    ).toBeGreaterThan(30);
  });

  test("aucune fonction ne porte deux signatures sans raison déclarée", () => {
    const nonDeclarees = toutes.filter((s) => !SURCHARGES_ADMISES.has(s.nom));

    expect(
      nonDeclarees.map((s) => `${s.nom} (${s.nombre}) : ${s.signatures}`),
      "Ces fonctions existent en plusieurs exemplaires. Un appel résout l'UNE " +
        "des deux, sans erreur, et rien ne dit laquelle. Supprimer la version " +
        "morte par une NOUVELLE migration, ou la déclarer ici avec sa raison.",
    ).toEqual([]);
  });

  test("aucune surcharge déclarée n'est périmée", () => {
    // L'AUTRE SENS. Une exception posée pour une raison disparue survit
    // indéfiniment et couvre exactement le jour où le problème revient.
    const presentes = new Set(toutes.map((s) => s.nom));
    const perimees = [...SURCHARGES_ADMISES.keys()].filter((nom) => !presentes.has(nom));

    expect(
      perimees,
      "Ces surcharges sont déclarées admises alors qu'elles n'existent plus : " +
        perimees.join(", "),
    ).toEqual([]);
  });

  test("CONTRE-TEST : la requête SAIT voir une surcharge quand il y en a une", async () => {
    /*
     * Une suite où tout est refusé passe à cent pour cent sans rien prouver, et
     * c'est le risque exact ici : les trois contrôles ci-dessus sont satisfaits
     * par une requête qui ne rend JAMAIS rien.
     *
     * On en fabrique donc une, dans une transaction annulée : deux fonctions du
     * même nom, listes d'arguments différentes — c'est-à-dire précisément ce que
     * produisait le falsificateur. La sonde doit la voir.
     */
    await catalogue.query("begin");
    try {
      await catalogue.query(
        `create function public.temoin_de_surcharge(a integer) returns integer
           language sql set search_path = '' as 'select a'`,
      );
      await catalogue.query(
        `create function public.temoin_de_surcharge(a integer, b integer) returns integer
           language sql set search_path = '' as 'select a + b'`,
      );

      const vues = await interroger<Surcharge>(
        catalogue,
        `select p.proname as nom, count(*)::int as nombre, '' as signatures
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'temoin_de_surcharge'
          group by p.proname having count(*) > 1`,
      );

      expect(vues.length, "la sonde ne voit pas une surcharge pourtant présente").toBe(1);
      expect(vues[0]?.nombre).toBe(2);
    } finally {
      // ROLLBACK, jamais un `drop` : si l'un des deux `create` échoue, un `drop`
      // écrit à la main laisserait l'autre en place — donc un témoin de test
      // définitivement installé dans le schéma du produit.
      await catalogue.query("rollback");
    }

    const restant = await interroger<{ n: number }>(
      catalogue,
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'temoin_de_surcharge'`,
    );
    expect(restant[0]?.n, "le témoin a survécu à l'annulation").toBe(0);
  });
});
