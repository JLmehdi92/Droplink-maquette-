import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * AUCUNE CLASSE DE STYLE NE DOIT ÊTRE MORTE.
 *
 * Une classe Tailwind qui référence un token absent du thème ne produit AUCUNE
 * règle. Elle ne lève rien, ne casse aucun test, ne noircit aucun journal :
 * l'élément perd simplement son style, et personne ne s'en aperçoit avant de
 * regarder l'écran. C'est arrivé en portant les maquettes — le thème est passé
 * aux noms de tokens du design system, et soixante-huit classes aux anciens noms
 * sont devenues inertes d'un coup.
 *
 * LE CONTRÔLE PORTE SUR LE CSS RÉELLEMENT PRODUIT, pas sur une liste de noms
 * attendus. Tailwind ne génère que les classes qu'il a su résoudre : une classe
 * présente dans le balisage et ABSENTE de la feuille compilée est, par
 * définition, une classe qui n'a rien produit. On interroge donc l'effet, pas
 * l'orthographe (L-020).
 */

const RACINE = process.cwd();
const SORTIE_BUILD = join(RACINE, ".next");

function fichiers(dossier: string, garde: (chemin: string) => boolean): string[] {
  const trouves: string[] = [];
  const parcourir = (courant: string): void => {
    let entrees: string[];
    try {
      entrees = readdirSync(courant);
    } catch {
      return;
    }
    for (const entree of entrees) {
      const chemin = join(courant, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (garde(chemin)) trouves.push(chemin);
    }
  };
  parcourir(dossier);
  return trouves;
}

/** Feuilles de style compilées, backslashes d'échappement retirés. */
function cssCompile(): string {
  const feuilles = fichiers(join(SORTIE_BUILD, "static"), (c) => c.endsWith(".css"));
  expect(
    feuilles.length,
    "Aucune feuille de style compilée dans `.next`. Lancer `pnpm build` avant " +
      "cette suite : une sonde qui n'a rien à inspecter passe sur tout.",
  ).toBeGreaterThan(0);
  // Tailwind échappe les caractères spéciaux dans les sélecteurs :
  // `md:px-4` devient `.md\:px-4`. On retire les échappements pour comparer aux
  // classes telles qu'elles sont écrites dans le balisage.
  return feuilles.map((f) => readFileSync(f, "utf8")).join("\n").replaceAll("\\", "");
}

/**
 * Classes écrites en dur dans le code source.
 *
 * Les valeurs construites dynamiquement sont ignorées : Tailwind ne peut pas les
 * voir non plus, et c'est une règle connue de l'outil, pas un défaut à signaler
 * ici. Seules les chaînes littérales sont vérifiables.
 */
function classesEcrites(): Map<string, string[]> {
  const parClasse = new Map<string, string[]>();

  for (const chemin of fichiers(join(RACINE, "src"), (c) => c.endsWith(".tsx"))) {
    const source = readFileSync(chemin, "utf8");
    const court = chemin.replace(RACINE, "").replace(/\\/g, "/");

    for (const trouve of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const brut = trouve[1] ?? trouve[2] ?? "";
      // Une interpolation empêche de savoir ce qui sera réellement produit.
      if (brut.includes("${")) continue;
      for (const classe of brut.split(/\s+/)) {
        if (classe === "") continue;
        const liste = parClasse.get(classe) ?? [];
        if (!liste.includes(court)) liste.push(court);
        parClasse.set(classe, liste);
      }
    }
  }

  return parClasse;
}

describe("Classes de style", () => {
  test("la sonde inspecte réellement du balisage et du CSS", () => {
    // Un ensemble vide passe tout : sans classes trouvées, « aucune n'est
    // morte » serait vrai par vacuité.
    const classes = classesEcrites();
    expect(classes.size, "aucune classe trouvée dans le code source").toBeGreaterThan(100);
    expect(cssCompile().length, "feuille compilée vide").toBeGreaterThan(1000);
  });

  test("le build correspond au code source actuel", () => {
    // Interroger un artefact construit exige d'établir qu'il CORRESPOND au code
    // sous test : « il répond » est la propriété que tous les résidus possèdent
    // (L-032). Un `.next` antérieur aux sources décrirait un autre produit.
    const sources = fichiers(join(RACINE, "src"), (c) => /\.(tsx|ts|css)$/.test(c));
    const plusRecenteSource = Math.max(...sources.map((f) => statSync(f).mtimeMs));
    const feuilles = fichiers(join(SORTIE_BUILD, "static"), (c) => c.endsWith(".css"));
    const plusRecentBuild = Math.max(...feuilles.map((f) => statSync(f).mtimeMs));

    expect(
      plusRecentBuild,
      "Le build est ANTÉRIEUR à la source la plus récente : la suite " +
        "examinerait une feuille de style qui ne correspond pas au code.",
    ).toBeGreaterThanOrEqual(plusRecenteSource);
  });

  test("contre-test positif : la sonde SAIT repérer une classe absente", () => {
    // Sans lui, une recherche qui trouverait tout — par exemple sur une chaîne
    // vide — passerait le test principal sans rien prouver.
    const css = cssCompile();
    expect(css.includes("bg-surface-container-lowest")).toBe(true);
    expect(
      css.includes("text-encre-douce"),
      "un ancien token supprimé est encore compilé : le thème n'a pas été nettoyé",
    ).toBe(false);
  });

  test("aucune classe écrite ne reste sans effet", () => {
    const css = cssCompile();

    /**
     * Classes qui n'auraient légitimement aucune règle.
     *
     * VIDE, et vérifié comme tel. Trois entrées y avaient été posées par
     * précaution — `glass-card`, `champ`, `material-symbols-outlined` — et le
     * second sens du test les a immédiatement signalées comme inutiles : les
     * deux premières sont écrites à la main dans `globals.css`, donc bel et bien
     * compilées ; la troisième n'est plus employée nulle part depuis que les
     * icônes sont rendues en SVG.
     *
     * Une exception posée « au cas où » n'est pas neutre : elle couvre le jour
     * où le défaut revient. Toute entrée ici doit porter sa raison et être
     * signalée dès qu'elle cesse d'avoir lieu d'être.
     */
    const SANS_REGLE_ADMISES = new Map<string, string>([]);

    const mortes: string[] = [];
    for (const [classe, fichiersConcernes] of classesEcrites()) {
      if (SANS_REGLE_ADMISES.has(classe)) continue;
      // On cherche la classe débarrassée de ses variantes : Tailwind produit
      // `.md\:px-4`, dont le texte contient `px-4` une fois les échappements
      // retirés.
      if (css.includes(classe)) continue;
      mortes.push(`${classe} (${fichiersConcernes.join(", ")})`);
    }

    expect(
      mortes,
      `Classes qui ne produisent AUCUNE règle : ${mortes.join(" | ")}. ` +
        "Elles ne lèvent rien et ne cassent aucun test — l'élément perd " +
        "simplement son style, et cela ne se voit qu'à l'écran.",
    ).toEqual([]);

    // Second sens : une exception n'a plus lieu d'être dès que la classe
    // produit une règle, ou qu'elle a cessé d'être écrite quelque part.
    const ecrites = classesEcrites();
    const exceptionsPerimees = [...SANS_REGLE_ADMISES.keys()].filter(
      (nom) => css.includes(nom) || !ecrites.has(nom),
    );
    expect(
      exceptionsPerimees,
      `Exceptions devenues inutiles : ${exceptionsPerimees.join(", ")}.`,
    ).toEqual([]);
  });
});
