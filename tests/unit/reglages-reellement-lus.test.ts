import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { PARAMETRES } from "@/lib/audit/parametres";

/**
 * UN RÉGLAGE MODIFIABLE DOIT ÊTRE UN RÉGLAGE LU.
 *
 * ⚠️ CETTE PROPRIÉTÉ ÉTAIT AFFIRMÉE, JAMAIS VÉRIFIÉE — et l'affirmation qui la
 * portait était fausse. `lib/audit/parametres.ts` disait : « Les deux entrées
 * correspondent exactement aux deux seuils que `lireSeuils()` consulte : c'est
 * ce qui garantit qu'un réglage modifiable est un réglage lu. » Relevé le
 * 02/09/2026 : il y a CINQ entrées, et `lireSeuils()` en lit TROIS — les deux
 * interrupteurs passent par leurs fonctions dédiées. Deux nombres faux, et une
 * correspondance qui n'a jamais existé sous cette forme.
 *
 * CE QU'UN PARAMÈTRE ÉCRIVABLE ET NON LU PRODUIRAIT, et c'est le pire des deux
 * mondes : l'administrateur le change, le déclencheur consigne la trace,
 * l'écran affiche la nouvelle valeur — et le produit continue exactement comme
 * avant. Rien n'échoue, rien ne rougit, et la seule façon de s'en apercevoir
 * est qu'un incident qu'on croyait paré ne le soit pas.
 *
 * ⚠️ LA LECTURE EST CHERCHÉE HORS DU FORMULAIRE. L'écran d'administration cite
 * évidemment les cinq clés — c'est lui qui les propose. Les compter
 * satisferait le contrôle avec la surface même qui pose le problème : un
 * réglage proposé à l'écriture et lu nulle part ailleurs.
 *
 * ⚠️ ET SUR LE CODE, COMMENTAIRES RETIRÉS (L-031). Ces fichiers expliquent
 * longuement chaque réglage ; un motif appliqué au texte brut se satisferait de
 * la prose qui décrit la lecture au lieu de la lecture.
 */

const RACINE = process.cwd();

/** Tout le code de `src/`, commentaires retirés, sauf ce qu'on exclut. */
function codeConsommateur(): ReadonlyMap<string, string> {
  const exclus = [
    join("src", "app", "[locale]", "admin", "parametres"),
    join("src", "lib", "audit", "parametres.ts"),
  ];
  const fichiers = new Map<string, string>();

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entree)) continue;
      if (exclus.some((e) => chemin.includes(e))) continue;
      const brut = readFileSync(chemin, "utf8");
      fichiers.set(
        relative(RACINE, chemin).split(sep).join("/"),
        brut.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " "),
      );
    }
  };

  parcourir(join(RACINE, "src"));
  return fichiers;
}

/**
 * Les façons dont une clé peut être consommée.
 *
 * Deux formes, et elles ne se ressemblent pas : les seuils passent par une
 * lecture générique qui cite la clé, les interrupteurs par une fonction en base
 * dont le NOM porte la clé. Chercher une seule forme laisserait passer l'autre.
 */
function motifsDeLecture(cle: string): readonly RegExp[] {
  return [
    new RegExp(`["'\`]${cle}["'\`]`),
    new RegExp(`lire_${cle}\\b`),
  ];
}

describe("Chaque réglage modifiable est réellement consommé", () => {
  const code = codeConsommateur();

  test("la sonde lit réellement le code du produit", () => {
    /*
     * UN ENSEMBLE VIDE PASSE TOUT, et deux fois : une liste de fichiers vide
     * ferait échouer tout le monde (visible), mais un dépouilleur trop gourmand
     * viderait les CONTENUS et ferait échouer tout le monde aussi — c'est le
     * second cas qu'on ne verrait pas venir si le contrôle était inversé.
     */
    expect(code.size, "aucun fichier lu : la sonde vise à côté").toBeGreaterThan(50);
    expect(PARAMETRES.length, "l'inventaire des paramètres est vide").toBeGreaterThan(0);
    const total = [...code.values()].reduce((n, c) => n + c.length, 0);
    expect(total, "le code dépouillé est vide : le retrait des commentaires a tout mangé").toBeGreaterThan(
      200_000,
    );
  });

  test.each(PARAMETRES.map((p) => p.cle))("« %s » est lu ailleurs que dans son formulaire", (cle) => {
    const motifs = motifsDeLecture(cle);
    const lecteurs = [...code.entries()]
      .filter(([, contenu]) => motifs.some((m) => m.test(contenu)))
      .map(([fichier]) => fichier);

    expect(
      lecteurs,
      `Le réglage « ${cle} » est écrivable et n'est consommé nulle part hors de ` +
        "son formulaire. L'administrateur le changerait, la trace le " +
        "consignerait, l'écran afficherait la nouvelle valeur, et le produit " +
        "continuerait exactement comme avant.",
    ).not.toEqual([]);
  });

  test("aucune lecture ne cite une clé absente de l'inventaire", () => {
    /*
     * L'AUTRE SENS. Une clé lue par le produit mais absente de `PARAMETRES`
     * n'est pas modifiable : elle a l'air d'un réglage, elle n'en est pas un, et
     * personne ne saurait qu'il faut passer par une migration pour la changer.
     *
     * On part des appels de lecture générique, seule forme qui nomme la clé en
     * clair côté produit.
     */
    const connues = new Set(PARAMETRES.map((p) => p.cle));
    const citees = new Set<string>();
    for (const contenu of code.values()) {
      for (const m of contenu.matchAll(/lireParametreEntier\(\s*["'`]([a-z_]+)["'`]/g)) {
        if (m[1] !== undefined) citees.add(m[1]);
      }
      for (const m of contenu.matchAll(/lire_parametre_entier[\s\S]{0,80}?["'`]([a-z_]+)["'`]/g)) {
        if (m[1] !== undefined) citees.add(m[1]);
      }
    }

    const inconnues = [...citees].filter((c) => !connues.has(c));
    expect(
      inconnues,
      "Clés lues par le produit mais absentes de l'inventaire modifiable : " +
        "elles ont l'air d'un réglage sans en être un.",
    ).toEqual([]);
  });
});
