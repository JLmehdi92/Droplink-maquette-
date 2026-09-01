import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEGRADATION, surPanne, type Surface } from "../../src/lib/limitation/quota";

/**
 * CHAQUE SURFACE A UN PLAFOND, ET CHACUNE SAIT QUOI FAIRE QUAND IL TOMBE.
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026 : la surface d'administration
 * n'avait AUCUN compteur de débit. Le module de limitation ne contenait pas une
 * seule occurrence du mot « admin », alors que le brief exige « deux seuils
 * distincts, EN BASE, compteurs distincts entre page publique et admin » et
 * tranche explicitement le comportement en panne des deux côtés.
 *
 * CE DÉFAUT N'ÉTAIT FALSIFIABLE PAR RIEN, et c'est ce qui en fait le plus
 * instructif du lot : il n'y avait rien à casser pour le révéler. On ne
 * falsifie pas une absence. La seule chose qui l'aurait attrapé est une sonde
 * d'INVENTAIRE — qui part de la liste des surfaces à protéger et vérifie que
 * chacune l'est — et non une sonde par compteur, qui ne peut voir que les
 * compteurs qui existent déjà.
 *
 * DEUX PROPRIÉTÉS SONT ÉPROUVÉES ICI :
 *
 *   1. l'inventaire est complet — aucune surface sans plafond ni décision ;
 *   2. la décision de dégradation est celle du brief, surface par surface.
 *
 * La seconde n'était vérifiable nulle part avant, parce que la règle vivait
 * dispersée dans six fonctions sous six formulations. Elle est maintenant une
 * TABLE, exhaustive par le type : ajouter une surface sans décider de son
 * comportement en panne ne compile pas.
 */

const SOURCE = readFileSync(join(process.cwd(), "src", "lib", "limitation", "quota.ts"), "utf8");

/**
 * Les surfaces déclarées par le TYPE, relues dans la source.
 *
 * On les relit plutôt que de les recopier : une liste écrite à la main dans le
 * test aurait divergé du type à la première surface ajoutée — et le contrôle
 * serait resté vert en ne regardant plus la nouvelle.
 */
function surfacesDuType(): readonly string[] {
  const debut = SOURCE.indexOf("export type Surface =");
  const fin = SOURCE.indexOf(";", debut);
  const bloc = SOURCE.slice(debut, fin);
  return [...bloc.matchAll(/\|\s*"([a-z-]+)"/g)].map((m) => m[1] as string);
}

/**
 * Ce que le brief décide, recopié ici EXPRÈS.
 *
 * C'est le seul endroit du dépôt où la duplication est voulue : si le test
 * lisait la même table que le produit, il ne prouverait que sa propre
 * cohérence. Ici, deux sources indépendantes doivent s'accorder — et un
 * changement de la table du produit fait échouer ce test, ce qui force à
 * relire la décision plutôt qu'à la subir.
 */
const DECISION_DU_BRIEF: Readonly<Record<string, "autorise" | "refuse">> = {
  // « refuser côté public pénaliserait les clients d'un vendeur pour un
  // incident qui ne les concerne pas »
  "publique-requetes": "autorise",
  "publique-inconnu": "autorise",
  // « côté admin, ça ne pénalise que nous »
  admin: "refuse",
  // L'écriture publique est rejouable, et une écriture sans plafond laisse une
  // adresse remplir le journal de n'importe quelle commande dont elle a le lien.
  "publique-ecriture": "refuse",
  // L'authentification est la porte du produit : l'ouvrir en grand pendant un
  // incident de base est exactement ce qu'un attaquant attend.
  "auth-ip": "refuse",
  "auth-email": "refuse",
  // La vérification d'un mot de passe dégrade comme le reste de la porte : un
  // compteur en panne ne doit pas rendre le bourrage d'identifiants gratuit,
  // c'est-à-dire précisément le jour où l'on est le moins capable de le voir.
  "auth-mdp-ip": "refuse",
  "auth-mdp-couple": "refuse",
  "auth-mdp-email": "refuse",
  // Un point d'ingestion machine sans plafond nous fait calculer des signatures
  // à l'infini.
  "suivi-notification": "refuse",
};

describe("l'inventaire des surfaces à plafond est complet", () => {
  const surfaces = surfacesDuType();

  // UN ENSEMBLE VIDE PASSE TOUT. Sans cette borne, un changement de forme du
  // type rendrait la liste vide et TOUTES les vérifications ci-dessous
  // passeraient en ne regardant rien.
  test("la sonde lit réellement les surfaces du type", () => {
    expect(surfaces.length, "aucune surface lue : la sonde vise à côté").toBeGreaterThanOrEqual(7);
    expect(surfaces, "la surface d'administration a disparu du type").toContain("admin");
  });

  test("chaque surface du type a une décision de dégradation", () => {
    const sans = surfaces.filter((s) => !(s in DEGRADATION));
    expect(
      sans,
      "Surfaces sans comportement décidé en cas de panne du compteur : le " +
        "produit ferait un choix par accident, dans un `if` écrit à la hâte.",
    ).toEqual([]);
  });

  // L'AUTRE SENS : une décision qui ne correspond plus à aucune surface.
  test("aucune décision ne survit à la surface qu'elle décrivait", () => {
    const orphelines = Object.keys(DEGRADATION).filter((s) => !surfaces.includes(s));
    expect(orphelines, "Décisions de dégradation devenues sans objet").toEqual([]);
  });

  test("chaque surface a un seuil, et le seuil est atteignable", () => {
    // Le `switch` de `seuil()` est exhaustif par le type — un cas manquant ne
    // compile pas. Ce qu'on vérifie ici est autre chose : que chaque surface
    // est bien NOMMÉE dans ce `switch`, donc qu'aucune ne retombe sur un cas
    // voisin par copier-coller.
    for (const surface of surfaces) {
      expect(SOURCE, `la surface « ${surface} » n'a pas son propre cas de seuil`).toContain(
        `case "${surface}":`,
      );
    }
  });
});

describe("la dégradation est celle que le brief a tranchée", () => {
  test.each(Object.entries(DECISION_DU_BRIEF))("« %s » → %s", (surface, attendu) => {
    expect(
      DEGRADATION[surface as Surface],
      `La surface « ${surface} » ne dégrade pas comme le brief le décide.`,
    ).toBe(attendu);
  });

  test("la panne rend le verdict correspondant", () => {
    // On éprouve la CONVERSION, pas seulement la table : une table juste et un
    // convertisseur inversé produiraient exactement le défaut qu'on veut
    // empêcher, et la table seule ne le montrerait pas.
    expect(surPanne("publique-requetes")).toEqual({ autorise: true });
    expect(surPanne("admin")).toEqual({ autorise: false, motif: "indisponible" });
  });

  // CONTRE-TEST POSITIF. Une table dont TOUTES les valeurs seraient « refuse »
  // passerait la plupart des cas ci-dessus tout en cassant la page publique
  // pour les clients de tous les vendeurs, au pire moment.
  test("les deux comportements existent réellement", () => {
    const valeurs = new Set(Object.values(DEGRADATION));
    expect(valeurs.has("autorise"), "plus aucune surface n'autorise en panne").toBe(true);
    expect(valeurs.has("refuse"), "plus aucune surface ne refuse en panne").toBe(true);
  });
});
