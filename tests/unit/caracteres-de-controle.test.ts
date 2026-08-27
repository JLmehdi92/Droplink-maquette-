import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * AUCUN CARACTÈRE DE CONTRÔLE INVISIBLE DANS LES SOURCES.
 *
 * ⚠️ CE TEST NAÎT D'UN DÉFAUT TROUVÉ LE 27/08/2026, ET IL ÉTAIT LÀ DEPUIS
 * LONGTEMPS. Quatre contrôles de `pnpm fumee` — « aucune mention de SSO »,
 * « aucune certification SOC2 », « aucun vocabulaire d'entreprise », « aucun
 * Corporate Email » — étaient ÉCRITS AVEC UN OCTET BACKSPACE là où leur auteur
 * croyait avoir écrit une frontière de mot. Ils cherchaient « SSO » entouré de
 * caractères de contrôle, donc ne matchaient jamais, donc passaient au vert
 * sans rien vérifier. Ils gardaient une exigence du brief — le positionnement
 * neutre — et ne la gardaient pas.
 *
 * LE DÉFAUT EST INVISIBLE PAR CONSTRUCTION. Un backspace efface le caractère
 * précédent à l'affichage : `grep`, `sed` et la relecture montrent une regex
 * parfaitement normale. Seul un décodage octet par octet le révèle. C'est la
 * pire forme de L-020 — « un contrôle qui cherche un mot ne prouve rien » —
 * parce qu'ici le contrôle ne cherche même pas le mot qu'il affiche.
 *
 * D'OÙ IL VIENT : un `\b` écrit dans une chaîne au lieu d'une regex littérale.
 * En JavaScript, `"\b"` et `` `\b` `` valent le caractère backspace ; seul
 * `/\b/` ou `String.raw` donnent une frontière de mot. Tout outil qui réécrit
 * du code — script de patch, éditeur, copier-coller — peut le produire.
 */

const RACINES = ["src", "tests", "scripts", "supabase"];

/** Tout sauf la tabulation, le saut de ligne et le retour chariot. */
const estDeControle = (n: number): boolean =>
  (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127;

/**
 * Les caractères de contrôle VOULUS, avec leur raison. Ils sont déclarés ici
 * plutôt qu'ignorés en masse : une exception qu'on ne voit pas est une porte.
 */
const EXCEPTIONS: ReadonlyArray<readonly [string, string]> = [
  [
    "tests/unit/cles-canoniques.test.ts",
    "un octet nul DÉLIBÉRÉ : le test vérifie qu'une clé d'objet piégée est refusée",
  ],
];
const exceptes = new Map(EXCEPTIONS);

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return sources(chemin);
    return /\.(ts|tsx|mjs|js|css|json|sql)$/.test(e.name) ? [chemin] : [];
  });
}

const inspectes: string[] = [];
const fautifs: string[] = [];

for (const racine of RACINES) {
  for (const fichier of sources(join(process.cwd(), racine))) {
    const relatif = relative(process.cwd(), fichier).split(sep).join("/");
    inspectes.push(relatif);
    const contenu = readFileSync(fichier, "utf8");
    const codes = new Set<number>();
    for (const c of contenu) {
      const n = c.codePointAt(0);
      if (n !== undefined && estDeControle(n)) codes.add(n);
    }
    if (codes.size > 0 && !exceptes.has(relatif)) {
      fautifs.push(`${relatif} : ${[...codes].map((n) => `U+${n.toString(16).padStart(4, "0")}`).join(", ")}`);
    }
  }
}

describe("Les caractères de contrôle", () => {
  /** Un ensemble vide passe tout. */
  test("la sonde inspecte réellement les sources", () => {
    expect(inspectes.length).toBeGreaterThanOrEqual(150);
  });

  test("aucune source n'en contient", () => {
    expect(fautifs).toEqual([]);
  });

  /**
   * L'AUTRE SENS. Une exception qui ne correspond plus à rien laisse passer le
   * jour où le fichier reprend un caractère de contrôle involontaire.
   */
  test("chaque exception déclarée en contient encore un", () => {
    const mortes = EXCEPTIONS.filter(([chemin]) => {
      const contenu = readFileSync(join(process.cwd(), chemin), "utf8");
      return ![...contenu].some((c) => {
        const n = c.codePointAt(0);
        return n !== undefined && estDeControle(n);
      });
    }).map(([chemin, raison]) => `${chemin} — ${raison}`);
    expect(mortes).toEqual([]);
  });

  /**
   * LE CONTRE-TEST LE PLUS IMPORTANT : la sonde saurait-elle en voir un ? Sans
   * lui, « aucune source n'en contient » resterait vrai si `estDeControle`
   * devenait faux partout, et la suite entière deviendrait décorative.
   */
  test("elle en reconnaît un quand il y en a un", () => {
    expect(estDeControle(8)).toBe(true); // backspace — le cas rencontré
    expect(estDeControle(0)).toBe(true); // octet nul
    expect(estDeControle(27)).toBe(true); // échappement
    expect(estDeControle(9)).toBe(false); // tabulation : légitime
    expect(estDeControle(10)).toBe(false); // saut de ligne : légitime
    expect(estDeControle(65)).toBe(false); // « A »
  });
});
