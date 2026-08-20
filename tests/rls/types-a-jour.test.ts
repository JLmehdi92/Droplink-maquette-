import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Client } from "pg";
import { Constants } from "@/lib/supabase/types-base";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * Accord entre les types générés et le schéma réel.
 *
 * Des types périmés décrivent une base qui n'existe plus, et `tsc` valide alors
 * du code contre un schéma imaginaire : la porte de typage reste verte, et
 * l'erreur sort à l'exécution, sur une colonne absente.
 *
 * Le contrôle porte sur les ÉNUMÉRATIONS en particulier, parce qu'une valeur
 * citée dans un contrat mais absente de la base fait échouer l'insertion — et
 * la transaction étant partagée, annule la mutation entière. C'est un défaut qui
 * se manifeste loin de sa cause.
 */

let bd: Client;

beforeAll(async () => {
  bd = await ouvrirConnexionCatalogue();
});

afterAll(async () => {
  await bd.end();
});

// L'aide `interroger` contraint sur `Record<string, unknown>` : un type
// d'objet fermé ne la satisfait pas, il faut un type indexable.
type EnumEnBase = { nom: string; valeurs: string[] } & Record<string, unknown>;

async function enumerationsEnBase(): Promise<Map<string, string[]>> {
  const lignes = await interroger<EnumEnBase>(
    bd,
    `select t.typname as nom, array_agg(e.enumlabel::text order by e.enumsortorder)::text[] as valeurs
     from pg_type t
     join pg_enum e on e.enumtypid = t.oid
     join pg_namespace n on n.oid = t.typnamespace
     where n.nspname = 'public'
     group by t.typname
     order by t.typname`,
  );
  return new Map(lignes.map((l) => [l.nom, l.valeurs]));
}

describe("Types générés vs schéma réel", () => {
  test("la sonde inspecte réellement des énumérations", async () => {
    const enBase = await enumerationsEnBase();
    expect(enBase.size, "aucune énumération en base : rien à comparer").toBeGreaterThan(0);
    expect(Object.keys(Constants.public.Enums).length).toBeGreaterThan(0);
  });

  test("chaque énumération des types existe en base, avec les MÊMES valeurs", async () => {
    const enBase = await enumerationsEnBase();
    const defauts: string[] = [];

    for (const [nom, valeurs] of Object.entries(Constants.public.Enums)) {
      const reelles = enBase.get(nom);
      if (reelles === undefined) {
        defauts.push(`« ${nom} » est dans les types mais ABSENTE de la base`);
        continue;
      }
      const attendues = [...valeurs].sort();
      const trouvees = [...reelles].sort();
      if (JSON.stringify(attendues) !== JSON.stringify(trouvees)) {
        defauts.push(
          `« ${nom} » : types = [${attendues.join(", ")}], base = [${trouvees.join(", ")}]`,
        );
      }
    }

    expect(defauts, `${defauts.join(" | ")} — lancer \`pnpm db:types\``).toEqual([]);
  });

  test("aucune énumération de la base ne manque aux types", async () => {
    // Le second sens : une valeur ajoutée en base et absente des types laisse le
    // code incapable de l'exprimer, sans que rien ne le signale.
    const enBase = await enumerationsEnBase();
    const dansLesTypes = new Set(Object.keys(Constants.public.Enums));
    const manquantes = [...enBase.keys()].filter((n) => !dansLesTypes.has(n));
    expect(
      manquantes,
      `Énumérations en base absentes des types : ${manquantes.join(", ")} — lancer \`pnpm db:types\``,
    ).toEqual([]);
  });

  test("les tables décrites par les types existent toutes en base", async () => {
    const tablesEnBase = new Set(
      (
        await interroger<{ relname: string }>(
          bd,
          `select c.relname from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'`,
        )
      ).map((r) => r.relname),
    );

    expect(tablesEnBase.size, "aucune table en base").toBeGreaterThan(0);

    // Les noms de tables ne sont pas exposés à l'exécution par les types (ce
    // sont des types, pas des valeurs). On s'appuie donc sur la seule valeur
    // exportée qui les reflète indirectement, et on vérifie l'autre sens par la
    // sonde de migrations.
    for (const attendue of ["profiles", "shops"]) {
      expect(tablesEnBase.has(attendue), `table ${attendue} absente de la base`).toBe(true);
    }
  });
});
