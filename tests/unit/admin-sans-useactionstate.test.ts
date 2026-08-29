import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LA SURFACE D'ADMINISTRATION N'EMPLOIE PAS `useActionState`.
 *
 * ⚠️ CE N'EST PAS UNE PRÉFÉRENCE DE STYLE, C'EST UN DÉFAUT MESURÉ. Le
 * 29/08/2026, deux écrans d'administration ont été pilotés dans un vrai
 * navigateur, avec une vraie session, sur le serveur de production local. Les
 * deux écrivaient correctement en base — colonne modifiée, audit inscrit, page
 * re-rendue côté serveur — et AUCUN des deux ne montrait quoi que ce soit :
 *
 *   - `admin/parametres` : le POST répond 200, son corps contient le résultat
 *     `{"statut":"ok"}` ET l'arbre rafraîchi ; l'état du composant reste
 *     `inactif` huit secondes durant, relevé toutes les 500 ms ;
 *   - `admin/comptes/[id]` : le compte passe à `suspended`, et le dialogue reste
 *     ouvert sur son bouton « Suspendre », sept secondes durant.
 *
 * Le même geste MARCHE hors de `/admin` — éprouvé sur `/fr/connexion` (403 ms)
 * et sur `/fr/marque` (416 ms), cette dernière avec `revalidatePath` comme les
 * écrans d'administration. La CAUSE n'est donc pas établie : ce qui l'est, c'est
 * que le mécanisme échoue sur cette surface-là, et qu'il échoue EN SILENCE.
 *
 * Un écran d'administration qui affirme un état que la base n'a plus est le
 * défaut le plus grave qu'il puisse porter — sur la suspension, c'est la
 * capacité qui fonde notre statut d'hébergeur. Tant que la cause n'est pas
 * trouvée, la surface s'en passe : on appelle la Server Action comme une
 * fonction et l'on affiche ce qu'elle a RELU.
 *
 * ⚠️ CETTE SONDE NE PROUVE RIEN SUR LE RESTE DU PRODUIT. `useActionState` reste
 * employé sur `connexion`, `bienvenue` et `marque`, où il a été VU fonctionner.
 * La restreindre à `/admin` est délibéré : une interdiction générale reposerait
 * sur une extrapolation, pas sur une mesure.
 */

const RACINES = [
  join("src", "components", "admin"),
  join("src", "app", "[locale]", "admin"),
];

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin));
    else if (/\.tsx?$/.test(entree)) trouves.push(chemin);
  }
  return trouves;
}

/** Le CODE, commentaires retirés : un motif appliqué au fichier brut se
 *  satisferait de la prose qui explique justement pourquoi on ne l'emploie pas. */
function code(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const TOUS = RACINES.flatMap(fichiers);

describe("La surface d'administration n'emploie pas `useActionState`", () => {
  test("la sonde inspecte réellement des fichiers", () => {
    // Un ensemble vide passe tout. Sans cette assertion, un renommage de dossier
    // rendrait la suite verte et muette.
    expect(TOUS.length, "aucun fichier d'administration trouvé").toBeGreaterThan(10);
    expect(
      TOUS.filter((f) => f.endsWith("dialogue-suspension.tsx")).length,
      "le dialogue de suspension n'est pas dans le champ de la sonde",
    ).toBe(1);
  });

  test("contre-test : la sonde SAIT reconnaître l'appel qu'elle cherche", () => {
    // Sans lui, une expression rationnelle devenue inopérante rendrait la sonde
    // verte pour toujours — et c'est exactement ce qu'on ne veut pas ici.
    const faux = 'const [etat, action] = useActionState(suspendre, INITIAL);';
    expect(/\buseActionState\s*\(/.test(faux)).toBe(true);
  });

  test("aucun fichier de `/admin` n'appelle `useActionState`", () => {
    const fautifs = TOUS.filter((f) => /\buseActionState\s*\(/.test(code(f)));
    expect(
      fautifs,
      "Mesuré le 29/08/2026 : sur `/admin`, `useActionState` écrit en base sans " +
        "jamais rendre son résultat au composant. L'écran affirme alors un état " +
        "que la base n'a plus. Appeler la Server Action directement et afficher " +
        "ce qu'elle a relu.",
    ).toEqual([]);
  });
});
