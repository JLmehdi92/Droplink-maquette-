import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LE THÈME PORTE EXACTEMENT LES TOKENS DU DESIGN SYSTEM, ET RIEN D'AUTRE.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE À CÔTÉ DE `palette-canevas`. Celle-là lit le
 * PREMIER bloc `@theme` — `CSS.indexOf("@theme {")`. Le design system vit dans un
 * SECOND bloc, posé le 11/09/2026 : elle en est donc aveugle, et cent quinze
 * tokens seraient entrés sans qu'aucun contrôle ne les voie. Une garde qui
 * regarde la moitié d'un fichier ne dit rien sur l'autre moitié.
 *
 * ⚠️ L'INVENTAIRE EST FIGÉ, ET C'EST DÉLIBÉRÉ. Le design system est IGNORÉ PAR
 * GIT (`.claude/skills/droplink-design/`) : un test qui le lirait serait rouge
 * chez quiconque ne l'a pas, donc inutilisable comme porte. Les valeurs
 * ci-dessous sont PRODUITES par `scripts/generer-tokens-design-system.mjs --inventaire`, qui
 * les lit dans `tokens/*.css` et résout les `var()` — jamais recopiées à la
 * main. Quatre-vingts transcriptions, c'est quatre-vingts occasions de se
 * tromper d'un caractère, et deux violets voisins ne se distinguent pas à l'œil.
 *
 * ELLE ÉCHOUE DANS LES DEUX SENS : un token du design system absent du thème,
 * et un token `ds` du thème que le design system ne porte pas.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/**
 * Les commentaires sont retirés AVANT toute lecture — L-031. Le bloc est précédé
 * d'un commentaire qui CITE des noms de tokens (`--radius-md`, `--text-body`)
 * pour expliquer les collisions : sans ce retrait, la garde se satisferait de
 * l'explication au lieu de lire la déclaration.
 */
const sansCommentaires = (css: string) =>
  css
    .split("/*")
    .map((p, i) => (i === 0 ? p : p.slice(p.indexOf("*/") + 2)))
    .join("");

/** Le SECOND bloc `@theme`, celui du design system. */
function blocDuDesignSystem(): string {
  const nu = sansCommentaires(CSS);
  const premier = nu.indexOf("@theme {");
  const second = nu.indexOf("@theme {", premier + 1);
  if (second === -1) return "";
  return nu.slice(second, nu.indexOf("\n}", second));
}

const TOKENS_DU_DESIGN_SYSTEM: ReadonlyArray<readonly [string, string]> = [
  ["--color-ds-violet-50", "#F4F3FE"],
  ["--color-ds-violet-100", "#EDEBFE"],
  ["--color-ds-violet-200", "#DCD8FD"],
  ["--color-ds-violet-300", "#C0B8FB"],
  ["--color-ds-violet-400", "#8C7EF9"],
  ["--color-ds-violet-500", "#5B4BF5"],
  ["--color-ds-violet-600", "#4B3AE0"],
  ["--color-ds-violet-700", "#3D2FBB"],
  ["--color-ds-magenta-400", "#C05AC8"],
  ["--color-ds-magenta-500", "#A855E0"],
  ["--color-ds-pink-500", "#E75A8B"],
  ["--color-ds-coral-300", "#FDA3A5"],
  ["--color-ds-coral-400", "#FB7C7F"],
  ["--color-ds-coral-500", "#F2555A"],
  ["--color-ds-ink-900", "#0B0B18"],
  ["--color-ds-ink-800", "#14162A"],
  ["--color-ds-ink-700", "#2A2D45"],
  ["--color-ds-ink-600", "#4A4E68"],
  ["--color-ds-ink-500", "#6B6F8C"],
  ["--color-ds-ink-400", "#8B90A8"],
  ["--color-ds-ink-300", "#A9AEC4"],
  ["--color-ds-ink-200", "#DEDEEA"],
  ["--color-ds-ink-100", "#ECECF5"],
  ["--color-ds-ink-50", "#F6F6FA"],
  ["--color-ds-white", "#FFFFFF"],
  ["--color-ds-lavender-page", "#FBFBFE"],
  ["--color-ds-lavender-100", "#F1F0FE"],
  ["--color-ds-lavender-200", "#EEEDFD"],
  ["--color-ds-lavender-300", "#E4E1FC"],
  ["--color-ds-green-500", "#12A87A"],
  ["--color-ds-green-100", "#E6F7F0"],
  ["--color-ds-red-500", "#EF4B57"],
  ["--color-ds-red-100", "#FDECEC"],
  ["--color-ds-blue-500", "#4F46E5"],
  ["--color-ds-blue-100", "#ECEBFE"],
  ["--color-ds-amber-500", "#E08A18"],
  ["--color-ds-amber-100", "#FCF3E3"],
  ["--color-ds-accent", "#5B4BF5"],
  ["--color-ds-accent-survol", "#4B3AE0"],
  ["--color-ds-accent-doux", "#EDEBFE"],
  ["--color-ds-accent-encre", "#4B3AE0"],
  ["--color-ds-surface-page", "#FBFBFE"],
  ["--color-ds-surface-carte", "#FFFFFF"],
  ["--color-ds-surface-teinte", "#F1F0FE"],
  ["--color-ds-surface-creux", "#F6F6FA"],
  ["--color-ds-surface-inverse", "#0B0B18"],
  ["--color-ds-surface-lavande", "#EEEDFD"],
  ["--color-ds-filet", "#ECECF5"],
  ["--color-ds-filet-appuye", "#DEDEEA"],
  ["--color-ds-filet-marque", "#C0B8FB"],
  ["--color-ds-filet-focus", "#5B4BF5"],
  ["--color-ds-texte-fort", "#0B0B18"],
  ["--color-ds-texte-titre", "#0B0B18"],
  ["--color-ds-texte-corps", "#6B6F8C"],
  ["--color-ds-texte-sourdine", "#8B90A8"],
  ["--color-ds-texte-tenu", "#A9AEC4"],
  ["--color-ds-texte-sur-marque", "#FFFFFF"],
  ["--color-ds-texte-lien", "#5B4BF5"],
  ["--color-ds-texte-lien-survol", "#4B3AE0"],
  ["--color-ds-succes", "#12A87A"],
  ["--color-ds-succes-fond", "#E6F7F0"],
  ["--color-ds-erreur", "#EF4B57"],
  ["--color-ds-erreur-fond", "#FDECEC"],
  ["--color-ds-info", "#4F46E5"],
  ["--color-ds-info-fond", "#ECEBFE"],
  ["--color-ds-alerte", "#E08A18"],
  ["--color-ds-alerte-fond", "#FCF3E3"],
  ["--radius-ds-xs", "6px"],
  ["--radius-ds-sm", "10px"],
  ["--radius-ds-md", "12px"],
  ["--radius-ds-lg", "14px"],
  ["--radius-ds-xl", "18px"],
  ["--radius-ds-2xl", "24px"],
  ["--radius-ds-3xl", "32px"],
  ["--radius-ds-pill", "999px"],
  ["--radius-ds-card", "16px"],
  ["--radius-ds-card-lg", "20px"],
  ["--radius-ds-control", "12px"],
  ["--radius-ds-button", "999px"],
  ["--radius-ds-icon-tile", "12px"],
  ["--radius-ds-window", "18px"],
  ["--shadow-ds-none", "none"],
  ["--shadow-ds-xs", "0 1px 2px rgba(28,22,78,.05)"],
  ["--shadow-ds-sm", "0 2px 8px rgba(28,22,78,.06)"],
  ["--shadow-ds-card", "0 4px 16px rgba(28,22,78,.06)"],
  ["--shadow-ds-md", "0 10px 26px rgba(28,22,78,.08)"],
  ["--shadow-ds-lg", "0 20px 48px rgba(28,22,78,.10)"],
  ["--shadow-ds-window", "0 30px 80px rgba(28,22,78,.16)"],
  ["--shadow-ds-brand", "0 10px 26px rgba(91,75,245,.30)"],
  ["--shadow-ds-brand-hover", "0 14px 32px rgba(91,75,245,.38)"],
  ["--text-ds-display-xl", "64px"],
  ["--text-ds-display", "52px"],
  ["--text-ds-h1", "44px"],
  ["--text-ds-h2", "30px"],
  ["--text-ds-h3", "22px"],
  ["--text-ds-h4", "18px"],
  ["--text-ds-body-lg", "18px"],
  ["--text-ds-body", "16px"],
  ["--text-ds-body-sm", "14px"],
  ["--text-ds-caption", "13px"],
  ["--text-ds-micro", "11px"],
  ["--ease-ds-standard", "cubic-bezier(.4,0,.2,1)"],
  ["--ease-ds-out", "cubic-bezier(.16,1,.3,1)"],
  ["--ease-ds-in-out", "cubic-bezier(.65,0,.35,1)"],
];

describe("Le thème porte les tokens du design system", () => {
  const bloc = blocDuDesignSystem();
  const poses = new Map(
    [...bloc.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1] as string,
      (m[2] as string).trim(),
    ]),
  );

  test("la sonde lit réellement le second bloc", () => {
    // Un ensemble vide passe tout. Si le bloc changeait de forme, ou si
    // quelqu'un fusionnait les deux, cette suite deviendrait verte et muette.
    expect(bloc.length, "aucun second bloc `@theme` : le design system n'est plus posé").toBeGreaterThan(
      1000,
    );
    expect(
      [...poses.keys()].filter((n) => n.includes("-ds-")).length,
      "moins de cinquante tokens `ds` : la sonde vise à côté",
    ).toBeGreaterThan(50);
  });

  test("chaque token du design system est posé, à sa valeur exacte", () => {
    const ecarts: string[] = [];
    for (const [nom, attendue] of TOKENS_DU_DESIGN_SYSTEM) {
      const posee = poses.get(nom);
      if (posee === undefined) {
        ecarts.push(`${nom} ABSENT (attendu ${attendue})`);
      } else if (posee !== attendue) {
        ecarts.push(`${nom} vaut « ${posee} », le design system dit « ${attendue} »`);
      }
    }
    expect(
      ecarts,
      "Le thème diverge du design system. Il fait foi : régénérer avec " +
        "`node scripts/generer-tokens-design-system.mjs` plutôt que corriger à la main.",
    ).toEqual([]);
  });

  test("SECOND SENS : aucun token `ds` inventé hors du design system", () => {
    const declares = new Set(TOKENS_DU_DESIGN_SYSTEM.map(([n]) => n));
    // Les familles et les dégradés sont posés à la main, avec leur raison : ils
    // n'ont pas d'équivalent direct dans `tokens/*.css` (Inter est déjà chargée
    // par `next/font`, et un dégradé n'appartient à aucun espace Tailwind).
    const ADMIS = new Set(["--font-ds-display", "--font-ds-body"]);
    const intrus = [...poses.keys()].filter(
      (n) => n.includes("-ds-") && !declares.has(n) && !ADMIS.has(n),
    );
    expect(
      intrus,
      "Tokens `ds` que le design system ne porte pas. Une valeur inventée ici " +
        "deviendrait la référence du premier écran qui l'emploie.",
    ).toEqual([]);
  });

  test("le bloc ne porte QUE des déclarations", () => {
    /*
     * ⚠️ DÉFAUT RÉEL, LE 11/09/2026, ET AUCUNE DES TROIS AUTRES SONDES NE L'A VU.
     *
     * Le bloc est produit par `scripts/generer-tokens-design-system.mjs`. En le régénérant avec
     * `> fichier 2>&1`, le message de diagnostic du script — « 104 tokens
     * générés. » — a été fusionné dans sa sortie et posé EN PLEIN MILIEU du
     * `@theme`. Les trois sondes ci-dessus lisent des motifs `--nom: valeur;` :
     * une ligne qui n'en est pas un leur est simplement INVISIBLE. Elles sont
     * restées vertes sur un CSS que PostCSS refuse — `Unknown word tokens`, et
     * la porte `build` est tombée.
     *
     * La leçon : une sonde qui cherche ce qu'elle attend ne voit pas ce qu'elle
     * n'attend pas. On borne donc le bloc par ce qu'il a le droit de contenir,
     * et non par ce qu'on espère y trouver.
     */
    const intrus = blocDuDesignSystem()
      .split("\n")
      .map((l, i) => [i + 1, l.trim()] as const)
      .filter(([, l]) => l !== "" && l !== "@theme {")
      .filter(([, l]) => !/^--[a-z0-9-]+\s*:\s*[^;]+;$/.test(l))
      .map(([n, l]) => `ligne ${n} : « ${l.slice(0, 60)} »`);

    expect(
      intrus,
      "Le bloc `@theme` du design system contient autre chose qu'une " +
        "déclaration. PostCSS refusera le fichier, et aucune sonde qui lit des " +
        "tokens ne peut le voir.",
    ).toEqual([]);
  });

  test("aucune couleur n'est nommée dans l'espace `--text-*`", () => {
    /*
     * ⚠️ LE DÉFAUT QU'ON NE REPRODUIT PAS, ET IL EST MESURÉ.
     *
     * Chez le design system, `--text-body` est déclaré DEUX FOIS : couleur dans
     * `colors.css`, taille `16px` dans `typography.css`, importé APRÈS — donc la
     * taille gagne. Son propre `base.css` écrit `color: var(--text-body)`,
     * c'est-à-dire `color: 16px`, déclaration invalide.
     *
     * Mesuré le 11/09/2026 sur sa page `auth` servie en HTTP et montée :
     * `getComputedStyle(document.body).color` rend `rgb(0, 0, 0)` au lieu de
     * `#6B6F8C`, et cinq blocs de copie sur vingt-sept sortent en noir pur.
     *
     * Tailwind réserve `--text-*` aux TAILLES. Les couleurs de texte du thème
     * sont donc `--color-ds-texte-*`, et cette garde interdit de revenir en
     * arrière — l'erreur ne lève rien, elle se contente d'être noire.
     */
    const couleursMalPlacees = [...poses.entries()].filter(
      ([nom, valeur]) => nom.startsWith("--text-ds-") && /^#|^rgb|^var\(--color/.test(valeur),
    );
    expect(
      couleursMalPlacees.map(([n, v]) => `${n} = ${v}`),
      "Une couleur est posée dans l'espace des tailles. Elle ne lèvera rien : " +
        "`color: 16px` est simplement ignoré, et le texte sort en noir.",
    ).toEqual([]);
  });
});
