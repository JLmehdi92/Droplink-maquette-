import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { interroger, ouvrirConnexionCatalogue } from "../aide/base";

/**
 * CHAQUE FONCTION APPELÉE PAR LE BANC DE MESURE EXISTE ENCORE, AVEC SON ARITÉ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE SONDE EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La migration 113 a ajouté le filtre par type sur `lister_boutiques_admin`.
 * Elle a fait exactement ce qu'il fallait : `drop` explicite de l'ancienne
 * signature à cinq arguments, puis création de la nouvelle à six — précisément
 * pour éviter la surcharge fantôme que `create or replace` aurait produite.
 *
 * Et `tests/perf/boutiques.test.ts` a continué d'appeler la fonction à CINQ
 * arguments. L'appel ne résolvait plus rien. La mesure était ROUGE.
 *
 * ⚠️ ELLE L'EST RESTÉE SANS QUE PERSONNE LE VOIE, et la raison est structurelle :
 * `pnpm test:perf` ne fait pas partie des six portes de commit. Il prend une
 * dizaine de minutes ; le mettre dans la boucle de commit reviendrait à ne plus
 * jamais commiter. Il tourne donc « avant chaque clôture de phase » — c'est-à-
 * dire rarement, et toujours trop tard pour dire QUELLE modification l'a cassé.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle ne mesure rien : elle établit seulement que **l'artefact mesuré
 * correspond au code sous test**. C'est la moitié bon marché de la leçon L-032,
 * celle qui tient en quelques millisecondes et peut donc vivre dans une porte
 * de commit. L'autre moitié — les temps, les plans, les lignes lues — reste
 * dans `test:perf`.
 *
 * Elle INVENTORIE : elle lit TOUS les appels `public.<fonction>(…)` écrits dans
 * `tests/perf/`, sans liste blanche. Une mesure ajoutée demain est couverte
 * sans que personne y pense.
 *
 * ⚠️ ELLE PROUVE D'ABORD QU'ELLE INSPECTE QUELQUE CHOSE. Un ensemble vide passe
 * tout : si l'extraction cessait de trouver des appels — un renommage de
 * dossier, une syntaxe d'appel différente —, la sonde deviendrait verte à vide,
 * ce qui est exactement l'état qu'elle existe pour empêcher.
 */

const DOSSIER_PERF = join(process.cwd(), "tests", "perf");

/** Un appel écrit dans le banc de mesure : le nom, l'arité, et où il vit. */
interface Appel {
  readonly nom: string;
  readonly arite: number;
  readonly fichier: string;
}

/**
 * Compte les arguments de premier niveau d'une liste d'appel.
 *
 * Les appels du banc portent des littéraux SQL (`''`), des interpolations
 * (`${SEUIL}`) et des paramètres (`$1`) — jamais d'appel imbriqué à ce jour,
 * mais on compte quand même les virgules de PREMIER NIVEAU pour qu'un
 * `coalesce(a, b)` en argument ne fasse pas croire à un argument de plus.
 */
function compterArguments(liste: string): number {
  const nu = liste.trim();
  if (nu === "") return 0;

  let profondeur = 0;
  let dansSimple = false;
  let n = 1;
  for (let i = 0; i < nu.length; i++) {
    const c = nu[i];
    if (c === "'") dansSimple = !dansSimple;
    else if (!dansSimple && (c === "(" || c === "{")) profondeur++;
    else if (!dansSimple && (c === ")" || c === "}")) profondeur--;
    else if (!dansSimple && c === "," && profondeur === 0) n++;
  }
  return n;
}

function lireAppels(): Appel[] {
  const appels: Appel[] = [];
  const vus = new Set<string>();

  for (const fichier of readdirSync(DOSSIER_PERF).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(DOSSIER_PERF, fichier), "utf8");
    // On travaille sur le CODE, commentaires retirés : un motif qui se satisfait
    // du commentaire décrivant un appel ne prouve rien de l'appel lui-même.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

    for (const m of code.matchAll(/public\.([a-z_][a-z0-9_]*)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      const nom = m[1];
      const liste = m[2];
      if (nom === undefined || liste === undefined) continue;
      const arite = compterArguments(liste);
      const clef = `${nom}/${arite}`;
      if (vus.has(clef)) continue;
      vus.add(clef);
      appels.push({ nom, arite, fichier });
    }
  }
  return appels;
}

let catalogue: Client;
let appels: Appel[] = [];
let nombreDeFonctions = 0;

beforeAll(async () => {
  catalogue = await ouvrirConnexionCatalogue();
  appels = lireAppels();

  const total = await interroger<{ n: number }>(
    catalogue,
    `select count(*)::int as n
       from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'`,
  );
  nombreDeFonctions = total[0]?.n ?? 0;
});

afterAll(async () => {
  await catalogue?.end();
});

describe("Le banc de mesure appelle des fonctions qui existent", () => {
  test("CONTRE-TEST : la sonde voit des appels ET un catalogue peuplé", () => {
    expect(
      appels.length,
      "aucun appel `public.…()` trouvé dans tests/perf : la sonde serait verte à vide",
    ).toBeGreaterThan(0);

    expect(
      nombreDeFonctions,
      "le catalogue paraît vide : la comparaison ne prouverait rien",
    ).toBeGreaterThan(20);
  });

  test("chaque appel résout une fonction du catalogue, nom ET arité", async () => {
    const introuvables: string[] = [];

    for (const appel of appels) {
      const trouvees = await interroger<{ nargs: number }>(
        catalogue,
        `select p.pronargs::int as nargs
           from pg_proc p
           join pg_namespace ns on ns.oid = p.pronamespace
          where ns.nspname = 'public' and p.proname = $1`,
        [appel.nom],
      );

      if (trouvees.length === 0) {
        introuvables.push(
          `${appel.fichier} appelle public.${appel.nom}(), qui n'existe pas dans le catalogue`,
        );
        continue;
      }

      // L'ARITÉ COMPTE AUTANT QUE LE NOM. C'est elle qui a changé en 113, et
      // c'est elle qu'un `drop` explicite fait diverger : la fonction existe
      // toujours, sous son nom, et l'appel ne la résout plus.
      const arites = trouvees.map((t) => t.nargs);
      if (!arites.includes(appel.arite)) {
        introuvables.push(
          `${appel.fichier} appelle public.${appel.nom}() avec ${appel.arite} argument(s) ; ` +
            `le catalogue n'en connaît que ${arites.join(" ou ")}`,
        );
      }
    }

    expect(
      introuvables,
      "une mesure appelle une signature qui n'existe plus : elle est rouge, " +
        "et `test:perf` ne tournant pas à chaque commit, personne ne le verra avant longtemps.\n" +
        introuvables.join("\n"),
    ).toEqual([]);
  });
});
