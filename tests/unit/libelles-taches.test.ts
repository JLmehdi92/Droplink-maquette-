import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TACHES_ATTENDUES } from "@/lib/veille/taches";

/**
 * CHAQUE TÂCHE PLANIFIÉE A UN LIBELLÉ, DANS LES DEUX LANGUES.
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026. `TACHES_ATTENDUES` en compte DEUX —
 * `cadence-suivi` et `veille-mutuelle` — et les catalogues n'en libellaient
 * qu'une. L'écran de surveillance retombe alors sur la chaîne brute :
 *
 *   Interrogation des transporteurs
 *   veille-mutuelle                  ← l'identifiant technique, à l'écran
 *
 * C'est une violation directe de « aucune chaîne visible en dur — tout par
 * next-intl, FR et EN », sur l'écran qui surveille précisément la tâche pour
 * laquelle L-022 a été établie par exécution.
 *
 * ⚠️ ET AUCUN GARDE NE POUVAIT LE VOIR. `chaines-mortes` déclare
 * `admin.surveillance.tache.` comme préfixe DYNAMIQUE et échoue dans les deux
 * sens — clé morte, et préfixe qui ne couvre plus rien. Mais il ne peut pas
 * échouer sur une clé MANQUANTE : le préfixe couvrait une entrée, donc il était
 * vivant. C'est L-018 : constater qu'une déclaration existe ne prouve jamais que
 * la déclaration absente bloque.
 *
 * ⚠️ ET IL NE SE SERAIT VU QU'AU PREMIER DÉPLOIEMENT. `scheduler_heartbeat` est
 * vide : aucune tâche n'a jamais battu, les deux lignes tombent sur l'état
 * « jamais exécutée », et personne n'a encore vu l'écran peuplé.
 *
 * CE GARDE INVENTORIE, IL NE SÉLECTIONNE PAS : il part de la liste des tâches
 * que le produit ATTEND, pas de celles que quelqu'un a pensé à libeller.
 */
const CATALOGUES = ["fr", "en"] as const;

function libellesDeTaches(langue: string): Record<string, string> {
  const brut = readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8");
  const catalogue = JSON.parse(brut) as {
    admin: { surveillance: { tache: Record<string, string> } };
  };
  return catalogue.admin.surveillance.tache;
}

describe("Les tâches planifiées portent toutes un libellé", () => {
  test("la liste des tâches attendues n'est pas vide", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : si `TACHES_ATTENDUES` était vidée, tout ce
    // qui suit passerait sans rien prouver — et c'est exactement l'état dans
    // lequel le veilleur cesserait de veiller.
    expect(TACHES_ATTENDUES.length).toBeGreaterThanOrEqual(2);
  });

  test.each(CATALOGUES)("%s : chaque tâche attendue a son libellé", (langue) => {
    const libelles = libellesDeTaches(langue);
    const sansLibelle = TACHES_ATTENDUES.filter((t) => libelles[t] === undefined);
    expect(
      sansLibelle,
      `Tâches sans libellé en ${langue} : ${sansLibelle.join(", ")}. L'écran de ` +
        "surveillance affichera leur identifiant technique en clair.",
    ).toEqual([]);
  });

  test.each(CATALOGUES)("%s : aucun libellé ne désigne une tâche disparue", (langue) => {
    // L'AUTRE SENS. Un libellé pour une tâche qui n'existe plus ne casse rien —
    // et c'est précisément pour ça qu'il survit, jusqu'à ce que quelqu'un le
    // lise et croie que la tâche tourne encore.
    const inconnues = Object.keys(libellesDeTaches(langue)).filter(
      (c) => !TACHES_ATTENDUES.includes(c),
    );
    expect(inconnues, `Libellés sans tâche en ${langue} : ${inconnues.join(", ")}`).toEqual([]);
  });

  test("les deux catalogues libellent exactement les mêmes tâches", () => {
    expect(Object.keys(libellesDeTaches("fr")).sort()).toEqual(
      Object.keys(libellesDeTaches("en")).sort(),
    );
  });
});
