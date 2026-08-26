import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { LANGUES, LANGUE_DEFAUT, estLangueSupportee } from "@/i18n/config";

/**
 * Parité des catalogues de traduction.
 *
 * Aucune chaîne visible n'est écrite en dur : tout passe par les catalogues. Ce
 * qui déplace le risque plutôt que de le supprimer — une clé ajoutée en français
 * et oubliée en anglais ne casse rien, ne lève rien, et se manifeste chez
 * l'utilisateur anglophone sous la forme d'un identifiant technique affiché à la
 * place d'une phrase.
 *
 * La garde INVENTORIE : elle compare les deux arbres entiers dans les DEUX SENS,
 * plutôt que de vérifier les clés auxquelles son auteur a pensé.
 */

const RACINE_MESSAGES = join(process.cwd(), "messages");

type Arbre = { [cle: string]: string | Arbre };

function chargerCatalogue(langue: string): Arbre {
  const brut = readFileSync(join(RACINE_MESSAGES, `${langue}.json`), "utf8");
  return JSON.parse(brut) as Arbre;
}

/** Aplatit l'arbre en chemins pointés, pour comparer des ensembles comparables. */
function aplatir(arbre: Arbre, prefixe = ""): Map<string, string> {
  const plat = new Map<string, string>();
  for (const [cle, valeur] of Object.entries(arbre)) {
    const chemin = prefixe === "" ? cle : `${prefixe}.${cle}`;
    if (typeof valeur === "string") plat.set(chemin, valeur);
    else for (const [c, v] of aplatir(valeur, chemin)) plat.set(c, v);
  }
  return plat;
}

describe("Configuration des langues", () => {
  test("la langue par défaut fait partie des langues supportées", () => {
    expect(LANGUES).toContain(LANGUE_DEFAUT);
  });

  test("estLangueSupportee accepte les langues connues et rejette les autres", () => {
    for (const l of LANGUES) expect(estLangueSupportee(l)).toBe(true);
    // Contre-test : sans lui, une implémentation qui rend toujours `true`
    // passerait la moitié de ce fichier.
    for (const invalide of ["de", "FR", "fr-FR", "", "es"]) {
      expect(estLangueSupportee(invalide), `« ${invalide} » aurait dû être rejeté`).toBe(false);
    }
  });
});

describe("Parité des catalogues", () => {
  test("chaque langue déclarée possède son catalogue", () => {
    for (const langue of LANGUES) {
      expect(() => chargerCatalogue(langue), `catalogue ${langue}.json illisible`).not.toThrow();
    }
  });

  test("la sonde inspecte réellement des clés", () => {
    // Deux catalogues vides seraient parfaitement « à parité ». Un ensemble vide
    // passe tout.
    const reference = aplatir(chargerCatalogue(LANGUE_DEFAUT));
    expect(
      reference.size,
      "catalogue de référence vide : la parité ne prouverait rien",
    ).toBeGreaterThan(0);
  });

  test("aucune clé ne manque, dans aucun sens", () => {
    const reference = aplatir(chargerCatalogue(LANGUE_DEFAUT));

    for (const langue of LANGUES) {
      if (langue === LANGUE_DEFAUT) continue;
      const autre = aplatir(chargerCatalogue(langue));

      const manquantes = [...reference.keys()].filter((c) => !autre.has(c));
      expect(
        manquantes,
        `Clés présentes en ${LANGUE_DEFAUT} et absentes en ${langue} : ${manquantes.join(", ")}`,
      ).toEqual([]);

      // Le second sens compte autant : une clé orpheline signale soit un oubli
      // de suppression, soit une clé ajoutée du mauvais côté.
      const orphelines = [...autre.keys()].filter((c) => !reference.has(c));
      expect(
        orphelines,
        `Clés présentes en ${langue} et absentes en ${LANGUE_DEFAUT} : ${orphelines.join(", ")}`,
      ).toEqual([]);
    }
  });

  test("aucune valeur vide ni laissée à traduire", () => {
    // Une chaîne vide franchit un contrôle de présence de clé sans rien
    // afficher : la clé existe, la parité passe, et l'écran est nu.
    const defauts: string[] = [];
    for (const langue of LANGUES) {
      for (const [cle, valeur] of aplatir(chargerCatalogue(langue))) {
        if (valeur.trim() === "") defauts.push(`${langue}:${cle} est vide`);
        if (/^(TODO|TBD|À TRADUIRE|A TRADUIRE)/i.test(valeur.trim())) {
          defauts.push(`${langue}:${cle} est un marqueur, pas une traduction`);
        }
      }
    }
    expect(defauts, defauts.join(" | ")).toEqual([]);
  });

  test("les deux catalogues portent bien des textes DIFFÉRENTS", () => {
    // Contre-test positif : un `cp fr.json en.json` produirait une parité
    // parfaite et un anglais entièrement français. La parité seule ne dit rien
    // de la traduction.
    const fr = aplatir(chargerCatalogue("fr"));
    const en = aplatir(chargerCatalogue("en"));
    const identiques = [...fr.entries()].filter(([c, v]) => en.get(c) === v);
    const proportion = identiques.length / fr.size;
    expect(
      proportion,
      `${identiques.length}/${fr.size} valeurs identiques entre fr et en : ` +
        `${identiques.map(([c]) => c).join(", ")}. Le catalogue anglais a-t-il ` +
        "été copié depuis le français ?",
    ).toBeLessThan(0.3);
  });
});

describe("Aucune clé ne contient de point", () => {
  /*
   * NEXT-INTL TRAITE LE POINT COMME UN SÉPARATEUR DE NIVEAU, et REFUSE qu'une
   * clé en porte un. Deux libellés du journal d'administration s'appelaient
   * `comptes.liste` et `comptes.detail` — les valeurs réelles des actions
   * auditées, recopiées telles quelles.
   *
   * CE QUE ÇA CASSAIT, ET JUSQU'OÙ. `INVALID_KEY` est levé au CHARGEMENT du
   * catalogue, donc sur toute page appelant `getTranslations` — la landing
   * comprise. En développement, deux clés d'un écran d'administration
   * cassaient le produit entier. Trouvé en lançant simplement `pnpm dev`.
   *
   * ET LES LIBELLÉS ÉTAIENT MORTS DE TOUTE FAÇON : `t("journal.actions.
   * comptes.liste")` cherche une clé imbriquée qui n'existe pas, donc l'écran
   * affichait l'identifiant technique brut à l'administrateur.
   *
   * POURQUOI LA PARITÉ NE L'A PAS VU, et c'est le plus instructif : elle
   * inventorie bien les deux arbres, mais elle les APLATIT en chemins pointés.
   * `admin.journal.actions.comptes.liste` s'écrit pareil qu'il vienne d'une clé
   * fautive ou de deux niveaux légitimes — l'aplatissement effaçait exactement
   * la distinction qui comptait. Une garde peut inventorier correctement et
   * rester aveugle par sa REPRÉSENTATION.
   */
  function clesAvecPoint(arbre: Arbre, prefixe = ""): string[] {
    const fautives: string[] = [];
    for (const [cle, valeur] of Object.entries(arbre)) {
      const chemin = prefixe === "" ? cle : `${prefixe}.${cle}`;
      if (cle.includes(".")) fautives.push(chemin);
      if (typeof valeur === "object") fautives.push(...clesAvecPoint(valeur, chemin));
    }
    return fautives;
  }

  test("la sonde parcourt réellement les catalogues", () => {
    // Un ensemble vide passe tout : si le parcours cessait de descendre dans
    // l'arbre, l'absence de clé fautive ne dirait rien.
    for (const langue of LANGUES) {
      const arbre = chargerCatalogue(langue);
      expect(
        Object.keys(arbre).length,
        `catalogue ${langue} vide : la sonde ne regarde rien`,
      ).toBeGreaterThan(3);
    }
  });

  test.each(LANGUES)("catalogue %s", (langue) => {
    const fautives = clesAvecPoint(chargerCatalogue(langue));
    expect(
      fautives,
      `Clés contenant un point : ${fautives.join(", ")}. next-intl lève ` +
        "INVALID_KEY au chargement du catalogue — donc sur TOUTE page qui " +
        "appelle getTranslations, pas seulement celle qui emploie la clé.",
    ).toEqual([]);
  });
});
