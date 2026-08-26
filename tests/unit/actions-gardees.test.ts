import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sansCommentaires } from "../aide/source";

/**
 * CHAQUE EXPORT D'UN MODULE `"use server"` EST UN POINT D'ENTRÉE PUBLIC.
 *
 * Next sérialise chaque export d'un tel module en une référence appelable
 * depuis le navigateur. Il n'existe aucune notion d'export « interne » : une
 * fonction qu'aucun composant n'appelle est tout aussi atteignable qu'un
 * gestionnaire de formulaire, et le seul contrôle qui la protège est celui
 * qu'elle exécute elle-même.
 *
 * CE QUE CE CONTRÔLE RÉPARE. Les actions du produit portent toutes leur garde —
 * relevées une par une à l'audit. Mais RIEN NE L'EXIGEAIT : la vingt-septième,
 * écrite un jour de hâte sans `lireProfilVendeur()`, passait toutes les portes
 * de qualité en vert. Une protection qui tient à ce que personne n'ait encore
 * oublié n'est pas une protection (L-029) — la phrase juste était « ce serait
 * ouvert si quelqu'un ajoutait une action », et c'est exactement le signe.
 *
 * ⚠️ LE MOTIF S'APPLIQUE AU CODE, COMMENTAIRES RETIRÉS (L-031). Cinq fichiers
 * du dépôt contiennent `"use server"` UNIQUEMENT dans un commentaire — ils
 * expliquent précisément pourquoi ils n'en sont pas. Les compter gonflerait
 * l'inventaire de modules sans action, et le vert obtenu sur eux se lirait
 * comme une couverture.
 */

const SRC = join(process.cwd(), "src");

/** Les gardes qui établissent une identité vérifiée EN BASE. */
const GARDES = ["lireProfilVendeur", "exigerAdmin"] as const;

/**
 * Les actions qui n'ont, par construction, aucune identité à vérifier.
 *
 * La raison est obligatoire, et la seconde moitié du test exige de ces
 * actions-là une protection d'une AUTRE nature : sans elle, cette liste
 * deviendrait l'endroit où l'on range ce qu'on ne veut pas garder.
 */
const SANS_IDENTITE_ADMISES: ReadonlyMap<string, string> = new Map([
  [
    "envoyerLienConnexion",
    "La porte d'entrée elle-même : elle s'adresse à qui n'a pas encore de " +
      "session, et c'est tout son objet. Sa protection est un QUOTA, pas une " +
      "identité — et ce quota est consommé AVANT l'appel à Supabase, parce " +
      "qu'une demande crée `auth.users`, `profiles` ET `shops` immédiatement.",
  ],
  [
    "partirVersGoogle",
    "Même porte, autre fournisseur. Le quota est celui du lien magique et non " +
      "un second : deux compteurs distincts offriraient un budget doublé à qui " +
      "alterne les deux chemins.",
  ],
]);

/** Ce que doit porter une action dispensée d'identité. */
const PROTECTION_DE_REMPLACEMENT = /verifierQuota\w*\s*\(/;

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".ts") || chemin.endsWith(".tsx")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

type Fonction = {
  readonly nom: string;
  readonly exportee: boolean;
  readonly corps: string;
};

/**
 * Découpe un module en fonctions.
 *
 * On segmente aux DÉCLARATIONS plutôt que de compter les accolades : un type de
 * retour comme `Promise<{ statut: "ok" }>` contient une paire d'accolades qui
 * se referme avant le corps, et un décompte naïf s'arrêterait là — en rendant
 * un corps VIDE, donc une fonction sans garde apparente. Un faux positif est
 * ici plus coûteux qu'une segmentation grossière : il ferait désactiver la
 * sonde.
 */
function fonctions(code: string): readonly Fonction[] {
  const declaration = /^(export\s+)?(?:async\s+)?function\s+(\w+)/gm;
  const reperes = [...code.matchAll(declaration)];
  return reperes.map((repere, i) => ({
    nom: repere[2] ?? "",
    exportee: repere[1] !== undefined,
    corps: code.slice(repere.index, reperes[i + 1]?.index ?? code.length),
  }));
}

/**
 * La fonction atteint-elle une garde, directement ou par un intermédiaire local ?
 *
 * L'indirection compte : `actions-medias.ts` fait passer ses six actions par un
 * `contexte()` local qui appelle `lireProfilVendeur()` et rend `null` sur un
 * compte suspendu. Exiger l'appel LITTÉRAL dans chaque action refuserait ce
 * module — qui est pourtant le mieux fait des sept — et pousserait à recopier
 * la garde six fois, ce qui est exactement la duplication qui produit les
 * divergences.
 */
function atteintUneGarde(f: Fonction, locales: ReadonlyMap<string, Fonction>, vus = 0): boolean {
  if (GARDES.some((g) => new RegExp(`\\b${g}\\s*\\(`).test(f.corps))) return true;
  if (vus >= 3) return false;
  for (const [nom, locale] of locales) {
    if (nom === f.nom) continue;
    if (!new RegExp(`\\b${nom}\\s*\\(`).test(f.corps)) continue;
    if (atteintUneGarde(locale, locales, vus + 1)) return true;
  }
  return false;
}

const MODULES = fichiers(SRC)
  .map((chemin) => ({ chemin, code: sansCommentaires(readFileSync(chemin, "utf8")) }))
  .filter((m) => /^\s*["']use server["']\s*;?\s*$/m.test(m.code));

describe("Inventaire des Server Actions", () => {
  test("les modules `\"use server\"` sont trouvés, commentaires retirés", () => {
    expect(
      MODULES.length,
      "Aucun module `\"use server\"` trouvé. La sonde n'inspecte rien, et un " +
        "ensemble vide passe tout.",
    ).toBeGreaterThan(0);

    // Contre-test du découpage : les fichiers qui ne citent la directive QUE
    // dans un commentaire ne doivent pas entrer dans l'inventaire. Sans lui,
    // une dépollution devenue inopérante gonflerait la couverture en silence.
    const citations = fichiers(SRC).filter((chemin) => {
      const brut = readFileSync(chemin, "utf8");
      return /use server/.test(brut) && !/^\s*["']use server["']\s*;?\s*$/m.test(sansCommentaires(brut));
    });
    expect(
      citations.length,
      "Aucun fichier ne cite `use server` en commentaire seul : le contre-test " +
        "du découpage ne discrimine plus rien, et l'inventaire pourrait être " +
        "gonflé sans que personne le voie.",
    ).toBeGreaterThan(0);
  });

  test("chaque export d'un module `\"use server\"` porte sa garde", () => {
    const exportsInventories: string[] = [];
    const defauts: string[] = [];

    for (const { chemin, code } of MODULES) {
      const toutes = fonctions(code);
      const locales = new Map(toutes.filter((f) => !f.exportee).map((f) => [f.nom, f]));
      const relatif = chemin.slice(process.cwd().length + 1);

      for (const f of toutes.filter((x) => x.exportee)) {
        exportsInventories.push(f.nom);
        if (SANS_IDENTITE_ADMISES.has(f.nom)) continue;
        if (!atteintUneGarde(f, locales)) {
          defauts.push(
            `${relatif} → ${f.nom}() : aucune garde atteignable. C'est un point ` +
              "d'entrée public sans identité vérifiée.",
          );
        }
      }
    }

    expect(
      exportsInventories.length,
      "Aucun export trouvé dans les modules `\"use server\"` : le découpage " +
        "en fonctions ne rend rien, et le vert de cette sonde serait vide.",
    ).toBeGreaterThan(10);

    expect(defauts, defauts.join("\n")).toEqual([]);

    // Second sens : une dispense qui ne désigne plus rien doit faire échouer.
    const perimees = [...SANS_IDENTITE_ADMISES.keys()].filter(
      (nom) => !exportsInventories.includes(nom),
    );
    expect(
      perimees,
      `Dispenses accordées à des actions qui n'existent plus : ${perimees.join(", ")}. ` +
        "Une dispense périmée couvre le jour où le nom revient sur une autre action.",
    ).toEqual([]);
  });

  test("les actions dispensées d'identité portent un quota à la place", () => {
    /*
     * SANS CE SECOND TEST, LA LISTE DE DISPENSES SERAIT UNE PORTE.
     *
     * Y inscrire un nom suffirait à faire passer une action nue. On exige donc
     * de chaque dispensée une protection d'une autre nature — la limitation de
     * débit — et l'on vérifie qu'elle est bien là, dans le code, commentaires
     * retirés.
     */
    for (const [nom, raison] of SANS_IDENTITE_ADMISES) {
      expect(raison.length, `La dispense de ${nom}() n'explique rien`).toBeGreaterThan(80);

      const porteuse = MODULES.flatMap(({ code }) => fonctions(code)).find((f) => f.nom === nom);
      expect(porteuse, `${nom}() est dispensée mais n'existe plus`).toBeDefined();
      expect(
        porteuse === undefined ? "" : porteuse.corps,
        `${nom}() est dispensée d'identité SANS porter de quota : elle n'est ` +
          "plus protégée par rien.",
      ).toMatch(PROTECTION_DE_REMPLACEMENT);
    }
  });
});
