import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * TOUTE CLÉ DEMANDÉE PAR LE CODE EXISTE-T-ELLE DANS LES DEUX CATALOGUES ?
 *
 * DÉFAUT QUI A MOTIVÉ CE CONTRÔLE : après la refonte du design, la landing
 * rendait `landing.menu.fonctionnement`, `landing.beneficesTitre`,
 * `landing.flottant.suiviTitre`… en toutes lettres à l'écran. Le composant
 * demandait des clés que le catalogue chargé n'avait pas.
 *
 * CE QUE LES CONTRÔLES EXISTANTS NE VOYAIENT PAS :
 *
 *  - `chaines-mortes` cherche l'inverse — une clé que plus rien n'appelle. Une
 *    clé APPELÉE mais absente lui est invisible.
 *  - `i18n-parite` compare les deux catalogues entre eux. Deux catalogues qui
 *    manquent la même clé sont parfaitement en parité.
 *  - `pnpm fumee` le voit à l'écran, mais seulement sur les pages atteignables
 *    SANS SESSION. Les commandes, l'éditeur, la marque, l'admin redirigent : une
 *    clé manquante y partirait en production sans que rien ne la signale.
 *
 * Ce contrôle-ci les couvre TOUS, parce qu'il lit le code et pas des réponses
 * HTTP. Il ne remplace pas la sonde de fumée : elle prouve la RÉSOLUTION à
 * l'écran, celui-ci prouve l'EXISTENCE de ce qui est demandé. Une clé peut
 * exister et ne pas se résoudre — c'est exactement ce qui est arrivé.
 *
 * LES CLÉS COMPOSÉES À L'EXÉCUTION SONT IGNORÉES ICI, et c'est assumé : elles
 * sont déjà déclarées, avec leur raison, dans `chaines-mortes`.
 */

const RACINE = join(process.cwd(), "src");
const CATALOGUES = ["fr", "en"] as const;

/** Aplatit un catalogue en chemins pointés : `landing.menu.tarif`. */
function aplatir(objet: unknown, prefixe = ""): Set<string> {
  const clefs = new Set<string>();
  if (typeof objet !== "object" || objet === null) return clefs;
  for (const [nom, valeur] of Object.entries(objet)) {
    const chemin = prefixe === "" ? nom : prefixe + "." + nom;
    if (typeof valeur === "object" && valeur !== null) {
      for (const c of aplatir(valeur, chemin)) clefs.add(c);
    } else {
      clefs.add(chemin);
    }
  }
  return clefs;
}

/**
 * Retire les commentaires avant toute recherche.
 *
 * Ces fichiers PARLENT de clés dans leurs commentaires pour expliquer une
 * règle — `t("journal.actions.comptes.liste")` y est cité en exemple. Un motif
 * appliqué au texte brut se satisfait de l'explication et signale une clé que
 * personne n'appelle (L-031).
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function fichiersSource(): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".tsx") || chemin.endsWith(".ts")) trouves.push(chemin);
    }
  };
  parcourir(RACINE);
  return trouves;
}

/**
 * L'espace de noms d'un fichier, tel qu'il l'a demandé.
 *
 * `getTranslations("commandes")` ou `useTranslations("commandes")`. Un fichier
 * peut en ouvrir plusieurs — l'éditeur en ouvre trois — donc on les collecte
 * tous et une clé est acceptée si elle existe sous L'UN d'eux. C'est moins
 * précis qu'un suivi de variable, et c'est délibéré : le but est d'attraper une
 * clé qui n'existe NULLE PART, pas d'arbitrer laquelle des trois l'a demandée.
 *
 * LE POINT EST ACCEPTÉ DANS LE NOM : `getTranslations("admin.parametres")`
 * ouvre un espace IMBRIQUÉ. Sans lui, les sept clés de cet écran étaient
 * signalées manquantes alors qu'elles existent — un contrôle qui crie au loup
 * finit désactivé, et c'est comme ça qu'on perd un contrôle utile.
 */
function espacesDuFichier(source: string): readonly string[] {
  const espaces = new Set<string>();
  for (const m of source.matchAll(/(?:getTranslations|useTranslations)\(\s*"([a-z-]+(?:\.[a-z-]+)*)"/g)) {
    espaces.add(m[1] as string);
  }
  for (const m of source.matchAll(/namespace:\s*"([a-z-]+(?:\.[a-z-]+)*)"/g)) {
    espaces.add(m[1] as string);
  }
  return [...espaces];
}

/**
 * Les clés LITTÉRALES demandées : `t("x.y")`, `t.raw("x.y")`.
 *
 * Celles qui se terminent par un point sont écartées : ce sont les PRÉFIXES de
 * clés composées à l'exécution — `t("qc." + ligne.qc)`. Elles ne désignent
 * aucune entrée, et leurs familles sont déjà déclarées, avec leur raison, dans
 * `chaines-mortes`.
 */
function clefsDemandees(source: string): readonly string[] {
  const clefs: string[] = [];
  for (const m of source.matchAll(/\bt(?:\.raw)?\(\s*"([A-Za-z][A-Za-z0-9_.]*)"/g)) {
    const clef = m[1] as string;
    if (!clef.endsWith(".")) clefs.push(clef);
  }
  return clefs;
}

describe("Aucune clé demandée n'est absente des catalogues", () => {
  const catalogues = new Map(
    CATALOGUES.map((langue) => [
      langue,
      aplatir(JSON.parse(readFileSync(join(process.cwd(), "messages", langue + ".json"), "utf8"))),
    ]),
  );

  const fichiers = fichiersSource();

  // UN ENSEMBLE VIDE PASSE TOUT. Sans ces bornes, un chemin renommé ou une
  // expression régulière devenue muette rendrait cette suite verte — et c'est
  // précisément le défaut qu'elle est censée empêcher.
  test("la sonde lit réellement le code et les catalogues", () => {
    expect(fichiers.length, "aucun fichier source trouvé").toBeGreaterThan(40);
    for (const [langue, clefs] of catalogues) {
      expect(clefs.size, `catalogue ${langue} vide`).toBeGreaterThan(200);
    }

    const total = fichiers.reduce(
      (n, f) => n + clefsDemandees(sansCommentaires(readFileSync(f, "utf8"))).length,
      0,
    );
    expect(total, "aucun appel de traduction trouvé : la lecture est fausse").toBeGreaterThan(100);
  });

  test.each(CATALOGUES)("catalogue %s", (langue) => {
    const connues = catalogues.get(langue) as Set<string>;
    const manquantes: string[] = [];

    for (const fichier of fichiers) {
      const source = sansCommentaires(readFileSync(fichier, "utf8"));
      const espaces = espacesDuFichier(source);
      if (espaces.length === 0) continue;

      for (const clef of clefsDemandees(source)) {
        const existe = espaces.some((e) => connues.has(e + "." + clef));
        if (!existe) {
          manquantes.push(`${fichier.split(/[\\/]/).slice(-2).join("/")} → ${clef}`);
        }
      }
    }

    expect(
      [...new Set(manquantes)],
      "Clés demandées par le code et absentes du catalogue : elles sortent " +
        "TELLES QUELLES à l'écran.",
    ).toEqual([]);
  });

  // CONTRE-TEST DU CONTRÔLE LUI-MÊME. Il doit reconnaître une clé absente —
  // sinon il passerait à 100 % en ne reconnaissant jamais rien, ce qui est
  // exactement l'état dans lequel un motif cassé laisse une sonde.
  test("une clé absente EST reconnue comme absente", () => {
    const source = `const t = await getTranslations("landing");\nt("cleQuiNExistePas")`;
    const connues = catalogues.get("fr") as Set<string>;
    const espaces = espacesDuFichier(source);

    expect(espaces).toContain("landing");
    expect(clefsDemandees(source)).toContain("cleQuiNExistePas");
    expect(espaces.some((e) => connues.has(e + ".cleQuiNExistePas"))).toBe(false);
  });
});
