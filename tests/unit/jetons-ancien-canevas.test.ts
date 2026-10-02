import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * AUCUNE CLASSE NE PEINT AVEC UNE COULEUR DE L'ANCIEN CANEVAS.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE, MESURÉ LE 15/09/2026. Tous les écrans
 * sortaient en code 0 contre le design system, et pourtant `bg-primary` rendait
 * encore un bouton NOIR dans le menu téléphone de la landing et dans la
 * confirmation de suspension, `bg-corail` une barre de la surveillance,
 * `text-alerte-titre` le titre des alertes du panneau. La soustraction ne voit
 * que ce que le jeu de mesure affiche : un menu replié, un formulaire fermé, une
 * alerte qui ne se déclenche jamais n'y entrent pas.
 *
 * ELLE INVENTORIE PLUTÔT QU'ELLE NE SÉLECTIONNE : la liste des couleurs
 * interdites est LUE dans `globals.css` — tout `--color-*` qui ne commence pas
 * par `--color-ds-`. Une couleur ajoutée à l'ancien thème entre dans la garde
 * sans que personne n'ait à y penser.
 */

const RACINE = join(process.cwd(), "src");
const CSS = readFileSync(join(RACINE, "app", "globals.css"), "utf8");

/** Les couleurs de l'ancien thème, lues dans la feuille. */
const ANCIENNES = [...CSS.matchAll(/--color-([a-z0-9-]+)\s*:/g)]
  .map((m) => m[1] ?? "")
  .filter((nom) => nom !== "" && !nom.startsWith("ds-"));

const UTILITAIRES =
  "bg|text|border|border-[trblxy]|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|caret|accent";

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(tsx|ts)$/.test(nom) ? [chemin] : [];
  });
}

/** Le code sans ses commentaires (L-031) : un commentaire qui CITE la classe fautive n'est pas une classe. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function motifPour(noms: readonly string[]): RegExp {
  const echappes = [...noms].sort((a, b) => b.length - a.length).map((n) => n.replace(/[-]/g, "\\-"));
  return new RegExp(
    `(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITAIRES})-(${echappes.join("|")})(?:\\/\\d+)?(?![\\w-])|var\\(--color-(${echappes.join("|")})\\)`,
    "g",
  );
}

function relever(motif: RegExp): Array<{ fichier: string; ligne: number; classe: string }> {
  const trouves: Array<{ fichier: string; ligne: number; classe: string }> = [];
  for (const chemin of fichiers(RACINE)) {
    const code = codeSeul(readFileSync(chemin, "utf8"));
    for (const m of code.matchAll(motif)) {
      trouves.push({
        fichier: relative(process.cwd(), chemin).split(sep).join("/"),
        ligne: code.slice(0, m.index).split("\n").length,
        classe: m[0],
      });
    }
  }
  return trouves;
}

describe("les couleurs de l'ancien canevas", () => {
  test("CONTRE-TEST : la feuille déclare bien des couleurs de l'ancien thème, et la sonde voit les classes du design system", () => {
    // Un inventaire vide passerait tout : si `globals.css` changeait de forme,
    // la garde ne chercherait plus rien et resterait verte.
    expect(ANCIENNES.length, "aucune couleur de l'ancien thème lue dans globals.css").toBeGreaterThanOrEqual(20);
    const ds = [...CSS.matchAll(/--color-(ds-[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? "");
    expect(relever(motifPour(ds)).length, "la sonde ne trouve aucune classe du design system : elle est cassée").toBeGreaterThan(100);
    // 135 le 02/10/2026, après le portage de l'administration : les écrans de la refonte
    // emploient les classes de leurs feuilles, plus les utilitaires `ds-*`.
  });

  test("la sonde attrape une classe fautive, préfixée ou non, et ignore la même classe du design system", () => {
    const motif = motifPour(["primary", "alerte-titre"]);
    const vus = (texte: string) => [...texte.matchAll(motif)].map((m) => m[0]);
    expect(vus('className="flex bg-primary px-4"')).toEqual(["bg-primary"]);
    expect(vus('className="md:hover:text-alerte-titre"')).toEqual(["md:hover:text-alerte-titre"]);
    expect(vus('className="border-primary/30"')).toEqual(["border-primary/30"]);
    expect(vus("style={{ color: \"var(--color-primary)\" }}")).toEqual(["var(--color-primary)"]);
    expect(vus('className="bg-ds-primary text-primary-foreground bg-primaryx"')).toEqual([]);
  });

  test("aucun fichier de src ne peint avec elles", () => {
    const fautes = relever(motifPour(ANCIENNES)).map((f) => `${f.fichier}:${f.ligne} — ${f.classe}`);
    expect(
      fautes,
      "Ces classes emploient une couleur de l'ancien canevas. Le design system a son jeton `ds-` " +
        "pour chacune ; et si l'état qu'elle peint n'est jamais affiché par le jeu de mesure, c'est " +
        "précisément pour ça qu'aucune soustraction ne l'a vue.",
    ).toEqual([]);
  });
});
