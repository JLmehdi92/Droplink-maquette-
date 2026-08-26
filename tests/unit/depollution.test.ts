import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sansCommentaires } from "../aide/source";

/**
 * LA DÉPOLLUTION EST ELLE-MÊME UNE GARDE, ET PERSONNE NE LA GARDAIT.
 *
 * Toute sonde qui cherche un motif dans le code retire d'abord les commentaires
 * — sans quoi elle se satisfait du commentaire qui DÉCRIT la garde au lieu de la
 * garde (L-031). Mais l'opération inverse n'était surveillée par rien : une
 * dépollution qui efface trop rend un vert qu'aucune relecture ne distingue d'un
 * vert mérité, puisque le fichier, lui, est intact sur le disque.
 *
 * Ce fichier fixe la frontière avec des TÉMOINS DISCRIMINANTS : des chaînes que
 * l'ancien motif détruisait et que le nouveau conserve. Sans eux, remplacer
 * `sansCommentaires` par `() => ""` laisserait toutes les sondes de motif au
 * vert — le pire résultat possible, parce qu'il est silencieux.
 */
describe("Dépollution du code", () => {
  test("une URL en dur SURVIT à la dépollution", () => {
    // Le témoin exact du défaut : c'est cette ligne, dans l'adaptateur de suivi,
    // que l'ancien motif coupait à « https: ».
    const source = 'const BASE = "https://api.17track.net/track/v2.4";';
    expect(sansCommentaires(source)).toContain("api.17track.net");
  });

  test("un commentaire de ligne DISPARAÎT", () => {
    const source = ["const a = 1;", "// import { adaptateur } from 'ailleurs'", "const b = 2;"].join(
      "\n",
    );
    const propre = sansCommentaires(source);
    expect(propre).toContain("const a = 1;");
    expect(propre).toContain("const b = 2;");
    expect(propre).not.toContain("adaptateur");
  });

  test("un commentaire de bloc DISPARAÎT, y compris sur plusieurs lignes", () => {
    const source = ["/**", " * appelle exigerAdmin() ici", " */", "export function f() {}"].join(
      "\n",
    );
    const propre = sansCommentaires(source);
    expect(propre).not.toContain("exigerAdmin");
    expect(propre).toContain("export function f()");
  });

  test("un commentaire en FIN de ligne de code est conservé avec sa ligne", () => {
    /*
     * Choix assumé, et il faut dire lequel : on ne retire QUE les lignes
     * entièrement commentées. Un commentaire de fin de ligne survit donc, et
     * pourrait en théorie satisfaire une sonde de motif.
     *
     * L'alternative — couper à la première double barre — est précisément le
     * défaut qu'on répare : elle détruit toute URL. Entre une sonde qui accepte
     * un mot posé en fin de ligne de code et une sonde aveugle à toutes les
     * adresses du dépôt, le second risque est le seul qui se soit réalisé.
     */
    const source = 'const url = "https://exemple.test"; // garde: exigerAdmin';
    expect(sansCommentaires(source)).toContain("https://exemple.test");
  });
});

/**
 * SECOND SENS : plus aucune sonde ne doit employer le motif non ancré.
 *
 * Réparer les trois occurrences connues n'empêche pas la quatrième. Et comme le
 * défaut se manifeste par un VERT, rien ne le signalerait jamais.
 */
describe("Aucune sonde ne redépollue à sa façon", () => {
  const TESTS = join(process.cwd(), "tests");

  function fichiers(racine: string): readonly string[] {
    const trouves: string[] = [];
    const parcourir = (dossier: string): void => {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (chemin.endsWith(".ts")) trouves.push(chemin);
      }
    };
    parcourir(racine);
    return trouves;
  }

  test("le motif non ancré `//.*$` n'apparaît dans aucune suite", () => {
    const tous = fichiers(TESTS);
    expect(tous.length, "aucun fichier de test trouvé : la sonde vise à côté").toBeGreaterThan(10);

    // On cherche le motif TEL QU'IL S'ÉCRIT dans une expression régulière
    // JavaScript, sans l'ancre `^\s*` qui le rend correct.
    const coupable = /replace\(\s*\/\\\/\\\/\.\*\$\/gm/;
    const fautifs = tous
      .filter((chemin) => chemin !== join(TESTS, "unit", "depollution.test.ts"))
      .filter((chemin) => coupable.test(readFileSync(chemin, "utf8")))
      .map((chemin) => chemin.slice(process.cwd().length + 1));

    expect(
      fautifs,
      `Sondes qui dépolluent avec un motif non ancré : ${fautifs.join(", ")}. ` +
        "Elles détruisent toute URL du code inspecté, et leur vert ne prouve " +
        "rien. Employer `sansCommentaires` de `tests/aide/source.ts`.",
    ).toEqual([]);
  });
});
