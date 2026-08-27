import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LA PALETTE DU THÈME EST CELLE DU CANEVAS, ET RIEN D'AUTRE.
 *
 * ⚠️ DÉFAUT DE FOND, MESURÉ LE 27/08/2026 en comptant les couleurs des 41
 * planches. Le thème était une palette Material Design 3 générée ; le canevas
 * est dessiné à la main. Quatorze couleurs du canevas n'avaient AUCUN
 * équivalent dans le thème, et le violet du code — #6244d8 — n'apparaissait
 * dans AUCUNE planche.
 *
 * Ce test fige l'INVENTAIRE MESURÉ. Les planches vivent hors du dépôt
 * (`C:/Users/mehdi/Desktop/canevas-droplink/`) : un test qui les lirait serait
 * rouge chez quiconque ne les a pas, donc inutilisable comme porte. La
 * fréquence est reportée à côté de chaque valeur — c'est elle qui distingue
 * une couleur de la palette d'un aplat de démonstration, et elle interdit d'en
 * inventer une au prétexte qu'elle « manquait ».
 *
 * IL ÉCHOUE DANS LES DEUX SENS : une couleur du canevas retirée du thème, et
 * une couleur bannie qui y revient.
 */

const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/**
 * LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE RECHERCHE — L-031, dans son sens
 * inverse. La leçon disait qu'une garde peut se SATISFAIRE du commentaire qui
 * décrit la garde ; ici c'est l'inverse qui s'est produit, et je l'ai constaté
 * en rouge : le commentaire qui EXPLIQUE pourquoi #6244d8 est banni faisait
 * échouer le contrôle qui bannit #6244d8. Une garde incapable de distinguer une
 * déclaration d'une explication se trompe dans les deux sens.
 */
const sansCommentaires = (css: string) =>
  css.split("/*").map((p, i) => (i === 0 ? p : p.slice(p.indexOf("*/") + 2))).join("");

const DEBUT = CSS.indexOf("@theme {");
const THEME = sansCommentaires(CSS.slice(DEBUT, CSS.indexOf("\n}", DEBUT))).toLowerCase();

/** Ce que le canevas emploie, avec le nombre d'occurrences relevé sur les 41 planches. */
const PALETTE_DU_CANEVAS: ReadonlyArray<readonly [string, number]> = [
  ["#7c5cf5", 168], ["#ececf0", 94], ["#0e0e13", 86], ["#5b5d68", 80],
  ["#e6e6ec", 78], ["#83858f", 68], ["#c2543c", 55], ["#c5cbfb", 55],
  ["#2f8f5b", 53], ["#111117", 51], ["#f4f4f8", 37], ["#fafafc", 36],
  ["#a4a6b0", 28], ["#f2f2f6", 34], ["#f2765e", 34], ["#5c3fd0", 32],
  ["#f7f7fb", 31], ["#9a9ca6", 29], ["#e4e2ee", 27], ["#f1eefe", 25],
  ["#eef4f0", 25], ["#6b4ae0", 24], ["#f6d9d2", 16], ["#eaeaef", 16],
  ["#e0674a", 12], ["#fffaf9", 12], ["#fdeeea", 12], ["#f0f0f4", 12],
  ["#fff8f6", 5],
];

/**
 * Les couleurs que le thème s'était inventées et que le canevas ignore. Ce
 * versant est le plus important : sans lui, on pourrait ajouter la palette du
 * canevas PAR-DESSUS l'ancienne et croire le travail fait, pendant que les
 * composants continueraient de pointer sur les anciennes valeurs.
 */
const BANNIES: ReadonlyArray<readonly [string, string]> = [
  ["#6244d8", "le violet M3, absent des 41 planches — c'est #7c5cf5"],
  ["#efeaff", "le fond violet M3 — le canevas dit #f1eefe"],
  ["#33208f", "l'encre violette M3 — le canevas dit #6b4ae0"],
  ["#b4462f", "le corail M3 servait de « succès » — le canevas veut du vert #2f8f5b"],
];

describe("La palette du thème", () => {
  /**
   * UN ENSEMBLE VIDE PASSE TOUT. Si l'extraction du bloc `@theme` échouait,
   * `THEME` serait vide et TOUTES les absences seraient satisfaites.
   */
  test("la sonde lit bien un bloc @theme rempli", () => {
    expect(THEME.length).toBeGreaterThan(2000);
    expect(THEME).toContain("--color-canvas: #c5cbfb");
  });

  test("elle contient chaque couleur du canevas", () => {
    const manquantes = PALETTE_DU_CANEVAS
      .filter(([hex]) => !THEME.includes(hex))
      .map(([hex, n]) => `${hex} (${n} occurrences dans les planches)`);
    expect(manquantes).toEqual([]);
  });

  test("elle ne contient AUCUNE couleur étrangère au canevas", () => {
    const revenues = BANNIES
      .filter(([hex]) => THEME.includes(hex))
      .map(([hex, raison]) => `${hex} — ${raison}`);
    expect(revenues).toEqual([]);
  });

  /**
   * Le violet porte 168 occurrences : c'est la couleur qui structure le plus le
   * canevas après le blanc. Elle mérite d'être nommée, pas seulement présente —
   * une valeur qui n'existe que dans un `surface-tint` que personne n'importe
   * est aussi absente qu'une valeur manquante.
   */
  test("le violet de marque est NOMMÉ, pas seulement présent", () => {
    expect(THEME).toContain("--color-violet: #7c5cf5");
    expect(THEME).toContain("--color-succes: #2f8f5b");
    expect(THEME).toContain("--color-ardoise: #5b5d68");
    expect(THEME).toContain("--color-filet-controle: #e6e6ec");
  });
});
