import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LE PLANIFICATEUR VIT HORS DU DÉPÔT, ET C'EST POUR ÇA QU'IL A BESOIN D'UNE
 * GARDE ICI.
 *
 * Rien dans l'application ne se déclenche tout seul : le suivi des colis ne
 * bouge que si `/api/suivi/cadence` est appelée du dehors. Le jour où
 * quelqu'un renomme cette route, TypeScript ne dira rien — elle n'est
 * référencée par aucun code applicatif — et le planificateur continuera
 * d'appeler une adresse morte. Le produit paraîtra marcher : les écrans
 * répondront, les commandes s'ouvriront, et le suivi sera figé pour tout le
 * monde.
 *
 * ⚠️ ET UN PASSAGE QUI ÉCHOUE NE PRÉVIENT PERSONNE TOUT SEUL. La route répond
 * 404 à un secret refusé — comme à un inconnu, par conception — et le veilleur
 * qui devrait le voir est lui-même un service planifié. Une seule variable mal
 * recopiée rend donc muets à la fois la tâche ET son surveillant.
 *
 * CE QUE CETTE SUITE NE PEUT PAS FAIRE : vérifier ce qui tourne réellement sur
 * Railway. Elle vérifie que la version de référence désigne des routes qui
 * existent et les appelle comme elles l'exigent.
 */

const DEPLOIEMENT = join(process.cwd(), "deploiement");
const SCRIPT = join(DEPLOIEMENT, "planificateur.mjs");
const APP = join(process.cwd(), "src", "app");

/** Les services Railway planifiés, déclarés en config-as-code. */
function configsPlanifiees(): readonly { readonly nom: string; readonly json: Record<string, unknown> }[] {
  return readdirSync(DEPLOIEMENT)
    .filter((f) => f.startsWith("railway-") && f.endsWith(".json"))
    .map((nom) => ({ nom, json: JSON.parse(readFileSync(join(DEPLOIEMENT, nom), "utf8")) as Record<string, unknown> }));
}

function deploy(c: Record<string, unknown>): Record<string, unknown> {
  return (c["deploy"] ?? {}) as Record<string, unknown>;
}

/** Les tâches que le script sait exécuter, et la route de chacune. */
function routesDuScript(): ReadonlyMap<string, string> {
  const source = readFileSync(SCRIPT, "utf8");
  const bloc = /const ROUTES = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source);
  const paires = new Map<string, string>();
  for (const m of (bloc?.[1] ?? "").matchAll(/(\w+)\s*:\s*"([^"]+)"/g)) {
    paires.set(m[1] as string, m[2] as string);
  }
  return paires;
}

/** Les routes du produit qui exigent le secret de tâche. */
function routesPlanifiees(): readonly string[] {
  const trouvees: string[] = [];
  const parcourir = (dossier: string, chemin: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name);
      if (entree.isDirectory()) parcourir(complet, `${chemin}/${entree.name}`);
      else if (entree.name === "route.ts" && readFileSync(complet, "utf8").includes("secretDeTacheValide"))
        trouvees.push(chemin);
    }
  };
  parcourir(join(APP, "api"), "/api");
  return trouvees.sort();
}

describe("Le planificateur Railway", () => {
  test("la sonde inspecte réellement quelque chose", () => {
    // ⚠️ EN PREMIER : tout ce qui suit est vrai d'un dossier vide.
    expect(existsSync(SCRIPT), "deploiement/planificateur.mjs a disparu").toBe(true);
    expect(routesDuScript().size, "le script ne connaît aucune route").toBeGreaterThanOrEqual(2);
    expect(configsPlanifiees().length, "aucun service planifié déclaré").toBeGreaterThanOrEqual(2);
    expect(routesPlanifiees().length, "aucune route n'exige le secret").toBeGreaterThanOrEqual(2);
  });

  test("chaque route planifiée du produit EST appelable par le script", () => {
    // Le sens qui compte le plus : une route ajoutée que rien n'appelle est une
    // fonctionnalité morte que rien ne signale.
    const connues = new Set(routesDuScript().values());
    const oubliees = routesPlanifiees().filter((r) => !connues.has(r));
    expect(oubliees, `route(s) que le planificateur ignore : ${oubliees.join(", ")}`).toEqual([]);
  });

  test("chaque route du script EXISTE dans le produit", () => {
    const reelles = new Set(routesPlanifiees());
    const fantomes = [...routesDuScript().values()].filter((r) => !reelles.has(r));
    expect(fantomes, `route(s) inexistante(s) : ${fantomes.join(", ")}`).toEqual([]);
  });

  test("chaque service planifié lance le script avec une tâche qu'il connaît", () => {
    const taches = new Set(routesDuScript().keys());
    for (const { nom, json } of configsPlanifiees()) {
      const commande = String(deploy(json)["startCommand"] ?? "");
      expect(commande, `${nom} : ne lance pas le planificateur`).toContain("planificateur.mjs");
      const argument = commande.trim().split(/\s+/).at(-1) as string;
      expect(taches.has(argument), `${nom} : tâche « ${argument} » inconnue du script`).toBe(true);
    }
  });

  test("LES DEUX TÂCHES SONT DANS DES SERVICES SÉPARÉS — la veille mutuelle en dépend", () => {
    /*
     * « Le veilleur doit être hors du planificateur veillé : une tâche qui
     * surveille les tâches s'arrête avec elles. » Un service unique qui
     * appellerait les deux routes les ferait tomber ensemble, et il ne
     * resterait personne pour le constater. Ce contrôle est donc une garde
     * ARCHITECTURALE, pas un détail de configuration.
     */
    const taches = configsPlanifiees().map((c) =>
      String(deploy(c.json)["startCommand"] ?? "").trim().split(/\s+/).at(-1),
    );
    expect(new Set(taches).size, `deux services doivent porter DEUX tâches distinctes : ${taches.join(", ")}`).toBe(
      taches.length,
    );
    expect(taches.length).toBeGreaterThanOrEqual(2);
  });

  test("la fréquence laisse de la marge au seuil du veilleur", () => {
    /*
     * `retard_veilleur_minutes` vaut 90 par défaut, et la migration 087 borne
     * ce paramètre à 5 minutes minimum avec sa raison : « sous la période du
     * planificateur lui-même, le veilleur serait déclaré en retard entre deux
     * battements normaux ». On borne donc la période à 45 minutes — la moitié
     * du seuil — et à 5 au plus court, qui est aussi le minimum de Railway.
     */
    for (const { nom, json } of configsPlanifiees()) {
      const horaire = String(deploy(json)["cronSchedule"] ?? "");
      expect(horaire, `${nom} : aucun cronSchedule`).not.toBe("");
      const champ = horaire.split(/\s+/)[0] as string;
      const periode = champ.startsWith("*/")
        ? Number(champ.slice(2))
        : (() => {
            const m = champ.split(",").map(Number).filter((n) => Number.isFinite(n));
            return m.length >= 2 ? (m[1] as number) - (m[0] as number) : 60;
          })();
      expect(periode, `${nom} : ${periode} min, trop lent devant un seuil de 90`).toBeLessThanOrEqual(45);
      expect(periode, `${nom} : ${periode} min, sous le minimum de 5 de Railway`).toBeGreaterThanOrEqual(5);
    }
  });

  test("un service planifié ne redémarre pas en boucle", () => {
    // `ALWAYS` sur une tâche qui doit se terminer la relancerait sans fin :
    // Railway la verrait finir, la relancerait, et la cadence deviendrait
    // continue — c'est-à-dire un appel au fournisseur de suivi sans limite.
    for (const { nom, json } of configsPlanifiees()) {
      expect(deploy(json)["restartPolicyType"], `${nom} : politique de redémarrage dangereuse`).toBe("NEVER");
    }
  });

  test("un service planifié ne lance PAS le build de Next", () => {
    /*
     * ⚠️ DÉFAUT ATTRAPÉ LE 04/09, APRÈS COUP ET APRÈS LE PUSH. Les deux
     * configurations planifiées déclaraient `buildCommand: pnpm build`, copié
     * du service web sans réfléchir. Or `next build` LÈVE si les variables
     * Supabase sont absentes — `lib/supabase/config.ts` refuse de construire un
     * client sur une configuration incomplète, délibérément.
     *
     * Les services planifiés ne reçoivent que `CRON_SECRET` et
     * `PLANIFICATEUR_BASE_URL` : leur build aurait donc échoué, et le
     * planificateur n'aurait JAMAIS tourné. Le suivi serait resté figé, le
     * veilleur muet — et le produit aurait eu l'air déployé.
     *
     * Ils n'ont aucun besoin du build : leur commande de démarrage est un
     * script Node qui n'importe rien de l'application.
     */
    for (const { nom, json } of configsPlanifiees()) {
      const build = (json["build"] ?? {}) as Record<string, unknown>;
      expect(
        String(build["buildCommand"] ?? ""),
        `${nom} : lance le build de Next, qui exige des variables que ce service n'a pas`,
      ).not.toContain("next build");
      expect(
        String(build["buildCommand"] ?? ""),
        `${nom} : lance \`pnpm build\`, c'est-à-dire le build de Next`,
      ).not.toMatch(/pnpm\s+build/);
    }
  });

  test("le script sort en ERREUR quand l'appel échoue", () => {
    // Sans code de sortie non nul, une faute de frappe dans le secret
    // produirait des passages « réussis » à jamais : la route répond 404 à un
    // secret refusé exactement comme à un inconnu.
    const source = readFileSync(SCRIPT, "utf8");
    expect(source, "aucune sortie en erreur").toMatch(/process\.exit\(1\)/);
    expect(source, "le statut de la réponse n'est pas vérifié").toContain("reponse.ok");
  });
});
