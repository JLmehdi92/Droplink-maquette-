import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LES CONSIGNES DE `CLAUDE.md` DÉSIGNENT-ELLES QUELQUE CHOSE QUI EXISTE ?
 *
 * C'est le motif le plus tenace de ce projet : UN DOCUMENT AFFIRME UN ÉTAT QUE
 * PERSONNE N'A EXÉCUTÉ (L-014). Il s'est déjà réalisé trois fois ici — une
 * commande citée qui n'existait pas, une garde présentée comme faisant autorité
 * et qui n'avait aucun site d'appel, une suite « jamais désactivable » décrite
 * avec le mauvais code de statut.
 *
 * Ce fichier est le document qu'on relit AVANT d'écrire quoi que ce soit. Une
 * consigne fausse ne se contente pas d'être inutile : ON LA SUIT. La garde
 * débranchée en est l'exemple coûteux — quelqu'un l'appliquant à la lettre sur
 * un nouvel écran aurait écrit une protection laissant passer un compte
 * suspendu, en croyant respecter la règle du projet.
 *
 * Le contrôle ne relit pas la prose : il extrait les affirmations VÉRIFIABLES —
 * les commandes citées — et les confronte à `package.json`.
 */

const RACINE = process.cwd();

function lire(nom: string): string {
  return readFileSync(join(RACINE, nom), "utf8");
}

function scriptsDeclares(): ReadonlySet<string> {
  const paquet = JSON.parse(lire("package.json")) as { scripts?: Record<string, string> };
  return new Set(Object.keys(paquet.scripts ?? {}));
}

/**
 * Les commandes citées, hors bordure de mot.
 *
 * Le motif s'arrête au caractère qui suit : sans cette précaution, « `pnpm
 * check:r2` exige les variables R2_* » se lirait `check:r` dans une extraction
 * naïve — et l'on chercherait un script absent tout en manquant le vrai.
 */
function commandesCitees(document: string): readonly string[] {
  const trouvees = new Set<string>();
  for (const t of document.matchAll(/\bpnpm\s+([a-z][a-z0-9]*(?::[a-z0-9]+)?)\b/g)) {
    trouvees.add(t[1] ?? "");
  }
  return [...trouvees].sort();
}

describe("Les consignes désignent des choses qui existent", () => {
  const documents = ["CLAUDE.md", "BRIEF-DROPLINK-COMPLET.md"] as const;

  test("la sonde extrait réellement des commandes", () => {
    // `CLAUDE.md` est le document opératoire : c'est lui qui doit en citer. Le
    // brief, lui, décrit le produit et peut n'en nommer aucune — il reste dans
    // l'inventaire pour le jour où il en nommera une, jamais comme preuve que
    // la sonde inspecte quelque chose.
    expect(
      commandesCitees(lire("CLAUDE.md")).length,
      "CLAUDE.md ne cite aucune commande pnpm : la sonde n'inspecte rien, et " +
        "un ensemble vide passe tout.",
    ).toBeGreaterThan(5);
  });

  test("toute commande `pnpm` citée existe dans package.json", () => {
    const scripts = scriptsDeclares();
    expect(scripts.size, "aucun script dans package.json").toBeGreaterThan(5);

    const inconnues: string[] = [];
    for (const nom of documents) {
      for (const commande of commandesCitees(lire(nom))) {
        // `pnpm install`, `pnpm audit` et consorts sont des commandes de pnpm
        // lui-même, pas des scripts du dépôt.
        if (["install", "add", "audit", "why", "dlx", "exec"].includes(commande)) continue;
        if (!scripts.has(commande)) inconnues.push(`${nom} cite \`pnpm ${commande}\``);
      }
    }

    expect(
      inconnues,
      `${inconnues.join(" | ")}. Une consigne qui désigne une commande absente ` +
        "n'est pas seulement inutile : on la suit, on constate un échec, et on " +
        "cherche la panne dans le produit.",
    ).toEqual([]);
  });

  test("SECOND SENS : les portes de qualité citées sont TOUTES celles que `gates` enchaîne", () => {
    /*
     * `CLAUDE.md` énumère les portes à passer avant chaque commit, et
     * `package.json` en définit l'enchaînement. Les deux peuvent diverger sans
     * qu'aucune ne soit fausse isolément — et la divergence se lit toujours du
     * côté rassurant : le document promet plus que le script n'exécute.
     */
    const paquet = JSON.parse(lire("package.json")) as { scripts?: Record<string, string> };
    const gates = paquet.scripts?.["gates"] ?? "";
    expect(gates.length, "le script `gates` a disparu").toBeGreaterThan(0);

    const enchainees = new Set(
      [...gates.matchAll(/pnpm\s+([a-z][a-z0-9]*(?::[a-z0-9]+)?)/g)].map((t) => t[1] ?? ""),
    );
    expect(enchainees.size, "`gates` n'enchaîne aucune porte").toBeGreaterThan(3);

    const bloc = lire("CLAUDE.md");
    const debut = bloc.indexOf("Portes de qualité avant chaque commit");
    expect(debut, "le bloc des portes a disparu de CLAUDE.md").toBeGreaterThan(-1);
    const citees = new Set(
      [...bloc.slice(debut, debut + 400).matchAll(/pnpm\s+([a-z][a-z0-9]*(?::[a-z0-9]+)?)/g)].map(
        (t) => t[1] ?? "",
      ),
    );

    const promisesNonTenues = [...citees].filter((p) => !enchainees.has(p));
    expect(
      promisesNonTenues,
      `Portes annoncées par CLAUDE.md que \`pnpm gates\` n'exécute pas : ` +
        `${promisesNonTenues.join(", ")}.`,
    ).toEqual([]);

    const tenuesNonPromises = [...enchainees].filter((p) => !citees.has(p));
    expect(
      tenuesNonPromises,
      `Portes exécutées par \`pnpm gates\` que CLAUDE.md n'annonce pas : ` +
        `${tenuesNonPromises.join(", ")}. Le second sens compte autant : une ` +
        "porte qu'on ne sait pas devoir passer est une porte qu'on découvre en " +
        "rouge, au moment de commiter.",
    ).toEqual([]);
  });
});
