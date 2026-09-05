import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleDApercu } from "@/lib/medias/apercu";

/**
 * QUI DÉCIDE DE CE QU'ON MONTRE D'UN MÉDIA ?
 *
 * ⚠️ QUATRE ENDROITS, ET DEUX D'ENTRE EUX SE TROMPAIENT. Constaté le 05/09/2026
 * sur la commande d'un vrai client : cinq photos sans dérivée s'affichaient sur
 * la page publique et dans l'éditeur — corrigés le matin — mais restaient des
 * carrés gris dans la LISTE DES COMMANDES et dans les ANALYSES, qui lisaient
 * encore `cle_vignette` seule.
 *
 * Le premier correctif n'avait donc réparé que ce que j'avais REGARDÉ. C'est la
 * règle du projet appliquée à moi-même : *inventorier plutôt que sélectionner* —
 * un contrôle ne doit pas dépendre de ce que son auteur a pensé à inspecter.
 *
 * Ce fichier fait les deux : il éprouve la règle, et il vérifie que PERSONNE ne
 * la réécrit ailleurs.
 */

describe("La clé d'aperçu d'un média", () => {
  test("la vignette gagne quand elle existe", () => {
    expect(cleDApercu({ type: "photo", cle: "m.jpg", cle_vignette: "m.vignette.webp" })).toBe(
      "m.vignette.webp",
    );
  });

  test("une PHOTO sans vignette retombe sur son image pleine", () => {
    // Le cas du 05/09 : plus lourd, et infiniment préférable à rien.
    expect(cleDApercu({ type: "photo", cle: "m.jpg", cle_vignette: null })).toBe("m.jpg");
  });

  test("une VIDÉO sans aperçu ne retombe sur RIEN", () => {
    // Sa clé désigne le fichier vidéo : la donner à une balise image rendrait
    // une image cassée, donc pire que la case vide qu'on répare.
    expect(cleDApercu({ type: "video", cle: "m.mp4", cle_vignette: null })).toBeNull();
  });

  test("une vidéo AVEC aperçu le garde", () => {
    // CONTRE-TEST : sans lui, « une vidéo rend null » serait vrai d'une règle
    // qui priverait d'aperçu toutes les vidéos, y compris celles qui en ont un.
    expect(cleDApercu({ type: "video", cle: "m.mp4", cle_vignette: "m.vignette.webp" })).toBe(
      "m.vignette.webp",
    );
  });
});

/**
 * L'INVENTAIRE, ET IL ÉCHOUE DANS LES DEUX SENS.
 *
 * Tout fichier de `src/` qui LIT `cle_vignette` doit passer par `cleDApercu`,
 * sauf les exceptions déclarées ici avec leur raison. Et chaque exception doit
 * réellement contenir la lecture qu'on l'autorise à faire : une exception qui
 * ne sert plus est une permission qui traîne.
 */
const RACINE = join(process.cwd(), "src");

const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    join("lib", "medias", "apercu.ts"),
    "C'est elle qui porte la règle : elle doit lire le champ.",
  ],
  [
    join("lib", "commandes", "medias.ts"),
    "Elle ÉCRIT `cle_vignette` après avoir relu la taille réelle dans R2. " +
      "Écrire n'est pas afficher, et c'est le seul endroit qui décide de la valeur.",
  ],
  [
    join("lib", "supabase", "types-base.ts"),
    "Types générés depuis la base : le champ y figure comme partout ailleurs.",
  ],
]);

/** Tous les fichiers de `src`, CODE SEUL — commentaires retirés (L-031). */
function fichiersCode(): readonly { readonly chemin: string; readonly code: string }[] {
  const trouves: { chemin: string; code: string }[] = [];
  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, e.name);
      if (e.isDirectory()) parcourir(complet);
      else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
        const brut = readFileSync(complet, "utf8");
        // ⚠️ LES COMMENTAIRES D'ABORD. Sans ce retrait, un fichier qui EXPLIQUE
        // la règle serait accusé de la réécrire — et l'inventaire deviendrait
        // du bruit qu'on apprend à ignorer.
        const code = brut.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        trouves.push({ chemin: complet.slice(RACINE.length + 1), code });
      }
    }
  };
  parcourir(RACINE);
  return trouves;
}

describe("Personne ne réécrit la règle d'aperçu ailleurs", () => {
  const FICHIERS = fichiersCode();

  test("la sonde lit réellement le dépôt", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : si le parcours cessait de trouver des
    // fichiers, l'inventaire deviendrait vert et muet.
    expect(FICHIERS.length, "aucun fichier parcouru : la lecture est fausse").toBeGreaterThan(100);
  });

  test("tout lecteur de `cle_vignette` passe par `cleDApercu`", () => {
    /*
     * ⚠️ CE N EST PAS LA LECTURE DE LA COLONNE QUI EST INTERDITE, c est de
     * DÉCIDER seul à partir d elle. Les quatre lecteurs la sélectionnent
     * légitimement — pour la passer à `cleDApercu`. Un inventaire qui bannirait
     * la chaîne accuserait donc le produit corrigé, et on l apprendrait à
     * ignorer dès le premier passage.
     */
    const fautifs = FICHIERS.filter(
      (f) =>
        f.code.includes("cle_vignette") &&
        !f.code.includes("cleDApercu") &&
        !EXCEPTIONS.has(f.chemin),
    ).map((f) => f.chemin);

    expect(
      fautifs,
      "ces fichiers lisent `cle_vignette` sans passer par `cleDApercu` : une " +
        "photo sans dérivée y sera INVISIBLE, comme elle l'a été chez un vrai " +
        "client le 05/09/2026 — " +
        fautifs.join(", "),
    ).toEqual([]);
  });

  test("chaque exception déclarée lit encore le champ", () => {
    // L'AUTRE SENS. Une exception dont le fichier ne lit plus `cle_vignette`
    // est une permission qui survit à son motif, et qui couvrira un jour une
    // lecture qu'on n'a pas voulue.
    const inutiles: string[] = [];
    for (const [chemin] of EXCEPTIONS) {
      const f = FICHIERS.find((x) => x.chemin === chemin);
      if (f === undefined) inutiles.push(`${chemin} n'existe plus`);
      else if (!f.code.includes("cle_vignette")) inutiles.push(`${chemin} ne le lit plus`);
    }
    expect(inutiles, inutiles.join(" | ")).toEqual([]);
  });
});
