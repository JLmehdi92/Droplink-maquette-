import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LE PLANIFICATEUR VIT HORS DU DÉPÔT, ET C'EST POUR ÇA QU'IL A BESOIN D'UNE
 * GARDE ICI.
 *
 * Rien dans l'application ne se déclenche tout seul : le suivi des colis ne
 * bouge que si `/api/suivi/cadence` est appelée du dehors. Le jour où
 * quelqu'un renomme cette route, TypeScript ne dira rien — la route n'est
 * référencée par aucun code — et le `crontab` continuera d'appeler une adresse
 * qui n'existe plus. Le produit paraîtra marcher : les écrans répondront, les
 * commandes s'ouvriront, et le suivi sera figé pour tout le monde.
 *
 * ⚠️ ET UN CRON QUI ÉCHOUE NE PRÉVIENT PERSONNE. `curl` sort en erreur dans un
 * journal que personne ne lit, la route répond 404 comme elle le doit face à
 * un inconnu, et le veilleur — qui devrait le voir — est lui-même appelé par
 * ce même fichier. Une seule faute de frappe rend donc muets à la fois la
 * tâche ET son surveillant.
 *
 * CE QUE CETTE SUITE NE PEUT PAS FAIRE : vérifier ce qui est réellement
 * installé sur le VPS. Elle vérifie que la version de référence, celle qu'on
 * copie, désigne des routes qui existent et les appelle comme elles l'exigent.
 */

const CRONTAB = join(process.cwd(), "deploiement", "crontab.txt");
const APP = join(process.cwd(), "src", "app");

/** Les lignes de `curl` du crontab, commentaires et lignes vides retirés. */
function lignesDAppel(): readonly string[] {
  return readFileSync(CRONTAB, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#") && l.includes("curl"));
}

/** Les chemins `/api/...` que le crontab appelle réellement. */
function cheminsAppeles(): readonly string[] {
  return lignesDAppel().flatMap((l) => [...l.matchAll(/https?:\/\/[^/\s]+(\/api\/[^\s"']*)/g)].map((m) => m[1] as string));
}

/**
 * Toutes les routes du produit qui exigent le secret de tâche — c'est-à-dire
 * celles que SEUL un planificateur peut appeler, donc celles qui ne servent à
 * rien si personne ne les appelle.
 */
function routesPlanifiees(): readonly string[] {
  const trouvees: string[] = [];
  const parcourir = (dossier: string, chemin: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(complet, `${chemin}/${entree.name}`);
      } else if (entree.name === "route.ts") {
        if (readFileSync(complet, "utf8").includes("secretDeTacheValide")) trouvees.push(chemin);
      }
    }
  };
  parcourir(join(APP, "api"), "/api");
  return trouvees.sort();
}

describe("Le planificateur déclaré dans deploiement/", () => {
  test("la sonde inspecte réellement quelque chose", () => {
    // ⚠️ EN PREMIER : tout ce qui suit est vrai d'un fichier absent ou vide.
    expect(existsSync(CRONTAB), "deploiement/crontab.txt a disparu").toBe(true);
    expect(lignesDAppel().length, "aucune ligne d'appel dans le crontab").toBeGreaterThanOrEqual(2);
    expect(routesPlanifiees().length, "aucune route ne demande le secret de tâche").toBeGreaterThanOrEqual(2);
  });

  test("chaque route planifiée du produit EST appelée par le crontab", () => {
    /*
     * Le sens qui compte le plus. Une route ajoutée et jamais appelée est une
     * fonctionnalité morte que rien ne signale : elle passe les portes, elle
     * répond correctement quand on la sollicite, et personne ne la sollicite.
     */
    const appelees = new Set(cheminsAppeles());
    const oubliees = routesPlanifiees().filter((r) => !appelees.has(r));
    expect(oubliees, `route(s) planifiée(s) que rien n'appelle : ${oubliees.join(", ")}`).toEqual([]);
  });

  test("chaque chemin appelé par le crontab EXISTE dans le produit", () => {
    // L'autre sens : une route renommée laisse le crontab appeler une adresse
    // morte, et la garde du secret répond 404 sans que ce soit un défaut.
    const connues = new Set(routesPlanifiees());
    const fantomes = [...new Set(cheminsAppeles())].filter((c) => !connues.has(c));
    expect(fantomes, `chemin(s) appelé(s) qui n'existent pas : ${fantomes.join(", ")}`).toEqual([]);
  });

  test("chaque appel est un POST porteur du secret", () => {
    /*
     * Mesuré le 04/09/2026 contre un build servi : `GET` répond 404, `POST`
     * sans en-tête répond 404, `POST` avec un mauvais secret répond 404. Un
     * appel mal formé n'échoue donc pas bruyamment — il ressemble à une route
     * inexistante, ce qui est précisément ce que la garde veut montrer à un
     * inconnu, et précisément ce qui rend une faute de frappe invisible ici.
     */
    for (const ligne of lignesDAppel()) {
      expect(ligne, `appel sans -X POST : ${ligne.slice(0, 60)}`).toMatch(/-X\s+POST/);
      expect(ligne, `appel sans en-tête d'autorisation : ${ligne.slice(0, 60)}`).toMatch(
        /Authorization:\s*Bearer/,
      );
    }
  });

  test("le crontab n'écrit aucun secret en dur", () => {
    // Il est lu depuis une variable, jamais recopié : ce fichier est versionné
    // dans un dépôt PUBLIC.
    const contenu = readFileSync(CRONTAB, "utf8");
    expect(contenu, "le crontab doit passer par une variable").toContain("$CRON_SECRET");
    for (const ligne of lignesDAppel()) {
      expect(
        /Bearer\s+[A-Za-z0-9_-]{16,}/.test(ligne),
        `un secret semble écrit en dur : ${ligne.slice(0, 70)}`,
      ).toBe(false);
    }
  });

  test("la fréquence laisse de la marge au seuil du veilleur", () => {
    /*
     * `retard_veilleur_minutes` vaut 90 par défaut, et sa borne minimale de 5
     * existe pour une raison écrite en base : « sous la période du
     * planificateur lui-même, le veilleur serait déclaré en retard entre deux
     * battements normaux ». Une cadence trop lente produirait l'inverse : une
     * panne prise pour un rythme normal. On borne donc la période à 45 minutes,
     * la moitié du seuil — au-delà, deux passages manqués suffiraient à peine
     * à alerter.
     */
    const periodes = lignesDAppel().map((l) => {
      const champ = l.split(/\s+/)[0] as string;
      if (champ.startsWith("*/")) return Number(champ.slice(2));
      // Une liste `5,20,35,50` : la période est l'écart entre deux passages.
      const minutes = champ.split(",").map(Number).filter((n) => Number.isFinite(n));
      return minutes.length >= 2 ? (minutes[1] as number) - (minutes[0] as number) : 60;
    });
    expect(periodes.length).toBeGreaterThanOrEqual(2);
    for (const p of periodes) {
      expect(p, `période de ${p} min : trop lente devant un seuil de 90`).toBeLessThanOrEqual(45);
      expect(p, `période de ${p} min : si courte qu'un incident passager alerterait`).toBeGreaterThanOrEqual(5);
    }
  });
});
