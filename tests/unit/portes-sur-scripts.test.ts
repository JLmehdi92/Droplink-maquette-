import { describe, expect, test } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { ESLint } from "eslint";

/**
 * `scripts/` DOIT RESTER DANS LES PORTES.
 *
 * Ce dossier était hors de toutes : `eslint.config.mjs` l'ignorait nommément, et
 * `tsconfig.json` ne couvrait pas les `.mjs`. Trois mille lignes ni typées ni
 * lintées — et ce ne sont pas trois mille lignes quelconques : ce sont
 * `falsifier.mjs` et `fumee.mjs`, les deux outils qui certifient que le produit
 * répond et que ses gardes mordent.
 *
 * La conséquence n'est pas cosmétique. `no-floating-promises` ne s'y appliquait
 * pas ; or une promesse perdue dans le falsificateur laisse le produit CASSÉ EN
 * BASE pendant que le script annonce l'avoir réparé. C'est le seul défaut du
 * dépôt dont la conséquence est une base durablement fausse, et il se
 * présenterait comme un succès.
 *
 * ⚠️ CE CONTRÔLE N'INTERROGE PAS LE TEXTE DE LA CONFIGURATION. Constater qu'une
 * ligne existe ne prouve jamais que son absence bloque (L-018), et une
 * expression régulière prouve qu'un texte existe, jamais qu'une capacité est en
 * place (L-020). On demande donc à ESLint lui-même ce qu'il APPLIQUE à un
 * fichier réel de `scripts/`.
 */
describe("Les portes couvrent scripts/", () => {
  const RACINE = join(process.cwd(), "scripts");
  const SCRIPTS = readdirSync(RACINE)
    .filter((n) => n.endsWith(".mjs"))
    .map((n) => join(RACINE, n));

  test("le dossier contient bien les outils qu'on prétend couvrir", () => {
    expect(SCRIPTS.length, "aucun script trouvé : la sonde vise à côté").toBeGreaterThan(0);
    const noms = SCRIPTS.map((c) => c.slice(RACINE.length + 1));
    // Nommés, parce que ce sont EUX dont la couverture importe : les autres
    // scripts ne mentent pas sur l'état de la base quand ils échouent.
    expect(noms).toContain("falsifier.mjs");
    expect(noms).toContain("fumee.mjs");
  });

  test("ESLint n'ignore aucun script et y applique les règles de promesse", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });

    for (const chemin of SCRIPTS) {
      const ignore = await eslint.isPathIgnored(chemin);
      expect(ignore, `${chemin} est IGNORÉ par ESLint`).toBe(false);

      const config = (await eslint.calculateConfigForFile(chemin)) as {
        rules?: Record<string, unknown>;
      };
      const regles = config.rules ?? {};

      // Les quatre règles que le brief exige nommément. Une promesse non
      // attendue perd son événement en silence, et `foo()` ressemble trop à
      // `await foo()` pour qu'une relecture les distingue : c'est le TYPAGE qui
      // doit l'exiger.
      for (const regle of [
        "@typescript-eslint/no-floating-promises",
        "@typescript-eslint/no-misused-promises",
        "@typescript-eslint/await-thenable",
        "@typescript-eslint/no-explicit-any",
      ]) {
        expect(
          regles[regle],
          `${regle} ne s'applique pas à ${chemin.slice(process.cwd().length + 1)}`,
        ).toBeDefined();
      }
    }
    /*
     * ⚠️ DÉLAI EXPLICITE, ET NON UN RELANCEMENT JUSQU'AU VERT.
     *
     * Ce test a expiré au défaut de 5 s alors qu'ESLint mettait 6,1 s. Ce n'est
     * pas une intermittence à ignorer : `calculateConfigForFile` construit la
     * configuration complète du dépôt au premier appel, et ce coût croît avec
     * le nombre de blocs `files` — il vient d'augmenter en déclarant la cloison
     * de `lib/veille`. Le contrôle mesurait donc, sans le dire, la TAILLE de la
     * configuration autant que sa substance.
     *
     * « Un test qui échoue par intermittence doit être BORNÉ, pas relancé
     * jusqu'au vert. » Le voici borné : soixante secondes couvrent largement
     * une machine chargée, et un dépassement signalerait alors une vraie
     * dégradation plutôt qu'un aléa d'ordonnancement.
     */
  }, 60_000);
});
