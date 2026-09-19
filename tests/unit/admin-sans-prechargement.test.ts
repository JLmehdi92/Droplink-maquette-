import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LA SURFACE D'ADMINISTRATION NE PRÉCHARGE RIEN.
 *
 * DÉFAUT MESURÉ LE 18/09/2026, par un parcours de bout en bout : un
 * administrateur qui ouvre un écran toutes les cinq secondes recevait une 404
 * au QUATRIÈME écran, vingt secondes après le premier. Chaque écran précharge
 * sa navigation — une quinzaine de liens —, chaque préchargement traverse la
 * garde de la mise en page, et la garde compte contre le plafond de trente
 * requêtes par minute (`verifierQuotaAdmin`). Trois écrans : 54 requêtes, dont
 * 51 préchargements.
 *
 * Exclure les préchargements du COMPTAGE aurait ouvert une porte : l'en-tête
 * qui les signale se forge, et le plafond borne justement le martèlement de
 * `/admin`. On retire donc les préchargements eux-mêmes — un administrateur
 * n'a pas besoin d'écrans devinés d'avance.
 */
const RACINES = [
  join(process.cwd(), "src", "app", "[locale]", "admin"),
  join(process.cwd(), "src", "components", "admin"),
];

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Les balises ouvrantes de lien, commentaires retirés (L-031). */
function liens(): { fichier: string; balise: string }[] {
  return RACINES.flatMap(fichiers).flatMap((f) => {
    const source = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    return [...source.matchAll(/<(Link|LienEcran|Composant)\b[\s\S]*?(?<!=)>/g)].map((m) => ({
      fichier: f.replace(process.cwd(), ""),
      balise: m[0],
    }));
  });
}

describe("La surface d'administration", () => {
  test("CONTRE-TEST : la sonde trouve bien les liens de l'administration", () => {
    // Un ensemble vide passe tout : renommer un composant ou déplacer un
    // dossier rendrait ce fichier vert en ne regardant plus rien.
    expect(liens().length).toBeGreaterThanOrEqual(20);
  });

  test("aucun lien ne précharge : chaque balise porte prefetch={false}", () => {
    const fautifs = liens()
      .filter((l) => !/\bprefetch=\{false\}/.test(l.balise))
      .map((l) => `${l.fichier} : ${l.balise.replace(/\s+/g, " ").slice(0, 80)}`);
    expect(
      fautifs,
      "Un lien admin précharge : chaque écran ouvert consommerait le plafond de la " +
        "surface, et l'administrateur finirait sur une 404 en quelques clics.",
    ).toEqual([]);
  });
});
