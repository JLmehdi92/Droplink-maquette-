import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * L'INVENTAIRE DES INDEX, COMPARÉ AUX MIGRATIONS DANS LES DEUX SENS.
 *
 * Un index qui disparaît ne casse RIEN. Aucune requête n'échoue, aucun test ne
 * rougit, aucune erreur n'est levée : le plan bascule sur un parcours séquentiel
 * et tout continue de répondre. À la volumétrie d'un environnement de
 * développement, c'est même imperceptible — et à neuf mille six cents commandes,
 * c'est le vendeur qui a le plus de données qui paie le premier.
 *
 * TROIS CIBLES DU FALSIFICATEUR SUPPRIMENT UN INDEX, et aucun test nommé ne les
 * surveillait : `orders_actives_recentes_idx`, `orders_jamais_ouvert_idx`,
 * `tracked_parcels_immobilite_idx`. Leur seul détecteur était le projet `perf`,
 * qui est HORS de `pnpm gates` — c'est-à-dire hors de ce qu'on lance avant de
 * commiter. La protection existait donc à l'endroit où on ne regarde pas.
 *
 * Ce contrôle ne mesure pas une performance : il constate une PRÉSENCE. C'est
 * complémentaire des mesures de plan, qui restent la seule chose capable de dire
 * qu'un index sert réellement — un index présent et inutilisé passerait ici sans
 * rien prouver, et c'est assumé.
 *
 * ⚠️ IL EST DÉRIVÉ DES MIGRATIONS, PAS D'UNE LISTE ÉCRITE À LA MAIN. Une liste
 * recopiée se périme au premier index ajouté, et sa péremption se lit comme un
 * succès. On rejoue donc les `create index` et les `drop index` dans l'ordre
 * lexicographique — qui EST l'ordre d'application — pour obtenir l'ensemble que
 * le dépôt décrit.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

const DOSSIER = join(process.cwd(), "supabase", "migrations");

/** Le SQL seul : un `create index` cité dans un commentaire n'en est pas un. */
function sqlSeul(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((ligne) => !/^\s*--/.test(ligne))
    .join("\n");
}

/**
 * Les index que le dépôt décrit, après rejeu des suppressions.
 *
 * Sans le rejeu des `drop index`, `orders_tri_defaut_idx` — créé par la 006,
 * remplacé par deux index partiels dans la 011 — serait déclaré manquant à
 * jamais. Et une sonde qui signale un défaut permanent qu'on ne corrigera pas
 * est une sonde qu'on apprend à ignorer.
 */
function indexDuDepot(): ReadonlySet<string> {
  const attendus = new Set<string>();
  for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = sqlSeul(readFileSync(join(DOSSIER, fichier), "utf8"));

    /*
     * ⚠️ LES DEUX ORDRES SONT LUS DANS LEUR ORDRE D'APPARITION, pas l'un après
     * l'autre. Une première version relevait tous les `create` puis tous les
     * `drop` : la 033 supprime `tracked_parcels_a_interroger_idx` et le recrée
     * aussitôt, six lignes plus bas, et le traitement en deux passes le
     * déclarait donc supprimé. L'index existait bel et bien en base — la sonde
     * le signalait comme posé à la main.
     */
    for (const trouve of sql.matchAll(
      /(create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?|drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?)([a-z0-9_]+)/gi,
    )) {
      const nom = (trouve[2] ?? "").toLowerCase();
      if ((trouve[1] ?? "").trim().toLowerCase().startsWith("drop")) attendus.delete(nom);
      else attendus.add(nom);
    }
  }
  return attendus;
}

describe("Inventaire des index", () => {
  /**
   * Les index appuyant une CONTRAINTE sont exclus : Postgres les crée lui-même
   * pour une clé primaire ou une contrainte d'unicité, et aucun `create index`
   * ne les décrit. Les inclure ferait signaler une trentaine de manques
   * permanents — c'est-à-dire rendrait la sonde illisible.
   *
   * L'exclusion se fait sur `pg_constraint.conindid`, PAS sur le suffixe du nom.
   * Un nom se choisit : `order_media_position_unique` appuie une contrainte sans
   * finir par `_key`, et un filtre par suffixe l'aurait déclaré orphelin.
   */
  async function indexDeLaBase(): Promise<readonly string[]> {
    const lignes = await interroger<{ nom: string }>(
      bd,
      `select c.relname as nom
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'i'
         and not exists (select 1 from pg_constraint k where k.conindid = c.oid)
       order by 1`,
    );
    return lignes.map((l) => l.nom);
  }

  test("la sonde inspecte réellement des index des deux côtés", async () => {
    // Deux ensembles vides s'accordent parfaitement, et c'est exactement le
    // résultat qu'une requête mal écrite produit.
    expect(indexDuDepot().size, "aucun index déclaré dans les migrations").toBeGreaterThan(10);
    expect((await indexDeLaBase()).length, "aucun index relevé en base").toBeGreaterThan(10);
  });

  test("aucun index décrit par les migrations ne manque à la base", async () => {
    const enBase = new Set(await indexDeLaBase());
    const manquants = [...indexDuDepot()].filter((nom) => !enBase.has(nom)).sort();

    expect(
      manquants,
      `Index décrits par les migrations et ABSENTS de la base : ${manquants.join(", ")}. ` +
        "Rien n'échouera pour autant : le plan bascule sur un parcours séquentiel " +
        "et tout continue de répondre, jusqu'à ce que le vendeur qui a le plus " +
        "de données en paie le prix.",
    ).toEqual([]);
  });

  test("aucun index de la base n'échappe aux migrations", async () => {
    /*
     * SECOND SENS, et il attrape un défaut différent : un index posé à la main
     * sur cet environnement. Il rend les mesures locales flatteuses, il n'existe
     * nulle part ailleurs, et un déploiement propre ne le reproduira jamais —
     * donc la dégradation apparaîtra en production, sur la seule base où
     * personne n'a joué.
     */
    const declares = indexDuDepot();
    const orphelins = (await indexDeLaBase()).filter((nom) => !declares.has(nom));

    expect(
      orphelins,
      `Index présents en base sans aucun \`create index\` dans les migrations : ` +
        `${orphelins.join(", ")}. Un environnement neuf ne les aura pas.`,
    ).toEqual([]);
  });

  test("les trois index que le falsificateur supprime sont bien surveillés", () => {
    /*
     * CONTRE-TEST CIBLÉ. Les deux contrôles ci-dessus sont des inventaires : ils
     * sont justes tant que le motif d'extraction voit ce qu'il doit voir. Si la
     * regex cessait un jour de reconnaître les `create index`, l'ensemble
     * attendu deviendrait VIDE et les deux inventaires passeraient au vert.
     *
     * On nomme donc les trois index dont on SAIT qu'une cible du falsificateur
     * les détruit. Ce n'est pas une liste de tous les index — ce serait la liste
     * recopiée qu'on refuse — c'est le témoin qui prouve que l'extraction
     * fonctionne encore.
     */
    const declares = indexDuDepot();
    for (const nom of [
      "orders_actives_recentes_idx",
      "orders_jamais_ouvert_idx",
      "tracked_parcels_immobilite_idx",
    ]) {
      expect(
        declares.has(nom),
        `${nom} n'est plus extrait des migrations : l'inventaire ne le surveille ` +
          "donc plus, et sa suppression passerait inaperçue.",
      ).toBe(true);
    }
  });
});
