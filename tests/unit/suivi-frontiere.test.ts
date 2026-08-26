import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { sansCommentaires } from "../aide/source";

/**
 * LA FRONTIÈRE DU FOURNISSEUR DE SUIVI.
 *
 * « Un port, pas une API » : UN SEUL fichier de l'application doit connaître
 * 17TRACK. Ce n'est pas une préférence d'architecture — c'est ce qui rend la
 * normalisation éprouvable sans réseau, et donc ce qui fait que le suivi est
 * testé plutôt qu'espéré.
 *
 * Une frontière qui tient à la discipline de qui relit ne tient pas. Cette sonde
 * INVENTORIE tout `src/` et échoue DANS LES DEUX SENS : un fichier de trop qui
 * nomme le fournisseur, ET une exception déclarée pour un fichier qui ne le
 * nomme plus.
 */

const RACINE = path.join(process.cwd(), "src");

/**
 * Le vocabulaire du fournisseur. Cherché par VALEUR dans le texte des fichiers.
 *
 * `17track` couvre le nom, l'adresse de leur API et le nom de leur en-tête
 * d'authentification (`17token` est listé à part, il ne contient pas « track »).
 * Chercher `dixSeptTrack` serait inutile : l'identifiant est écrit en toutes
 * lettres PRÉCISÉMENT pour qu'il puisse traverser la frontière sans la trouer.
 */
const VOCABULAIRE = ["17track", "17token", "api.17track.net"];

/**
 * Les fichiers autorisés à le connaître, AVEC LEUR RAISON.
 *
 * Toute entrée ici est une dérogation : elle doit dire pourquoi, et elle doit
 * cesser d'exister le jour où le fichier n'en a plus besoin.
 */
const DEROGATIONS = new Map<string, string>([
  [
    "lib/tracking/provider/dix-sept-track.ts",
    "L'ADAPTATEUR. C'est le seul endroit qui a le droit de connaître l'adresse, " +
      "les noms d'en-têtes, la forme de la réponse et le schéma de signature.",
  ],
]);

/**
 * Le texte d'un fichier, COMMENTAIRES RETIRÉS.
 *
 * Un motif de garde qui cherche un mot doit s'appliquer au CODE : sinon il se
 * satisfait du commentaire qui décrit la règle. Ici l'inverse — il ÉCHOUERAIT
 * sur le commentaire qui explique la frontière, ce qui obligerait à ne plus
 * pouvoir nommer le fournisseur nulle part, pas même pour dire qu'on ne veut pas
 * le nommer. Ce qui compte est qu'aucune ADRESSE, aucun EN-TÊTE, aucun IDENTIFIANT
 * de fournisseur ne vive hors de l'adaptateur.
 */
function codeSeul(chemin: string): string {
  // ⚠️ LA DÉPOLLUTION LOCALE COUPAIT À LA PREMIÈRE DOUBLE BARRE, où qu'elle
  // soit. `const BASE = "https://api.17track.net/..."` devenait `const BASE =
  // "https:` — le nom de domaine du fournisseur était donc INTROUVABLE dans le
  // dépôt dépollué, et cette suite était aveugle au seul cas qu'elle existe
  // pour attraper. Voir `depollution.test.ts`.
  return sansCommentaires(readFileSync(chemin, "utf8")).toLowerCase();
}

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const complet = path.join(dossier, entree);
    if (statSync(complet).isDirectory()) {
      trouves.push(...fichiers(complet));
      continue;
    }
    if (/\.(ts|tsx|mjs|js)$/.test(entree)) trouves.push(complet);
  }
  return trouves;
}

describe("Un port, pas une API", () => {
  const tous = fichiers(RACINE);

  test("la sonde inspecte réellement le code — un ensemble vide passe tout", () => {
    expect(tous.length, "aucun fichier inspecté").toBeGreaterThan(40);
  });

  test("aucun fichier hors de l'adaptateur ne nomme le fournisseur", () => {
    const fautifs: string[] = [];

    for (const fichier of tous) {
      const relatif = path.relative(RACINE, fichier).split(path.sep).join("/");
      const contenu = codeSeul(fichier);
      const nomme = VOCABULAIRE.some((mot) => contenu.includes(mot));

      if (nomme && !DEROGATIONS.has(relatif)) fautifs.push(relatif);
    }

    expect(
      fautifs,
      "Ces fichiers connaissent le fournisseur de suivi : " + fautifs.join(", "),
    ).toEqual([]);
  });

  test("aucune dérogation n'est périmée", () => {
    // L'autre sens. Une exception posée pour une raison disparue survit
    // indéfiniment et couvre le jour où le problème revient.
    const perimees: string[] = [];

    for (const relatif of DEROGATIONS.keys()) {
      const complet = path.join(RACINE, relatif);
      const contenu = codeSeul(complet);
      if (!VOCABULAIRE.some((mot) => contenu.includes(mot))) perimees.push(relatif);
    }

    expect(perimees, "Dérogations devenues inutiles : " + perimees.join(", ")).toEqual([]);
  });

  test("le PORT lui-même est vierge de tout vocabulaire de fournisseur", () => {
    // Le fichier qui définit la frontière est le premier où elle peut fuiter,
    // et le dernier où on penserait à regarder.
    const port = codeSeul(path.join(RACINE, "lib/tracking/provider/port.ts"));
    for (const mot of VOCABULAIRE) {
      expect(port.includes(mot), `le port nomme « ${mot} »`).toBe(false);
    }
  });

  test("les quatre modules décidables ne parlent à personne", () => {
    // Ni réseau, ni base, ni horloge : c'est ce qui les rend éprouvables. Un
    // `fetch` ou un `new Date()` sans argument glissé ici et la logique du suivi
    // redeviendrait invérifiable sans attendre un vrai colis.
    for (const nom of ["normalize", "checkpoints", "silence", "schedule"]) {
      const contenu = readFileSync(path.join(RACINE, "lib/tracking", nom + ".ts"), "utf8");
      // Le motif s'applique au CODE, commentaires retirés : sinon il se
      // satisferait du commentaire qui décrit la règle.
      const code = sansCommentaires(contenu);

      expect(code, `${nom}.ts appelle fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(code, `${nom}.ts lit l'horloge`).not.toMatch(/Date\.now\s*\(|new Date\s*\(\s*\)/);
      expect(code, `${nom}.ts touche la base`).not.toMatch(/supabase|createClient/i);
    }
  });
});
