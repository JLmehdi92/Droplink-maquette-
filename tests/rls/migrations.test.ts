import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * Accord entre le dépôt et la base, DANS LES DEUX SENS.
 *
 * Un seul sens ne suffit pas, et les deux défauts qu'il laisse passer sont
 * différents :
 *
 * - un FICHIER JAMAIS APPLIQUÉ : quelqu'un a écrit la migration, l'a commitée,
 *   et personne ne l'a passée sur cet environnement. Le code qui en dépend
 *   échouera ici et nulle part ailleurs ;
 * - une MIGRATION APPLIQUÉE SANS FICHIER : la base porte une modification que le
 *   dépôt ne décrit pas. Un environnement neuf ne la reproduira jamais, et le
 *   défaut n'apparaîtra qu'au prochain déploiement propre — c'est-à-dire au pire
 *   moment.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

function migrationsDuDepot(): string[] {
  return readdirSync(join(process.cwd(), "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

describe("Accord dépôt / base", () => {
  test("la sonde inspecte réellement des migrations", () => {
    // Deux ensembles vides s'accordent parfaitement.
    expect(migrationsDuDepot().length, "aucune migration dans le dépôt").toBeGreaterThan(0);
  });

  test("aucun fichier de migration n'est resté non appliqué", async () => {
    const enBase = new Set(
      (
        await interroger<{ name: string | null }>(
          bd,
          "select name from supabase_migrations.schema_migrations where name is not null",
        )
      ).map((r) => r.name as string),
    );

    const jamaisAppliquees = migrationsDuDepot().filter((m) => !enBase.has(m));
    expect(
      jamaisAppliquees,
      `Fichiers présents dans le dépôt mais absents de la base : ` +
        `${jamaisAppliquees.join(", ")}. Lancer \`pnpm db:migrate\`.`,
    ).toEqual([]);
  });

  test("aucune migration en base ne manque au dépôt", async () => {
    const enBase = (
      await interroger<{ name: string | null }>(
        bd,
        "select name from supabase_migrations.schema_migrations where name is not null",
      )
    ).map((r) => r.name as string);

    expect(enBase.length, "registre de migrations vide : rien à comparer").toBeGreaterThan(0);

    const duDepot = new Set(migrationsDuDepot());
    const orphelines = enBase.filter((m) => !duDepot.has(m));
    expect(
      orphelines,
      `Migrations appliquées en base sans fichier correspondant : ${orphelines.join(", ")}. ` +
        "Un environnement neuf ne les reproduira jamais.",
    ).toEqual([]);
  });

  test("l'ordre lexicographique des fichiers est un ordre total sans doublon de numéro", async () => {
    // L'ordre lexicographique EST l'ordre d'application. Deux fichiers portant
    // le même préfixe numérique rendraient cet ordre dépendant du reste du nom,
    // donc du hasard.
    const prefixes = migrationsDuDepot().map((m) => m.split("_")[0] ?? "");
    const doublons = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
    expect(doublons, `Préfixes de migration dupliqués : ${doublons.join(", ")}`).toEqual([]);

    const nonNumerotees = migrationsDuDepot().filter((m) => !/^\d{3}_/.test(m));
    expect(nonNumerotees, `Migrations sans numéro à trois chiffres : ${nonNumerotees.join(", ")}`).toEqual(
      [],
    );
  });
});
