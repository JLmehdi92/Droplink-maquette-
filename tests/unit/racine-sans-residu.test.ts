import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

/**
 * LA RACINE DU DÉPÔT NE PORTE QUE DES FICHIERS DÉCLARÉS.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ LE 29/08/2026 À LA VÉRIFICATION D'ÉTAT. `scratch-plan.mjs`
 * — un script de mesure jetable, écrit pour lire un plan d'exécution — a été
 * commité par erreur le 20/08 avec la mesure du tableau de bord, et y est resté
 * NEUF JOURS. Rien ne l'appelait, rien ne le nommait, aucune porte ne le voyait.
 *
 * CE QU'IL COÛTAIT, ET POURQUOI CE N'EST PAS QU'UNE QUESTION DE PROPRETÉ : il
 * ouvrait une connexion directe à la base, prenait le rôle `authenticated`, et
 * composait `request.jwt.claims` par INTERPOLATION DE CHAÎNE — un motif que ce
 * projet interdit partout ailleurs. Il n'était pas exploitable, l'identifiant
 * venant de la base ; mais c'est un mauvais exemple laissé à la racine d'un dépôt
 * dont on ne sait toujours pas s'il est public, et le premier fichier que
 * quelqu'un ouvre en arrivant.
 *
 * L'INVENTAIRE EST CLOS, ET LA SONDE ÉCHOUE DANS LES DEUX SENS : un fichier
 * apparu à la racine sans être déclaré ici, ET une déclaration qui ne correspond
 * plus à aucun fichier. Le second sens compte autant : une liste qui garde des
 * noms morts finit par tout autoriser, parce que plus personne ne la relit.
 *
 * ELLE INTERROGE GIT, PAS LE DISQUE. Le disque porte `.next`, `node_modules` et
 * tout ce que `.gitignore` couvre ; ce qu'on veut borner, c'est ce que le dépôt
 * EMPORTE. Un résidu ignoré par git ne part avec personne.
 */

/** Ce que la racine a le droit de porter, et rien d'autre. */
const ADMIS: ReadonlyMap<string, string> = new Map([
  [".gitattributes", "Normalisation des fins de ligne — le dépôt vit sous Windows."],
  [".gitignore", "Ce que le dépôt n'emporte pas."],
  [
    ".nvmrc",
    "La version de Node, lue par la CI (`actions/setup-node`). Sans elle, le " +
      "workflow échouerait à sa troisième étape — et une CI née rouge n'est pas " +
      "une CI. La valeur est celle réellement employée ici, relevée et non devinée.",
  ],
  [
    "AUDIT-COMPLET.md",
    "Le rapport de l'audit du 31/08/2026, demandé explicitement. Il vit à la " +
      "racine parce qu'il porte la matrice de couverture et la liste de ce qui " +
      "N'A PAS pu être vérifié : un rapport rangé dans un sous-dossier est un " +
      "rapport que personne ne relit avant la reprise suivante.",
  ],
  ["BRIEF-DROPLINK-COMPLET.md", "Le contexte produit complet, cité par CLAUDE.md."],
  ["claude.md", "Les instructions de projet."],
  ["eslint.config.mjs", "Configuration d'ESLint, lue par `pnpm lint`."],
  ["next.config.ts", "Configuration de Next, lue au build."],
  ["package.json", "Les scripts et les dépendances."],
  ["postcss.config.mjs", "Configuration de PostCSS — Tailwind v4 passe par lui."],
  [
    "stackhawk.yml",
    "La cible de l'analyse dynamique (HawkScan), lue par `hawk scan`. Elle vit " +
      "à la racine parce que l'outil ne la cherche QUE là : les commandes de " +
      "validation et de scan prennent un nom de fichier nu, jamais un chemin. " +
      "Aucun secret dedans — le cookie de session passe par `DROPLINK_COOKIE_*`, " +
      "le dépôt étant public.",
  ],
  ["pnpm-lock.yaml", "Le verrou de dépendances — commité, pour que le build soit reproductible."],
  ["tsconfig.json", "Configuration de TypeScript, lue par `pnpm typecheck`."],
  ["vitest.config.mts", "Les deux projets de test, `unit` et `rls`."],
]);

/** Les fichiers que GIT porte à la racine — jamais ceux du disque. */
function racineSuivie(): string[] {
  const sortie = execFileSync("git", ["ls-files", "--full-name"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return sortie
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.includes("/"))
    .sort();
}

describe("La racine du dépôt ne porte aucun résidu", () => {
  const presents = racineSuivie();

  test("la sonde interroge réellement quelque chose", () => {
    // Un ensemble vide passe tout. Si `git ls-files` échouait en silence ou
    // changeait de format, la suite deviendrait verte et muette.
    expect(presents.length, "aucun fichier suivi à la racine : la sonde vise à côté").toBeGreaterThan(
      5,
    );
    expect(presents, "package.json introuvable : la sonde ne lit pas la racine").toContain(
      "package.json",
    );
  });

  test("aucun fichier non déclaré", () => {
    const intrus = presents.filter((f) => !ADMIS.has(f));
    expect(
      intrus,
      "Fichiers à la racine que l'inventaire ne connaît pas. Un script jetable y a " +
        "vécu neuf jours sans que rien ne le voie. Le déplacer dans `scripts/` s'il " +
        "sert, le supprimer sinon — et ne l'ajouter ici que s'il doit vraiment y être.",
    ).toEqual([]);
  });

  test("aucune déclaration périmée", () => {
    const fantomes = [...ADMIS.keys()].filter((f) => !presents.includes(f));
    expect(
      fantomes,
      "Fichiers déclarés ici mais absents du dépôt. Une liste qui garde des noms " +
        "morts finit par tout autoriser, parce que plus personne ne la relit.",
    ).toEqual([]);
  });
});
