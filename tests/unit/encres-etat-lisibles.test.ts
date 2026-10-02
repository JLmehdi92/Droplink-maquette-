import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * UN TEXTE OU UNE ICÔNE AUX COULEURS D'ÉTAT SE LIT : 4,5:1 SUR LA CARTE ET SUR
 * SON FOND TEINTÉ.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE, MESURÉ LE 15/09/2026. Les couleurs d'état du
 * design system servaient à la fois d'APLAT et de TEXTE. En texte, sur blanc :
 * erreur #EF4B57 3,61:1, succès #12A87A 3,04:1, alerte #E08A18 2,69:1 — et
 * moins encore sur leur propre fond teinté, là où vivent les pastilles de
 * statut. 119 utilitaires du produit, et le kit partout. Décision de Wassim :
 * des ENCRES, même teinte, luminosité abaissée ; le -500 reste aux aplats.
 *
 * ⚠️ ELLE COMPARE DES VALEURS, PAS DES NOMS (L-020). Interdire la chaîne
 * `text-ds-erreur` ne dirait rien le jour où l'encre elle-même serait éclaircie.
 * Chaque utilitaire est RÉSOLU dans `globals.css`, puis mesuré contre la carte
 * et contre le fond teinté de SA famille — la pastille est le cas le plus dur.
 */

const RACINE = join(process.cwd(), "src");
const CSS = readFileSync(join(RACINE, "app", "globals.css"), "utf8");
const JETONS: ReadonlyMap<string, string> = new Map(
  [...CSS.matchAll(/--color-(ds-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()]),
);
const FAMILLES = ["erreur", "succes", "alerte", "info"] as const;

function luminance(hex: string): number {
  const [r, v, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (v ?? 0) + 0.0722 * (b ?? 0);
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair ?? 0) + 0.05) / ((sombre ?? 0) + 0.05);
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(tsx|ts)$/.test(nom) ? [chemin] : [];
  });
}

/** `text-ds-erreur`, `hover:text-ds-succes-encre`… : famille et jeton exact. */
function relever(): Array<{ ou: string; famille: string; jeton: string }> {
  const motif = new RegExp(`(?<![\\w-])(?:[a-z0-9\\[\\]-]+:)*text-(ds-(${FAMILLES.join("|")})(?:-encre)?)(?![\\w-])`, "g");
  return fichiers(RACINE).flatMap((chemin) => {
    const source = readFileSync(chemin, "utf8");
    return [...source.matchAll(motif)].map((m) => ({
      ou: `${relative(process.cwd(), chemin).split(sep).join("/")}:${source.slice(0, m.index).split("\n").length}`,
      jeton: m[1] ?? "",
      famille: m[2] ?? "",
    }));
  });
}

const CARTE = JETONS.get("ds-surface-carte") ?? "";

/*
 * LA REFONTE (02/10/2026) PEINT SES TEXTES PAR SES FEUILLES : les utilitaires fondent
 * écran après écran, et une garde qui ne lirait qu'eux finirait par ne plus rien voir.
 * Elle relève donc aussi chaque `color:` des feuilles de la refonte qui désigne une
 * couleur d'état — directement (`--color-ds-erreur…`) ou par un alias (`--erreur-encre`).
 */
const FEUILLES = ["socle", "app", "client"].map((f) => ({
  nom: f,
  css: readFileSync(join(RACINE, "styles", "refonte", f + ".css"), "utf8"),
}));
const ALIAS: ReadonlyMap<string, string> = new Map(
  FEUILLES.flatMap(({ css }) =>
    [...css.matchAll(/(--[a-z-]+)\s*:\s*var\(--color-(ds-[a-z0-9-]+)\)/g)].map((m) => [m[1] ?? "", m[2] ?? ""] as const),
  ),
);
function releverFeuilles(): Array<{ ou: string; famille: string; jeton: string }> {
  return FEUILLES.flatMap(({ nom, css }) =>
    [...css.matchAll(/(?<![-\w])color:\s*var\((--[a-z0-9-]+)\)/g)].flatMap((m) => {
      const variable = m[1] ?? "";
      const jeton = variable.startsWith("--color-") ? variable.slice("--color-".length) : (ALIAS.get(variable) ?? "");
      const famille = new RegExp(`^ds-(${FAMILLES.join("|")})(?:-encre)?$`).exec(jeton)?.[1];
      if (famille === undefined) return [];
      return [{ ou: `refonte/${nom}.css:${css.slice(0, m.index).split("\n").length} (${variable})`, famille, jeton }];
    }),
  );
}
/** Relevés le 02/10/2026 ; un plancher PAR MOITIÉ, pour qu'aucune ne masque la disparition de l'autre.
 *  Utilitaires : 63 le même jour, après le retrait de `coque-acces` et de l'ancienne
 *  `maquette-application`, orphelins une fois l'onboarding porté. */
// 10 après le portage de l'administration (02/10/2026) : ses écrans peignent leurs états
// par la feuille (`.adm-badge`, `.delta`), relevée par l'autre moitié de la garde.
const PLANCHER_UTILITAIRES = 8;
const PLANCHER_FEUILLES = 80;

describe("les encres des couleurs d'état", () => {
  test("CONTRE-TEST : la garde voit les utilitaires, résout les jetons, et reproduit les contrastes relevés", () => {
    expect(relever().length, "aucun utilitaire relevé : la moitié Tailwind ne regarde plus rien").toBeGreaterThanOrEqual(PLANCHER_UTILITAIRES);
    expect(releverFeuilles().length, "aucune couleur d'état relevée dans les feuilles de la refonte").toBeGreaterThanOrEqual(PLANCHER_FEUILLES);
    for (const f of FAMILLES) {
      expect(JETONS.get(`ds-${f}`), `ds-${f} absent de globals.css`).toMatch(/^#[0-9a-f]{6}$/);
      expect(JETONS.get(`ds-${f}-fond`), `ds-${f}-fond absent de globals.css`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Les trois valeurs qui ont motivé la garde, relevées à la main le 15/09/2026.
    expect(contraste(JETONS.get("ds-erreur") ?? "", CARTE)).toBeCloseTo(3.61, 1);
    expect(contraste(JETONS.get("ds-succes") ?? "", CARTE)).toBeCloseTo(3.04, 1);
    expect(contraste(JETONS.get("ds-alerte") ?? "", CARTE)).toBeCloseTo(2.69, 1);
  });

  test("chaque texte aux couleurs d'état tient 4,5:1 sur la carte et sur son fond teinté", () => {
    const fautes = [...relever(), ...releverFeuilles()].flatMap(({ ou, famille, jeton }) => {
      const valeur = JETONS.get(jeton);
      const fond = JETONS.get(`ds-${famille}-fond`) ?? "";
      if (valeur === undefined) return [`${ou} — text-${jeton} : jeton non résolu, donc non mesuré`];
      const surCarte = contraste(valeur, CARTE);
      const surFond = contraste(valeur, fond);
      return surCarte >= 4.5 && surFond >= 4.5
        ? []
        : [`${ou} — text-${jeton} (${valeur}) : ${surCarte.toFixed(2)}:1 sur la carte, ${surFond.toFixed(2)}:1 sur son fond`];
    });
    expect(fautes).toEqual([]);
  });
});
