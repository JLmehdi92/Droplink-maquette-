import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * CHAQUE ACTION AUDITÉE A SON LIBELLÉ, DANS LES DEUX LANGUES.
 *
 * L'ÉCRAN DU JOURNAL AFFICHAIT DES IDENTIFIANTS TECHNIQUES. Le produit écrit
 * huit actions distinctes — `boutiques.liste`, `compte.suspension`,
 * `parametre.modification`… — et le catalogue n'en traduisait que DEUX. Les six
 * autres tombaient sur la valeur de repli, c'est-à-dire sur la chaîne brute
 * stockée en base.
 *
 * Le journal d'audit est la pièce qu'on produirait en cas de litige. Y lire
 * `parametre.modification` au lieu de « Modification d'un paramètre système »
 * n'est pas une coquetterie : c'est un document qui cesse d'être lisible par qui
 * ne connaît pas le schéma.
 *
 * ET LES DEUX LIBELLÉS QUI EXISTAIENT ÉTAIENT MORTS. Leurs clés portaient un
 * point — `comptes.liste` — recopié de la valeur réelle. next-intl traite le
 * point comme un séparateur de niveau et REFUSE qu'une clé en porte un : il
 * levait `INVALID_KEY` au chargement du catalogue, donc sur toute page appelant
 * `getTranslations`, la landing comprise. En développement, deux clés d'un écran
 * d'administration cassaient le produit entier.
 *
 * Trouvé en lançant simplement `pnpm dev`. Aucune porte ne le voyait : le build
 * de production ne fait pas cette validation, la fumée sert ce build, et le test
 * de parité APLATIT les catalogues en chemins pointés — donc une clé fautive s'y
 * écrit exactement comme deux niveaux légitimes.
 *
 * LA SONDE INVENTORIE DEPUIS LA BASE, pas depuis une liste écrite à la main. Une
 * liste se périme à la prochaine action ajoutée, et personne ne pense à traduire
 * ce qu'il vient d'écrire dans une migration. C'est le catalogue Postgres qui
 * dit ce que le produit écrit réellement.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await bd.end();
});

/**
 * Les actions que le produit écrit réellement dans le journal d'administration.
 *
 * DEUX CHEMINS D'ÉCRITURE, ET LA PREMIÈRE VERSION N'EN VOYAIT QU'UN. La plupart
 * des actions passent par `journaliser_admin`, mais `tracer_parametre` — le
 * déclencheur qui trace les changements de réglages — insère DIRECTEMENT dans
 * `admin_audit_log`. Chercher les appelants de la fonction laissait donc
 * échapper `parametre.creation` et `parametre.modification`, c'est-à-dire
 * exactement les deux actions dont le brief dit qu'« un paramètre modifiable
 * sans trace est pire qu'un paramètre figé ».
 *
 * La sonde interroge donc les deux : qui appelle la fonction, ET qui touche la
 * table. C'est le second qui compte le plus — il n'a besoin de la permission de
 * personne pour exister.
 */
async function actionsDuProduit(): Promise<string[]> {
  const lignes = await interroger<{ action: string }>(
    bd,
    `select distinct (regexp_matches(p.prosrc, $motif$'([a-z]+\\.[a-z]+)'$motif$, 'g'))[1] as action
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (p.prosrc like '%journaliser_admin%' or p.prosrc like '%admin_audit_log%')`,
  );

  // Les chaînes pointées d'une fonction ne sont pas toutes des actions : on
  // écarte ce qui appartient au vocabulaire de Postgres et du dépôt.
  const horsSujet = /^(droplink|request|jwt|pg|auth|information_schema|public|supabase)\./;
  return [...new Set(lignes.map((l) => l.action))].filter((a) => !horsSujet.test(a)).sort();
}

function libelles(langue: string): Record<string, string> {
  const catalogue = JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8"),
  ) as { admin: { journal: { actions: Record<string, string> } } };
  return catalogue.admin.journal.actions;
}

describe("Les libellés du journal d'audit", () => {
  test("la sonde trouve réellement les actions", async () => {
    // Un ensemble vide passe tout : si l'extraction cessait de fonctionner, le
    // contrôle suivant certifierait un catalogue complet sans rien comparer.
    const actions = await actionsDuProduit();
    expect(
      actions.length,
      "aucune action d'audit trouvée dans le catalogue Postgres : la sonde ne regarde rien",
    ).toBeGreaterThan(4);
  });

  test.each(["fr", "en"])("catalogue %s : aucune action sans libellé", async (langue) => {
    const table = libelles(langue);
    const actions = await actionsDuProduit();

    // LE POINT DEVIENT UN SOULIGNÉ : next-intl refuse un point dans une clé, et
    // c'est l'écran qui fait la conversion. La sonde applique la même règle,
    // sans quoi elle éprouverait une correspondance que le produit n'emploie pas.
    const manquantes = actions.filter((a) => table[a.replaceAll(".", "_")] === undefined);
    expect(
      manquantes,
      `Actions auditées sans libellé ${langue} : ${manquantes.join(", ")}. ` +
        "L'écran affichera l'identifiant technique brut — or le journal est la " +
        "pièce qu'on produit en cas de litige.",
    ).toEqual([]);
  });

  test.each(["fr", "en"])("catalogue %s : aucun libellé orphelin", async (langue) => {
    // LE SECOND SENS. Un libellé qui ne correspond à aucune action est le reste
    // d'une action renommée ou retirée : il survit indéfiniment, et donne à
    // croire que l'écran couvre un cas qui n'existe plus.
    const attendues = new Set((await actionsDuProduit()).map((a) => a.replaceAll(".", "_")));
    const orphelins = Object.keys(libelles(langue)).filter((c) => !attendues.has(c));

    expect(
      orphelins,
      `Libellés ${langue} ne correspondant à aucune action écrite par le produit : ` +
        `${orphelins.join(", ")}.`,
    ).toEqual([]);
  });
});
