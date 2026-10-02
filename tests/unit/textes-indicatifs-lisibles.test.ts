import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LE TEXTE INDICATIF D'UN CHAMP SE LIT : 4,5:1 SUR LA CARTE ET SUR LE CREUX.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE, MESURÉ LE 15/09/2026. Onze champs du produit
 * posaient leur texte indicatif en « estompé » (#A9AEC4) ou en « sourdine »
 * (#8B90A8) : 2,20:1 et 3,16:1 sur blanc — « Rechercher une commande… », le
 * code à six chiffres de la double authentification, les champs de l'éditeur,
 * de la marque et du signalement. Le kit, lui, ne fixait AUCUNE couleur et
 * rendait le gris par défaut de Chrome, 4,61:1. Aucune soustraction ne pouvait
 * le voir : elle compare des textes, et un texte indicatif n'en est pas un.
 *
 * ⚠️ ELLE COMPARE DES VALEURS, PAS DES NOMS (L-020). Interdire la chaîne
 * `placeholder:text-ds-texte-tenu` laisserait passer `placeholder:text-[#ccc]`,
 * un futur alias, ou un jeton dont la valeur changerait. Chaque couleur est
 * RÉSOLUE — dans `globals.css` pour un jeton, telle quelle pour une valeur
 * arbitraire — puis mesurée. Une couleur qu'elle ne sait pas résoudre la fait
 * ÉCHOUER : l'ignorer serait la laisser passer.
 *
 * Et la règle de base de `globals.css` est mesurée elle aussi : c'est elle qui
 * peint tout champ qui ne déclare rien.
 */

const RACINE = join(process.cwd(), "src");
const CSS = readFileSync(join(RACINE, "app", "globals.css"), "utf8");

const JETONS: ReadonlyMap<string, string> = new Map(
  [...CSS.matchAll(/--color-(ds-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]),
);

function luminance(hex: string): number {
  const canaux = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, v, b] = canaux.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (v ?? 0) + 0.0722 * (b ?? 0);
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair ?? 0) + 0.05) / ((sombre ?? 0) + 0.05);
}

/** `ds-texte-corps` → sa valeur ; `[#6b6f8c]` → `#6b6f8c` ; sinon `null`. */
function resoudre(couleur: string): string | null {
  const arbitraire = /^\[(#[0-9a-fA-F]{6})\]$/.exec(couleur);
  if (arbitraire) return (arbitraire[1] ?? "").toLowerCase();
  return JETONS.get(couleur) ?? null;
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(tsx|ts)$/.test(nom) ? [chemin] : [];
  });
}

function releverClasses(): Array<{ ou: string; couleur: string }> {
  const trouves: Array<{ ou: string; couleur: string }> = [];
  for (const chemin of fichiers(RACINE)) {
    const source = readFileSync(chemin, "utf8");
    // `placeholder:text-<couleur>` ; les tailles (`text-[13px]`, `text-sm`) ne sont pas des couleurs.
    for (const m of source.matchAll(/placeholder:text-((?:ds-[a-z0-9-]+)|\[[^\]]+\])/g)) {
      const couleur = m[1] ?? "";
      if (/^\[\d/.test(couleur)) continue;
      trouves.push({
        ou: `${relative(process.cwd(), chemin).split(sep).join("/")}:${source.slice(0, m.index).split("\n").length}`,
        couleur,
      });
    }
  }
  return trouves;
}

/*
 * LA REFONTE (02/10/2026) PEINT SES CHAMPS PAR SES FEUILLES, plus par des classes
 * Tailwind : la maquette posait ses textes indicatifs en `--sourdine` (3,16:1),
 * et cette garde, qui ne lisait que les classes, ne l'a pas vu sur la connexion.
 * Elle relève donc aussi chaque règle `::placeholder` des feuilles de la refonte,
 * en résolvant l'alias (`--corps` → `--color-ds-texte-corps` → sa valeur).
 */
const FEUILLES = ["socle", "app", "client"].map((f) => readFileSync(join(RACINE, "styles", "refonte", f + ".css"), "utf8"));
const ALIAS: ReadonlyMap<string, string> = new Map(
  FEUILLES.flatMap((css) => [...css.matchAll(/(--[a-z-]+)\s*:\s*var\(--color-(ds-[a-z0-9-]+)\)/g)].map((m) => [m[1] ?? "", m[2] ?? ""] as const)),
);
function releverRegles(): Array<{ ou: string; couleur: string | null }> {
  return FEUILLES.flatMap((css, i) =>
    // TOUTE couleur de `::placeholder`, pas seulement une variable : une valeur en
    // clair qu'on ne sait pas résoudre est une faute, jamais une règle ignorée.
    [...css.matchAll(/::placeholder[^{]*\{[^}]*?(?<![-\w])color:\s*([^;}]+)/g)].map((m) => {
      const valeur = (m[1] ?? "").trim();
      const variable = /^var\((--[a-z0-9-]+)\)$/.exec(valeur)?.[1];
      const ou = `refonte/${["socle", "app", "client"][i]}.css (${valeur})`;
      if (variable === undefined) return { ou, couleur: /^#[0-9a-f]{6}$/i.test(valeur) ? valeur.toLowerCase() : null };
      const jeton = variable.startsWith("--color-") ? variable.slice("--color-".length) : (ALIAS.get(variable) ?? "");
      return { ou, couleur: JETONS.get(jeton) ?? null };
    }),
  );
}

// Relevés le 02/10/2026 : les classes fondent à mesure que les écrans passent aux feuilles
// (2 après la page client, 1 après le signalement, passé à `.sig-champ ::placeholder`).
const PLANCHER_CLASSES = 1;
const PLANCHER_REGLES = 10;

const CARTE = JETONS.get("ds-surface-carte") ?? "";
const CREUX = JETONS.get("ds-surface-creux") ?? "";

describe("les textes indicatifs des champs", () => {
  test("chaque règle `::placeholder` des feuilles de la refonte tient 4,5:1 sur la carte et sur le creux", () => {
    const regles = releverRegles();
    expect(regles.length, "aucune règle relevée dans les feuilles de la refonte").toBeGreaterThanOrEqual(PLANCHER_REGLES);
    const fautes = regles.filter(
      ({ couleur }) => couleur === null || contraste(couleur, CARTE) < 4.5 || contraste(couleur, CREUX) < 4.5,
    );
    expect(fautes.map((f) => f.ou), "textes indicatifs illisibles ou couleur non résolue").toEqual([]);
  });

  test("CONTRE-TEST : la garde voit des textes indicatifs, et elle sait mesurer un contraste", () => {
    expect(CARTE, "fond de carte introuvable dans globals.css").toMatch(/^#[0-9a-f]{6}$/);
    expect(CREUX, "fond creux introuvable dans globals.css").toMatch(/^#[0-9a-f]{6}$/);
    // Un plancher PAR MOITIÉ : additionnés, les relevés des feuilles masqueraient
    // la disparition des classes, et l'inverse.
    expect(releverClasses().length, "aucun `placeholder:text-*` relevé : la moitié Tailwind ne regarde plus rien").toBeGreaterThanOrEqual(PLANCHER_CLASSES);
    expect(releverRegles().length, "aucune règle `::placeholder` relevée dans les feuilles de la refonte").toBeGreaterThanOrEqual(PLANCHER_REGLES);
    // Les valeurs relevées le 15/09/2026, à la main, dans Chrome.
    expect(contraste("#a9aec4", "#ffffff")).toBeCloseTo(2.2, 1);
    expect(contraste("#757575", "#ffffff")).toBeCloseTo(4.61, 1);
  });

  test("la règle de base peint tout champ qui ne déclare rien, et elle se lit", () => {
    const regle = /::placeholder\s*\{[^}]*color:\s*var\(--color-(ds-[a-z0-9-]+)\)/.exec(CSS);
    expect(regle, "globals.css ne porte plus de règle `::placeholder`").not.toBeNull();
    const valeur = resoudre(regle?.[1] ?? "");
    expect(valeur, `jeton ${regle?.[1]} introuvable`).not.toBeNull();
    expect(contraste(valeur ?? "", CARTE)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(valeur ?? "", CREUX)).toBeGreaterThanOrEqual(4.5);
  });

  test("chaque couleur de texte indicatif tient 4,5:1 sur la carte et sur le creux", () => {
    const fautes = releverClasses().flatMap(({ ou, couleur }) => {
      const valeur = resoudre(couleur);
      if (valeur === null) return [`${ou} — ${couleur} : couleur non résolue, donc non mesurée`];
      const surCarte = contraste(valeur, CARTE);
      const surCreux = contraste(valeur, CREUX);
      return surCarte >= 4.5 && surCreux >= 4.5
        ? []
        : [`${ou} — ${couleur} (${valeur}) : ${surCarte.toFixed(2)}:1 sur la carte, ${surCreux.toFixed(2)}:1 sur le creux`];
    });
    expect(fautes).toEqual([]);
  });
});
