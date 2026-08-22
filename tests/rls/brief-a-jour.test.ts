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
