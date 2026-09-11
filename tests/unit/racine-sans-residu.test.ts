import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  [
    ".env.example",
    "L'INVENTAIRE DES VARIABLES, et le seul endroit où la RAISON de chacune est " +
      "écrite : pourquoi `CRON_SECRET` refuse plutôt que de s'ouvrir, pourquoi " +
      "aucune variable R2 ne porte `NEXT_PUBLIC`, ce que décide " +
      "`BORD_DE_CONFIANCE`. Il vit à la racine parce que c'est là qu'on le " +
      "cherche, à côté du `.env.local` qu'il décrit. Il a été versionné le " +
      "06/09/2026 : le motif `.env*` du .gitignore par défaut de Next " +
      "l'attrapait, donc ce document n'existait que sur une seule machine, et " +
      "un redéploiement depuis un clone frais n'avait aucun moyen de savoir " +
      "quoi poser. Vérifié ligne à ligne avant : il ne porte AUCUNE valeur " +
      "sensible, seulement deux mots-clés publics.",
  ],
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
  [
    "CLAUDE.md",
    "Les instructions de projet. ⚠️ EN MAJUSCULES, et ce n'est pas cosmétique : " +
      "trois suites le lisent sous ce nom, et c'est aussi celui que Claude Code " +
      "cherche. Il a été suivi en minuscules jusqu'au 11/09/2026 — invisible " +
      "sous Windows, ENOENT sur tout clone Linux.",
  ],
  ["eslint.config.mjs", "Configuration d'ESLint, lue par `pnpm lint`."],
  ["next.config.ts", "Configuration de Next, lue au build."],
  ["package.json", "Les scripts et les dépendances."],
  [
    "railway.json",
    "La cible de deploiement, lue par Railway au build. Elle vit a la racine " +
      "parce que Railway ne la cherche que la. Elle ne decrit QUE le service " +
      "web : les deux services planifies ont leurs propres fichiers dans " +
      "`deploiement/`, et c'est deliberе — le veilleur doit vivre hors du " +
      "planificateur qu'il veille.",
  ],
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

/**
 * Le CODE, commentaires retirés — L-031.
 *
 * Ici l'inversion ne pourrait produire qu'un faux ROUGE, jamais un faux vert :
 * la sonde cherche un ÉCART, et une prose ne peut qu'en ajouter un. On retire
 * quand même les commentaires, parce qu'un paragraphe qui cite un ancien nom
 * de fichier raconte l'histoire du dépôt, il ne le lit pas.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((ligne) => !/^\s*(\/\/|\*)/.test(ligne))
    .join("\n");
}

/** Tout nom de fichier cité entre guillemets par le code, avec sa source. */
function citationsDeNomsDeFichiers(): readonly { source: string; nom: string }[] {
  const sources = execFileSync("git", ["ls-files", "--full-name", "tests", "scripts", "src"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\.(ts|tsx|mts|mjs|js)$/.test(l));

  const citations: { source: string; nom: string }[] = [];
  for (const source of sources) {
    const code = sansCommentaires(readFileSync(join(process.cwd(), source), "utf8"));
    for (const trouvee of code.matchAll(/["'`]([A-Za-z0-9_.-]+\.[A-Za-z0-9]+)["'`]/g)) {
      const nom = trouvee[1];
      if (nom !== undefined) citations.push({ source, nom });
    }
  }
  return citations;
}

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

  /**
   * ⚠️ DÉFAUT RÉEL, TROUVÉ LE 11/09/2026. Git suivait le fichier d'instructions
   * sous le nom `claude.md`, EN MINUSCULES, pendant que TROIS suites le lisaient
   * en majuscules — `readFileSync(join(process.cwd(), "CLAUDE.md"))` dans
   * `consignes-executables`, `controles-de-production` et `exports-vivants`.
   *
   * SOUS WINDOWS TOUT RÉSOLVAIT, parce que son système de fichiers ignore la
   * casse : les trois suites étaient vertes, et aucune des six portes ne pouvait
   * devenir rouge pour cela. Sur un clone Linux — une CI, un conteneur — les
   * trois lèvent `ENOENT` AVANT leur première assertion. Une machine ne peut pas
   * trouver ce défaut ; il faut un oracle qui, lui, soit sensible à la casse.
   *
   * `git ls-files` EST CET ORACLE. Il rend le nom tel que l'index le porte,
   * casse comprise, quel que soit le système de fichiers en dessous. Comparer le
   * littéral à un `readdir`, ou se contenter de vérifier que le fichier
   * s'ouvre, n'aurait rien vu ici — c'est précisément ce que faisaient les trois
   * suites.
   *
   * La sonde échoue dans les deux sens : un littéral dont la casse dérive de
   * l'index, et un fichier renommé dans l'index sans que le code suive.
   */
  test("un nom de fichier racine cité par le code a la casse que git suit", () => {
    const parMinuscule = new Map(presents.map((f) => [f.toLowerCase(), f]));
    const citations = citationsDeNomsDeFichiers().filter((c) =>
      parMinuscule.has(c.nom.toLowerCase()),
    );

    expect(
      new Set(citations.map((c) => c.nom)).size,
      "aucun fichier de la racine n'est cité par le code : la sonde n'inspecte " +
        "rien, et un ensemble vide passe tout.",
    ).toBeGreaterThan(3);

    const ecarts = citations
      .filter((c) => parMinuscule.get(c.nom.toLowerCase()) !== c.nom)
      .map(
        (c) =>
          `${c.source} lit « ${c.nom} », git suit « ${parMinuscule.get(c.nom.toLowerCase())} »`,
      );

    expect(
      [...new Set(ecarts)].sort(),
      "Casse divergente entre ce que le code LIT et ce que git SUIT. Windows " +
        "l'ignore ; un clone Linux lève ENOENT avant la première assertion.",
    ).toEqual([]);
  });
});
