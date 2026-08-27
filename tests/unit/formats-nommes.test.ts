import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FORMATS } from "@/i18n/request";

/**
 * UN FORMAT NOMMÉ QUI N'EXISTE PAS NE LÈVE PAS — IL REND LA DATE BRUTE.
 *
 * ⚠️ DÉFAUT TROUVÉ EN PILOTANT LE PRODUIT LE 27/08/2026. Sur l'écran des
 * paramètres d'administration, en `lang="fr"` :
 *
 *     « Modifié le Thu Aug 27 2026 17:26:26 GMT+0200 »
 *
 * `format.dateTime(date, "long")` référence un format GLOBAL. Aucun n'était
 * déclaré ; next-intl retombe alors sur `String(date)`, en anglais, avec le
 * décalage horaire. Aucune erreur, aucun avertissement, aucune trace.
 *
 * LE PIÈGE EST DANS LA RESSEMBLANCE DES DEUX ÉCRITURES :
 *
 *     format.dateTime(d, { dateStyle: "long" })   ← un objet, il ne peut pas manquer
 *     format.dateTime(d, "long")                  ← un NOM, qui doit être déclaré
 *
 * Onze appels du produit emploient la première forme et fonctionnent ; deux
 * employaient la seconde. Une relecture ne distingue pas ces deux lignes.
 *
 * CE QUE CETTE SONDE PROUVE, ET CE QU'ELLE NE PROUVE PAS — il faut le dire.
 * Elle inventorie les appels dans le CODE et vérifie que chaque nom employé est
 * déclaré. Elle ne rend pas les écrans : elle n'attraperait donc pas une date
 * brute produite autrement, par un `.toString()` par exemple. Aucune suite ne
 * rend aujourd'hui un écran authentifié par HTTP, et cet écran-là en est un.
 * Le contrôle porte sur le mécanisme exact du défaut, pas sur toute sa famille.
 */

const RACINE = join(process.cwd(), "src");

function fichiersSource(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersSource(chemin));
    } else if (/\.tsx?$/.test(entree)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Retire commentaires de bloc et de ligne : un exemple commenté n'est pas un appel. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export interface AppelDateTime {
  readonly nomme: string | null;
}

/**
 * Relève les appels à `.dateTime(` et la FORME de leur second argument.
 *
 * On compte les parenthèses plutôt que d'écrire une expression régulière : le
 * premier argument contient couramment des appels (`new Date(x ?? 0)`), et un
 * motif qui s'arrête à la première virgule lirait le mauvais argument — donc
 * conclurait « aucun format nommé » sur le fichier même qui portait le défaut.
 */
export function relever(source: string): AppelDateTime[] {
  const propre = sansCommentaires(source);
  const appels: AppelDateTime[] = [];
  const marqueur = ".dateTime(";

  let depuis = 0;
  for (;;) {
    const debut = propre.indexOf(marqueur, depuis);
    if (debut === -1) break;

    let i = debut + marqueur.length;
    let profondeur = 0;
    let virgule = -1;

    for (; i < propre.length; i += 1) {
      const c = propre[i];
      if (c === "(" || c === "[" || c === "{") profondeur += 1;
      else if (c === ")" && profondeur === 0) break;
      else if (c === ")" || c === "]" || c === "}") profondeur -= 1;
      else if (c === "," && profondeur === 0) {
        virgule = i;
        break;
      }
    }

    if (virgule !== -1) {
      const suite = propre.slice(virgule + 1).replace(/^\s+/, "");
      const nom = /^"([^"]+)"|^'([^']+)'/.exec(suite);
      appels.push({ nomme: nom === null ? null : (nom[1] ?? nom[2] ?? null) });
    } else {
      appels.push({ nomme: null });
    }

    depuis = debut + marqueur.length;
  }

  return appels;
}

const APPELS = fichiersSource(RACINE).flatMap((f) => relever(readFileSync(f, "utf8")));
const NOMS_EMPLOYES = new Set(APPELS.filter((a) => a.nomme !== null).map((a) => a.nomme as string));
const NOMS_DECLARES = new Set(Object.keys(FORMATS.dateTime));

describe("La sonde elle-même", () => {
  /**
   * UN ENSEMBLE VIDE PASSE TOUT. Sans ces bornes, un chemin de source erroné ou
   * un marqueur mal orthographié rendrait cette suite verte et muette — et
   * c'est exactement le défaut qu'elle est censée empêcher.
   */
  test("elle a réellement trouvé des appels, des deux formes", () => {
    expect(APPELS.length, "aucun appel relevé : la sonde n'inspecte rien").toBeGreaterThan(5);
    expect(
      APPELS.some((a) => a.nomme === null),
      "aucun appel à options : le relevé lit le mauvais argument",
    ).toBe(true);
  });

  test("contre-test : elle reconnaît un format nommé ET ne confond pas un objet", () => {
    // Le premier argument porte des parenthèses, comme dans le code réel : c'est
    // précisément là qu'un motif naïf se trompait d'argument.
    expect(relever('format.dateTime(new Date(x ?? 0), "inexistant")')).toEqual([
      { nomme: "inexistant" },
    ]);
    expect(relever('format.dateTime(new Date(x ?? 0), { dateStyle: "long" })')).toEqual([
      { nomme: null },
    ]);
    expect(relever('/* format.dateTime(d, "commente") */')).toEqual([]);
  });
});

describe("Les formats nommés", () => {
  test("chaque nom employé est déclaré", () => {
    const manquants = [...NOMS_EMPLOYES].filter((n) => !NOMS_DECLARES.has(n));
    expect(
      manquants,
      `ces formats sont référencés mais non déclarés : la date sortira en anglais brut — ${manquants.join(", ")}`,
    ).toEqual([]);
  });

  test("et chaque nom déclaré est employé", () => {
    // L'autre sens. Un format déclaré que personne n'emploie est une
    // configuration morte : elle se périme sans que rien ne la contredise, puis
    // sert de modèle à qui la recopie.
    const inutilises = [...NOMS_DECLARES].filter((n) => !NOMS_EMPLOYES.has(n));
    expect(inutilises, `formats déclarés et jamais employés : ${inutilises.join(", ")}`).toEqual([]);
  });
});
