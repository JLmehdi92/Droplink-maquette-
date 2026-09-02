import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * LE BRIEF DÉCRIT-IL LA BASE QUI EXISTE ?
 *
 * Le motif le plus tenace de ce projet, rencontré cinq fois : UN DOCUMENT
 * AFFIRME UN ÉTAT QUE PERSONNE N'A EXÉCUTÉ. Le bloc « Les tables » du brief
 * citait `notifications_sent`, qui n'a jamais existé, et `public_rate_limit`,
 * dont le vrai nom est `rate_limit`. Deux affirmations assez précises pour être
 * crues et assez discrètes pour n'être jamais vérifiées — et le brief est le
 * document qu'on relit AVANT d'écrire une migration.
 *
 * Un décompte ou une liste écrits à la main se périment à chaque session. Le
 * taux d'échec observé de « penser à mettre à jour » est de trois sur trois. On
 * les remplace donc par LA REQUÊTE QUI LES PRODUIT.
 *
 * ELLE ÉCHOUE DANS LES DEUX SENS, sans quoi elle ne prouverait que la moitié :
 * une table décrite et absente est une promesse creuse ; une table présente et
 * non décrite est une surface que personne ne relit avant d'écrire.
 *
 * ELLE NE COMPARE QUE LES NOMS DE TABLES. Comparer les colonnes ferait de ce
 * fichier une seconde source de vérité à tenir à jour — exactement le défaut
 * qu'il corrige. Les colonnes vivent dans `supabase/migrations/`, et le brief le
 * dit désormais.
 */

let bd: Client;

const BRIEF = join(process.cwd(), "BRIEF-DROPLINK-COMPLET.md");

/** Les tables nommées dans le bloc « Les tables » du brief. */
function tablesDuBrief(): string[] {
  const texte = readFileSync(BRIEF, "utf8");
  const debut = texte.indexOf("### Les tables — RLS activée sur TOUTES");
  expect(debut, "le bloc « Les tables » a disparu du brief").toBeGreaterThan(-1);

  const ouvre = texte.indexOf("```", debut);
  const ferme = texte.indexOf("```", ouvre + 3);
  const bloc = texte.slice(ouvre + 3, ferme);

  // Un nom de table est en début de ligne, sans indentation : les lignes de
  // continuation d'une description sont indentées, et ne doivent pas être prises
  // pour des tables.
  const noms = new Set<string>();
  for (const ligne of bloc.split("\n")) {
    // `\s|$` et non `\s` seul : un nom trop long pour tenir avec sa description
    // occupe sa ligne à lui seul. La première version exigeait un espace après
    // le nom, et laissait donc échapper exactement les tables aux noms les plus
    // longs — celles qu'on vient d'ajouter.
    const m = /^([a-z][a-z0-9_]*)(?:\s|$)/.exec(ligne.trimEnd());
    if (m?.[1] !== undefined) noms.add(m[1]);
  }
  return [...noms].sort();
}

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
}, 60_000);

afterAll(async () => {
  await bd.end();
});

describe("Le brief décrit la base qui existe", () => {
  test("la sonde lit réellement le bloc", () => {
    // Un ensemble vide passe tout. Si le bloc changeait de forme — un titre
    // reformulé, une clôture de bloc déplacée — la comparaison porterait sur
    // rien et passerait en beauté.
    const noms = tablesDuBrief();
    expect(
      noms.length,
      "aucune table extraite du brief : la sonde ne compare rien",
    ).toBeGreaterThan(10);
  });

  test("aucune table décrite au brief n'est absente de la base", async () => {
    const reelles = new Set(
      (
        await interroger<{ tablename: string }>(
          bd,
          "select tablename from pg_tables where schemaname = 'public'",
        )
      ).map((l) => l.tablename),
    );

    const fantomes = tablesDuBrief().filter((t) => !reelles.has(t));
    expect(
      fantomes,
      `Tables décrites au brief mais ABSENTES de la base : ${fantomes.join(", ")}. ` +
        "Le brief est ce qu'on relit avant d'écrire une migration : une table " +
        "qui n'existe que là est une promesse sur laquelle quelqu'un s'appuiera.",
    ).toEqual([]);
  });

  test("aucune table de la base n'est absente du brief", async () => {
    // LE SECOND SENS. Sans lui, le brief resterait « vrai » en décrivant trois
    // tables sur seize — et une table qu'aucun document ne mentionne est une
    // surface que personne ne pense à protéger.
    const reelles = (
      await interroger<{ tablename: string }>(
        bd,
        "select tablename from pg_tables where schemaname = 'public' order by 1",
      )
    ).map((l) => l.tablename);

    const decrites = new Set(tablesDuBrief());
    const muettes = reelles.filter((t) => !decrites.has(t));
    expect(
      muettes,
      `Tables présentes en base mais ABSENTES du brief : ${muettes.join(", ")}. ` +
        "Chaque table est une surface : celle qu'aucun document ne mentionne est " +
        "celle que personne ne pense à protéger.",
    ).toEqual([]);
  });
});

/**
 * ET LES COLONNES — DANS UN SEUL SENS, DÉLIBÉRÉMENT.
 *
 * ⚠️ LA DÉRIVE EST REVENUE, DANS LA COLONNE AU LIEU DE LA TABLE. Le brief
 * décrivait `parcel_checkpoints.raw` : mesuré le 02/09/2026 contre
 * `information_schema.columns`, cette colonne n'existe pas, et aucun fichier du
 * dépôt ne la mentionne. C'est exactement la récidive de `notifications_sent`,
 * un cran plus bas — et la sonde posée après cette dérive-là avait hérité du
 * champ de vision de la correction : elle regarde les TABLES, la dérive
 * suivante est arrivée dans les colonnes (L-025).
 *
 * L'EFFET N'EST PAS COSMÉTIQUE. La décision §3-5 — « purge des réponses brutes
 * 90 jours après le dernier mouvement » — se lisait, avec cette colonne, comme
 * si chaque point de passage portait sa réponse brute. Elle est en réalité dans
 * `tracking_snapshots.raw_payload`, PAR INTERROGATION. Un diagnostic écrit
 * contre `checkpoints.raw` échouerait à la compilation ; une décision produit
 * prise sur cette lecture (« on a le brut par point de passage, on peut
 * rejouer ») serait fausse sans jamais rien casser.
 *
 * ⚠️ UN SEUL SENS, ET C'EST UN CHOIX. Exiger que TOUTE colonne réelle soit
 * décrite ferait du brief une seconde source de vérité à tenir à jour —
 * exactement le défaut qu'il corrige, et il compte 149 colonnes. Le brief dit
 * lui-même que ses descriptions de colonnes sont indicatives et que les vraies
 * vivent dans `supabase/migrations/`. Ce qui est dangereux, c'est le sens
 * INVERSE : une colonne DÉCRITE et ABSENTE est une promesse sur laquelle
 * quelqu'un s'appuiera.
 */
describe("Les colonnes que le brief NOMME existent", () => {
  /** Les `table.colonne` cités dans le bloc « Les tables » du brief. */
  function colonnesDuBrief(): Array<{ table: string; colonne: string }> {
    const texte = readFileSync(BRIEF, "utf8");
    const debut = texte.indexOf("### Les tables — RLS activée sur TOUTES");
    const ouvre = texte.indexOf("```", debut);
    const ferme = texte.indexOf("```", ouvre + 3);
    const bloc = texte.slice(ouvre + 3, ferme);

    const paires: Array<{ table: string; colonne: string }> = [];
    let table: string | null = null;

    for (const ligne of bloc.split("\n")) {
      // `\s|$` ET NON `\s` SEUL — la même précaution que `tablesDuBrief`, et je
      // l'avais oubliée : un nom de table trop long pour tenir avec sa
      // description occupe sa ligne entière. Sans elle, `rate_limit` héritait
      // de la table suivante comme si c'était une de ses colonnes.
      const nom = /^([a-z_]+)(?:\s|$)/.exec(ligne);
      if (nom !== null) table = nom[1] as string;
      if (table === null) continue;

      /*
       * ⚠️ ON NE LIT QUE LES LIGNES QUI SONT PUREMENT DU SCHÉMA.
       *
       * Le bloc du brief mêle des listes de colonnes et de la PROSE — des
       * avertissements, des raisons, des renvois à d'autres tables. Une sonde
       * qui découpe tout sur les virgules fabrique des colonnes inexistantes
       * (« et », « la », « peut ») et accuse alors le brief de ce qu'elle a mal
       * lu. Une sonde qui se trompe rend un rapport exactement aussi crédible
       * qu'une vraie dérive : c'est le pire des deux mondes.
       *
       * Le critère est donc net : après retrait des annotations entre
       * parenthèses, la ligne doit être une liste d'identifiants et RIEN
       * d'autre. Tout le reste est de la prose, et la prose n'est pas jugée.
       */
      const sansAnnotation = (nom === null ? ligne : ligne.slice((nom[1] as string).length))
        .replace(/\([^)]*\)/g, "")
        // La virgule de continuation ET l'espace qu'elle laisse : retirer la
        // virgule sans re-couper les blancs faisait échouer le motif sur la
        // ligne la plus importante du bloc, celle qui porte `public_token`.
        .replace(/\s*,\s*$/, "")
        .trim();
      if (sansAnnotation === "") continue;
      if (!/^[a-z][a-z0-9_]*(\s*,\s*[a-z][a-z0-9_]*)*$/.test(sansAnnotation)) continue;

      for (const brut of sansAnnotation.split(",")) {
        const c = brut.trim();
        if (c.length > 1) paires.push({ table, colonne: c });
      }
    }
    return paires;
  }

  test("la sonde lit réellement des colonnes", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : un bloc renommé rendrait cette suite verte
    // et muette, ce qui est précisément le défaut qu'elle corrige.
    const lues = colonnesDuBrief();
    expect(lues.length, "aucune colonne lue dans le brief").toBeGreaterThan(60);
    expect(lues.some((c) => c.table === "orders" && c.colonne === "public_token")).toBe(true);
  });

  test("aucune colonne décrite au brief n'est absente de la base", async () => {
    const reelles = new Set(
      (
        await interroger<{ table_name: string; column_name: string }>(
          bd,
          `select table_name, column_name from information_schema.columns
            where table_schema = 'public'`,
        )
      ).map((l) => `${l.table_name}.${l.column_name}`),
    );

    const tables = new Set(
      (
        await interroger<{ tablename: string }>(
          bd,
          "select tablename from pg_tables where schemaname = 'public'",
        )
      ).map((l) => l.tablename),
    );

    const fantomes = colonnesDuBrief()
      // On ne juge que les colonnes des tables qui existent : une table absente
      // est déjà signalée par la suite au-dessus, et la signaler deux fois
      // brouillerait l'attribution.
      .filter((c) => tables.has(c.table))
      .filter((c) => !reelles.has(`${c.table}.${c.colonne}`))
      .map((c) => `${c.table}.${c.colonne}`);

    expect(
      [...new Set(fantomes)],
      "Colonnes décrites au brief mais ABSENTES de la base. Le brief est ce " +
        "qu'on relit avant d'écrire une migration : une colonne qui n'existe " +
        "que là est une promesse sur laquelle quelqu'un s'appuiera — c'est " +
        "ainsi que `parcel_checkpoints.raw` a survécu.",
    ).toEqual([]);
  });
});
