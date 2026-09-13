import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { SERVICES_PLANIFIES } from "../../deploiement/services-planifies";

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
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CETTE SUITE A GARDÉ LE MAUVAIS OBJET PENDANT DEUX JOURS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle validait ligne à ligne `deploiement/railway-cadence.json` et
 * `railway-veille.json`, qu'elle nommait « les services Railway planifiés,
 * déclarés en config-as-code ». Tout y était juste, tout passait au vert, et
 * Railway ne pouvait PAS les lire : « New services cannot opt into Config as
 * Code » (docs.railway.com, relevé le 06/09/2026).
 *
 * Une suite verte certifiait donc une configuration que personne n'applique.
 * C'est le motif que ce dépôt chasse — une garde qui regarde là où le défaut
 * n'est pas — et il était ici à son plus cher : la conclusion naturelle était
 * « les services sont configurés par le dépôt », donc ne rien saisir dans
 * l'interface, donc laisser le suivi des colis à l'arrêt.
 *
 * CE QU'ELLE GARDE MAINTENANT : la fiche de saisie
 * `deploiement/services-planifies.ts`, qui dit d'elle-même qu'elle n'est pas
 * appliquée, et l'ABSENCE ACTIVE des fichiers qui prétendaient l'être.
 *
 * CE QU'ELLE NE PEUT TOUJOURS PAS FAIRE, et il ne faut pas faire semblant :
 * vérifier ce qui tourne réellement sur Railway. Cette preuve-là est ailleurs
 * — `scheduler_heartbeat` se remplit, et l'écran Monitoring de l'admin fait
 * passer les deux tâches de « Jamais exécutée » à « Actif ».
 */

const DEPLOIEMENT = join(process.cwd(), "deploiement");
const SCRIPT = join(DEPLOIEMENT, "planificateur.mjs");
const APP = join(process.cwd(), "src", "app");

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

/** La période, en minutes, d'un horaire crontab de la forme employée ici. */
function periodeEnMinutes(horaire: string): number {
  const champ = horaire.split(/\s+/)[0] as string;
  if (champ.startsWith("*/")) return Number(champ.slice(2));
  const minutes = champ
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return minutes.length >= 2 ? (minutes[1] as number) - (minutes[0] as number) : 60;
}

describe("Le planificateur Railway", () => {
  test("la sonde inspecte réellement quelque chose", () => {
    // ⚠️ EN PREMIER : tout ce qui suit est vrai d'un dossier vide.
    expect(existsSync(SCRIPT), "deploiement/planificateur.mjs a disparu").toBe(true);
    expect(routesDuScript().size, "le script ne connaît aucune route").toBeGreaterThanOrEqual(2);
    expect(SERVICES_PLANIFIES.length, "aucun service planifié déclaré").toBeGreaterThanOrEqual(2);
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
    const taches = routesDuScript();
    for (const service of SERVICES_PLANIFIES) {
      expect(service.commandeDeDemarrage, `${service.nom} : ne lance pas le planificateur`).toContain(
        "planificateur.mjs",
      );
      const argument = service.commandeDeDemarrage.trim().split(/\s+/).at(-1) as string;
      expect(argument, `${service.nom} : la commande ne finit pas par la tâche déclarée`).toBe(service.tache);
      expect(taches.has(service.tache), `${service.nom} : tâche « ${service.tache} » inconnue du script`).toBe(true);
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
    const taches = SERVICES_PLANIFIES.map((s) => s.tache);
    const noms = SERVICES_PLANIFIES.map((s) => s.nom);
    expect(new Set(taches).size, `deux services doivent porter DEUX tâches distinctes : ${taches.join(", ")}`).toBe(
      taches.length,
    );
    expect(new Set(noms).size, `deux services doivent porter DEUX noms distincts : ${noms.join(", ")}`).toBe(
      noms.length,
    );
    expect(taches.length).toBeGreaterThanOrEqual(2);
  });

  test("les horaires sont DÉCALÉS — le veilleur observe un passage terminé", () => {
    /*
     * Deux tâches au même quart d'heure se regarderaient l'une l'autre en plein
     * travail : la veille lirait un battement que la cadence n'a pas encore
     * écrit, et signalerait un retard qui n'existe pas. « Une alerte qui se
     * trompe est une alerte qu'on apprend à ignorer. »
     */
    const premieresMinutes = SERVICES_PLANIFIES.map((s) => {
      const champ = s.horaire.split(/\s+/)[0] as string;
      return champ.startsWith("*/") ? 0 : Number(champ.split(",")[0]);
    });
    expect(
      new Set(premieresMinutes).size,
      `les services démarrent à la même minute : ${premieresMinutes.join(", ")}`,
    ).toBe(premieresMinutes.length);
  });

  test("la fréquence laisse de la marge au seuil du veilleur", () => {
    /*
     * `retard_veilleur_minutes` vaut 90 par défaut, et la migration 087 borne
     * ce paramètre à 5 minutes minimum avec sa raison : « sous la période du
     * planificateur lui-même, le veilleur serait déclaré en retard entre deux
     * battements normaux ». On borne donc la période à 45 minutes — la moitié
     * du seuil — et à 5 au plus court, qui est aussi le minimum de Railway :
     * « the shortest time between successive executions of a cron job cannot be
     * less than 5 minutes ».
     */
    for (const service of SERVICES_PLANIFIES) {
      const periode = periodeEnMinutes(service.horaire);
      expect(periode, `${service.nom} : ${periode} min, trop lent devant un seuil de 90`).toBeLessThanOrEqual(45);
      expect(periode, `${service.nom} : ${periode} min, sous le minimum de 5 de Railway`).toBeGreaterThanOrEqual(5);
    }
  });

  test("un service planifié ne redémarre pas en boucle", () => {
    // `ALWAYS` sur une tâche qui doit se terminer la relancerait sans fin :
    // Railway la verrait finir, la relancerait, et la cadence deviendrait
    // continue — c'est-à-dire un appel au fournisseur de suivi sans limite.
    for (const service of SERVICES_PLANIFIES) {
      expect(service.politiqueDeRedemarrage, `${service.nom} : politique de redémarrage dangereuse`).toBe("NEVER");
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
     */
    for (const service of SERVICES_PLANIFIES) {
      expect(
        service.commandeDeBuild,
        `${service.nom} : lance le build de Next, qui exige des variables que ce service n'a pas`,
      ).not.toContain("next build");
      expect(service.commandeDeBuild, `${service.nom} : lance \`pnpm build\``).not.toMatch(/pnpm\s+build/);
      /*
       * ⚠️ AUCUN GUILLEMET, ET C'EST UNE PANNE DE PRODUCTION DU 12/09/2026.
       * La commande était `node -e "console.log('…')"`. Railpack l'a passée à
       * `sh -c` en perdant les apostrophes : « Unterminated quoted string »,
       * build rouge, et les DEUX planificateurs ont cessé de tourner — suivi
       * figé, veilleur muet — pendant plus d'un jour, sans autre signal qu'un
       * email de Railway. Une commande sans guillemets ne dépend d'aucune couche
       * qui les réinterprète.
       */
      expect(service.commandeDeBuild, `${service.nom} : porte des guillemets`).not.toMatch(/['"`]/);
    }
  });

  test("chaque service déclare les DEUX variables sans lesquelles il sort en erreur", () => {
    /*
     * Le planificateur refuse de partir sans elles et sort en 2 — c'est mesuré.
     * Mais un service Railway créé sans ses variables ne dit rien à personne :
     * il échoue, Railway affiche un déploiement rouge dans un onglet que nul
     * n'ouvre, et le suivi reste figé. La fiche de saisie doit donc les porter,
     * sinon elle est incomplète au seul endroit qui compte.
     */
    const source = readFileSync(SCRIPT, "utf8");
    const parLeScript = new Set([...source.matchAll(/process\.env\["([A-Z_]+)"\]/g)].map((m) => m[1] as string));
    expect(parLeScript.size, "le script ne lit aucune variable d'environnement").toBeGreaterThanOrEqual(2);

    for (const service of SERVICES_PLANIFIES) {
      const manquantes = [...parLeScript].filter((v) => !service.variables.includes(v));
      expect(manquantes, `${service.nom} : variable(s) non déclarée(s) — ${manquantes.join(", ")}`).toEqual([]);
      // L'AUTRE SENS : une variable déclarée que le script ne lit pas est une
      // consigne de saisie inutile, donc une occasion de se tromper.
      const inutiles = service.variables.filter((v) => !parLeScript.has(v));
      expect(inutiles, `${service.nom} : variable(s) que le script ne lit pas — ${inutiles.join(", ")}`).toEqual([]);
    }
  });

  test("AUCUN fichier ne se fait passer pour une configuration que Railway appliquerait", () => {
    /*
     * ⚠️ CE CONTRÔLE EXISTE PARCE QUE L'ABSENCE NE SE GARDE PAS TOUTE SEULE
     * (L-029). Rien n'empêche quelqu'un — moi dans trois semaines, en relisant
     * une vieille fiche — de recréer `deploiement/railway-cadence.json` en
     * croyant bien faire. Le fichier aurait l'air officiel, ne serait lu par
     * personne, et sa seule conséquence serait de faire croire que l'interface
     * n'a rien à recevoir.
     *
     * Le motif vise `deploiement/`, pas la racine : `railway.json` À LA RACINE
     * est légitime — il configure le service WEB, qui, lui, était déjà abonné à
     * config-as-code avant la fermeture. Son échéance est gardée juste en
     * dessous.
     */
    const usurpateurs = readdirSync(DEPLOIEMENT).filter((f) => /^railway.*\.(json|toml)$/i.test(f));
    expect(
      usurpateurs,
      "Ces fichiers ont la forme d'une configuration Railway mais ne seront JAMAIS " +
        "appliqués : « New services cannot opt into Config as Code ». La saisie se fait " +
        "dans l'interface, et la référence est deploiement/services-planifies.ts. — " +
        usurpateurs.join(", "),
    ).toEqual([]);
  });

  test("l'échéance qui éteindra la configuration du service WEB devient bruyante à temps", () => {
    /*
     * ⚠️ CE CONTRÔLE EST DÉLIBÉRÉMENT DATÉ, ET IL DEVIENDRA ROUGE TOUT SEUL.
     *
     * `railway.json`, à la racine, configure le service WEB — celui qui sert
     * droplink.fr. Il porte `pnpm build`, `pnpm start` et
     * `restartPolicyType: ALWAYS`. Ce service-là était abonné à config-as-code
     * AVANT sa fermeture, donc son fichier est encore lu — mais Railway a posé
     * une date de fin, mot pour mot :
     *
     *     « railway.json/toml files continue to work for services that already
     *       use them until 2026-12-01 (hard cutoff). »
     *
     * Passé cette date, ces trois valeurs cessent d'exister sans que rien ne le
     * dise. Le déploiement suivant retombera sur ce que Railpack devine, et
     * personne ne fera le lien avec un fichier qui n'a pas bougé. C'est
     * exactement le mode de défaillance que ce dépôt refuse : silencieux,
     * différé, et attribué à autre chose.
     *
     * LE REMÈDE TIENT EN DEUX GESTES, DANS CET ORDRE — l'inverse casse la
     * production :
     *   1. recopier les trois valeurs dans l'onglet Settings du service web
     *      (Custom Build Command, Custom Start Command, Restart Policy) ;
     *   2. SEULEMENT ensuite, supprimer `railway.json` du dépôt.
     *
     * Supprimer d'abord retirerait les valeurs sans que rien ne les remplace,
     * puisque « configuration defined in code will always override values from
     * the dashboard » : tant que le fichier existe, ce qu'on tape dans
     * l'interface est ignoré, donc invérifiable depuis l'écran.
     *
     * La marge est de 60 jours : assez pour agir sans urgence, assez peu pour
     * que le rouge tombe pendant qu'on se souvient encore de quoi il parle.
     */
    const RACINE = join(process.cwd(), "railway.json");
    if (!existsSync(RACINE)) return; // Le remède a été appliqué : plus rien à garder.

    const COUPURE = Date.UTC(2026, 11, 1);
    const MARGE_JOURS = 60;
    const joursRestants = Math.floor((COUPURE - Date.now()) / 86_400_000);

    expect(
      joursRestants,
      `railway.json existe encore et Railway cessera de le lire le 2026-12-01 ` +
        `(dans ${joursRestants} jours). Il porte la commande de build, la commande de ` +
        `démarrage et la politique de redémarrage du service WEB. Recopier ces trois ` +
        `valeurs dans l'onglet Settings du service, PUIS supprimer le fichier — jamais ` +
        `l'inverse : tant qu'il existe, il écrase ce que l'interface affiche.`,
    ).toBeGreaterThan(MARGE_JOURS);
  });

  test("le script REFUSE une variable que Railway n'a pas substituée", () => {
    /*
     * ⚠️ UNE VARIABLE PRÉSENTE N'EST PAS UNE VARIABLE SUBSTITUÉE (L-026).
     *
     * `CRON_SECRET` se pose sur les services planifiés comme une référence au
     * service web — `${{droplink2.CRON_SECRET}}` — et c'est la bonne façon :
     * la valeur n'est jamais recopiée, donc jamais mal recopiée. Mais si le nom
     * du service est faux d'une lettre, Railway ne résout rien et transmet LA
     * CHAÎNE. Elle est non vide, elle franchit le contrôle de présence, elle
     * part dans l'en-tête — et la route répond 404, exactement comme à un
     * inconnu, parce que c'est ainsi qu'elle est conçue.
     *
     * ⚠️ ET CE CONTRÔLE EXÉCUTE LE SCRIPT, il ne lit pas sa source. Chercher le
     * motif `${{` dans le fichier prouverait qu'un texte existe, jamais qu'une
     * capacité est en place (L-020) — et le commentaire ci-dessus contient
     * justement ce motif, donc une recherche textuelle se satisferait de lui.
     */
    const lancer = (env: Record<string, string>) => {
      const r = spawnSync(process.execPath, [SCRIPT, "cadence"], {
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
      return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
    };

    for (const variable of ["CRON_SECRET", "PLANIFICATEUR_BASE_URL"]) {
      const sain = { PLANIFICATEUR_BASE_URL: "https://exemple.invalide", CRON_SECRET: "un-vrai-secret" };
      const r = lancer({ ...sain, [variable]: "${{droplink2.UNE_VARIABLE}}" });
      expect(r.code, `${variable} non substituée : le script aurait dû refuser`).toBe(2);
      expect(r.sortie, `${variable} : le refus ne nomme pas la cause`).toContain("NON SUBSTITUÉE");
      expect(r.sortie, `${variable} : le refus ne nomme pas la variable fautive`).toContain(variable);
    }

    /*
     * CONTRE-TEST — SANS LUI, UN SCRIPT QUI REFUSE TOUT PASSERAIT À 100 %.
     * L'adresse n'est volontairement pas une URL : `fetch` échoue au parsing,
     * donc ce contrôle n'ouvre AUCUNE connexion — le projet `unit` doit rester
     * exécutable sans réseau.
     */
    const passant = lancer({ PLANIFICATEUR_BASE_URL: "pas-une-url", CRON_SECRET: "un-vrai-secret" });
    expect(passant.code, "deux valeurs saines auraient dû dépasser la garde de substitution").toBe(1);
    expect(passant.sortie, "la garde de substitution a mordu sur des valeurs saines").not.toContain("NON SUBSTITUÉE");
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
