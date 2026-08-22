import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LES DÉPENDANCES TRANSITIVES QU'ON A DÛ FORCER.
 *
 * `next` amène `postcss` et `sharp`, et les versions qu'il épingle portaient
 * cinq vulnérabilités connues — trois hautes, dont un accès à des fichiers
 * arbitraires par une carte de source contrôlée par l'attaquant. Aucun des deux
 * n'est une dépendance directe : on ne pouvait donc pas les monter en changeant
 * une ligne de `dependencies`. Ils sont forcés par `pnpm.overrides`.
 *
 * CE CONTRÔLE REGARDE LA VERSION INSTALLÉE, PAS LA DÉCLARATION. Un test qui
 * constate qu'un `override` EXISTE ne prouve jamais que son absence bloquerait
 * quoi que ce soit : une plage mal écrite, un lockfile pas régénéré, une
 * résolution qui retombe ailleurs — et la déclaration reste là, rassurante,
 * pendant que l'arbre porte l'ancienne version.
 *
 * IL NE REMPLACE PAS `pnpm audit`, qui seul connaît les avis publiés APRÈS
 * aujourd'hui. Il fait autre chose : il empêche une régression SILENCIEUSE de ce
 * qu'on a déjà corrigé, sans dépendre du réseau — un contrôle qui interroge un
 * service distant échoue par intermittence, et un test qu'on relance jusqu'au
 * vert n'est plus bloquant.
 *
 * IL LIT LE LOCKFILE, ET C'EST UNE CORRECTION. La première version lisait
 * `node_modules/<paquet>/package.json`. Falsifiée — override retiré, arbre
 * réinstallé — elle est restée VERTE : pnpm isole les dépendances transitives,
 * donc le paquet n'était plus à la racine de `node_modules`, la lecture rendait
 * `null`, et l'absence était traitée comme « rien à corriger ». La sonde passait
 * exactement dans le cas qu'elle devait attraper.
 *
 * Le lockfile, lui, liste TOUTES les versions résolues de l'arbre — y compris
 * imbriquées, y compris celles qu'un override futur oublierait de couvrir.
 */

/** Les minimums viennent des avis eux-mêmes, pas d'une préférence. */
const MINIMUMS: readonly { paquet: string; minimum: string; pourquoi: string }[] = [
  {
    paquet: "postcss",
    minimum: "8.5.23",
    pourquoi:
      "GHSA-fxqj-rqcc-2cmp et suivants : lecture de fichiers arbitraires via un " +
      "`sourceMappingURL` contrôlé par l'attaquant quand `from` n'est pas posé, " +
      "traversée de chemin au chargement de carte de source, et XSS par un " +
      "`</style>` non échappé.",
  },
  {
    paquet: "sharp",
    minimum: "0.35.0",
    pourquoi:
      "Vulnérabilités héritées de libvips. Le paquet est DORMANT chez nous — " +
      "aucun `next/image` — mais un paquet dormant reste dans l'arbre, et " +
      "« personne ne l'appelle » est une circonstance, pas une protection.",
  },
];

/**
 * Toutes les versions d'un paquet présentes dans l'arbre résolu.
 *
 * Le lockfile les nomme `<paquet>@<version>` en tête de bloc, éventuellement
 * suivies de leurs pairs entre parenthèses — `sharp@0.35.3(@types/node@20.x)`.
 * On veut la version, pas les pairs.
 */
function versionsResolues(paquet: string): string[] {
  const lock = readFileSync(join(process.cwd(), "pnpm-lock.yaml"), "utf8");
  // Le nom est échappé : un paquet peut porter un point ou un tiret, et une
  // sonde qui compose sa propre expression finit par tester sa composition.
  const nom = paquet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const motif = new RegExp(`^\\s{2}${nom}@([0-9]+\\.[0-9]+\\.[0-9]+[^(:\\s]*)`, "gm");
  const vues = new Set<string>();
  for (const m of lock.matchAll(motif)) {
    const v = m[1];
    if (v !== undefined) vues.add(v);
  }
  return [...vues];
}

/** Compare deux versions sémantiques. Rend <0, 0 ou >0. */
function comparer(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

describe("Les dépendances transitives corrigées le restent", () => {
  test("la sonde compare réellement des versions", () => {
    // Un ensemble vide passe tout. Si l'extraction rendait `null` partout — un
    // changement de disposition de `node_modules`, par exemple — le contrôle
    // suivant passerait sans rien vérifier.
    expect(comparer("8.5.23", "8.5.9"), "la comparaison traite les versions comme du texte").toBeGreaterThan(
      0,
    );
    expect(comparer("0.34.9", "0.35.0")).toBeLessThan(0);
    expect(comparer("1.2.3", "1.2.3")).toBe(0);
  });

  test.each(MINIMUMS)("$paquet est au moins en $minimum", ({ paquet, minimum, pourquoi }) => {
    const versions = versionsResolues(paquet);

    // Un paquet ABSENT de l'arbre est un état admissible : il n'y a alors rien à
    // corriger. Le dire explicitement évite qu'une disparition passe pour une
    // réussite — et qu'un retour passe pour rien.
    if (versions.length === 0) return;

    const anciennes = versions.filter((v) => comparer(v, minimum) < 0);
    expect(
      anciennes,
      `${paquet} résolu en ${anciennes.join(", ")}, antérieur à ${minimum}. ${pourquoi}`,
    ).toEqual([]);
  });

  test("la sonde trouve bien les paquets qu'elle prétend surveiller", () => {
    // LE CONTRÔLE QUI MANQUAIT À LA PREMIÈRE VERSION. Sans lui, une extraction
    // qui ne trouve plus rien rend un ensemble vide, et un ensemble vide passe
    // tout — c'est exactement comme cela que la version précédente est restée
    // verte alors que l'override était retiré.
    for (const { paquet } of MINIMUMS) {
      expect(
        versionsResolues(paquet).length,
        `aucune version de ${paquet} trouvée dans le lockfile : la sonde ne regarde rien`,
      ).toBeGreaterThan(0);
    }
  });
});
