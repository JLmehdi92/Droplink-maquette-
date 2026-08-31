import { describe, expect, test } from "vitest";
import { decider, graceMinutes, type BattementVu } from "@/lib/veille/decision";
import { TACHE_CADENCE, TACHE_VEILLE, TACHES_ATTENDUES } from "@/lib/veille/taches";

/**
 * LA DÉCISION D'ALERTER.
 *
 * Ce que cette suite doit établir avant tout le reste : que la règle « une
 * tâche jamais vue n'est pas une alerte » ne se transforme pas en « une tâche
 * jamais déployée n'est jamais signalée ». Les deux phrases décrivent la même
 * absence de ligne, et c'est par là que le défaut est passé.
 */

const MAINTENANT = new Date("2026-08-31T12:00:00.000Z");
const RETARD = 90;

/** Un instant, exprimé en minutes AVANT `MAINTENANT`. */
function ilYA(minutes: number): string {
  return new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
}

/** Le veilleur, vivant depuis `age` minutes. */
function veilleurAge(age: number | null): BattementVu {
  return {
    source: TACHE_VEILLE,
    etat: "actif",
    minutes: 0,
    premierBattement: age === null ? null : ilYA(age),
  };
}

describe("La veille — ce qu'elle inspecte", () => {
  /*
   * ⚠️ UN ENSEMBLE VIDE PASSE TOUT.
   *
   * Toute la suite fait tourner `decider` sur un inventaire. Si cet inventaire
   * se vidait — une refonte, une liste construite depuis une source absente —
   * chaque test ci-dessous continuerait de passer en ne prouvant plus rien. On
   * établit donc d'abord qu'il y a quelque chose à décider.
   */
  test("l'inventaire porte au moins deux tâches, sinon rien ne se veille", () => {
    expect(
      TACHES_ATTENDUES.length,
      "Une veille MUTUELLE demande deux tâches. À une seule, le veilleur " +
        "serait ce qu'il veille — exactement le défaut que L-022 nomme.",
    ).toBeGreaterThanOrEqual(2);
    expect(TACHES_ATTENDUES).toContain(TACHE_CADENCE);
    expect(TACHES_ATTENDUES).toContain(TACHE_VEILLE);
  });
});

describe("La veille — un veilleur ne se veille pas lui-même", () => {
  test("son propre retard ne produit AUCUNE alerte", () => {
    /*
     * Le cas est absurde en apparence — un veilleur en retard n'exécute pas le
     * code qui le constaterait. Il ne l'est pas : rien n'empêche un passage
     * tardif de tourner enfin et de se découvrir lui-même en retard. S'il
     * s'alertait, il enverrait un email disant « je ne tourne plus » au moment
     * précis où il tourne.
     */
    const alertes = decider({
      veilleur: TACHE_VEILLE,
      battements: [
        { source: TACHE_VEILLE, etat: "en_retard", minutes: 999, premierBattement: ilYA(10_000) },
        { source: TACHE_CADENCE, etat: "actif", minutes: 2, premierBattement: ilYA(10_000) },
      ],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes).toEqual([]);
  });
});

describe("La veille — une tâche en retard", () => {
  const alertes = decider({
    veilleur: TACHE_VEILLE,
    battements: [
      veilleurAge(10_000),
      { source: TACHE_CADENCE, etat: "en_retard", minutes: 214, premierBattement: ilYA(10_000) },
    ],
    maintenant: MAINTENANT,
    retardMinutes: RETARD,
  });

  test("produit une alerte, et une seule", () => {
    expect(alertes.length).toBe(1);
    expect(alertes[0]?.source).toBe(TACHE_CADENCE);
    expect(alertes[0]?.motif).toBe("en_retard");
  });

  test("le message PORTE SA VALEUR, pas seulement son jugement", () => {
    // « 214 minutes sur un seuil de 90 » se vérifie ; « la tâche est en
    // retard » se croit. Le brief l'exige nommément des signalements admin.
    const texte = alertes[0]?.texte ?? "";
    expect(texte).toContain("214");
    expect(texte).toContain(String(RETARD));
    expect(texte).toContain(TACHE_CADENCE);
  });

  test("la clé de repos ne porte PAS le nom de l'observateur", () => {
    /*
     * PROPRIÉTÉ CENTRALE, ET FACILE À CASSER SANS S'EN APERCEVOIR.
     *
     * Les deux planificateurs constatent la même panne au même moment. Si la
     * clé portait le nom de celui qui constate, chacun réserverait la sienne et
     * DEUX emails identiques partiraient à chaque tour. Le volume est ce qui
     * apprend à ignorer une alerte : le défaut serait silencieux et son effet,
     * un veilleur qu'on filtre.
     */
    const cle = alertes[0]?.cle ?? "";
    expect(cle).not.toContain(TACHE_VEILLE);
    expect(cle).toContain(TACHE_CADENCE);

    // Et la preuve par l'autre observateur : la même panne, vue depuis la
    // cadence, doit produire EXACTEMENT la même clé.
    const vuParLaCadence = decider({
      veilleur: TACHE_CADENCE,
      battements: [
        { source: TACHE_CADENCE, etat: "actif", minutes: 0, premierBattement: ilYA(10_000) },
        { source: TACHE_VEILLE, etat: "en_retard", minutes: 214, premierBattement: ilYA(10_000) },
      ],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(vuParLaCadence[0]?.cle).toBe(`veille:${TACHE_VEILLE}:en_retard`);
  });
});

describe("La veille — une tâche JAMAIS vue", () => {
  const jamaisVue: BattementVu = {
    source: TACHE_CADENCE,
    etat: "jamais_vue",
    minutes: null,
    premierBattement: null,
  };

  test("un veilleur JEUNE se tait — une tâche posée ce matin n'est pas en panne", () => {
    /*
     * C'est la règle du brief, et elle doit tenir : « une tâche posée ce matin
     * n'a pas encore eu son premier passage ; la signaler ferait chercher une
     * panne inexistante. Une alerte qui se trompe est une alerte qu'on apprend
     * à ignorer. »
     */
    const alertes = decider({
      veilleur: TACHE_VEILLE,
      battements: [veilleurAge(30), jamaisVue],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes).toEqual([]);
  });

  test("un veilleur VIEUX alerte — le silence est devenu une information", () => {
    /*
     * Et c'est le trou que la règle précédente laissait : appliquée seule, elle
     * rend une tâche JAMAIS déployée éternellement invisible. Ce qui distingue
     * les deux cas n'est pas la tâche absente, c'est l'âge de celui qui la
     * cherche.
     */
    const alertes = decider({
      veilleur: TACHE_VEILLE,
      battements: [veilleurAge(graceMinutes(RETARD) + 1), jamaisVue],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes.length).toBe(1);
    expect(alertes[0]?.motif).toBe("jamais_deployee");
    expect(alertes[0]?.texte).toContain("JAMAIS");
  });

  test("la bascule se fait EXACTEMENT à la grâce, pas avant", () => {
    const grace = graceMinutes(RETARD);
    const avant = decider({
      veilleur: TACHE_VEILLE,
      battements: [veilleurAge(grace - 1), jamaisVue],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    const apres = decider({
      veilleur: TACHE_VEILLE,
      battements: [veilleurAge(grace), jamaisVue],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(avant.length, "une minute avant la grâce, on se tait encore").toBe(0);
    expect(apres.length, "à la grâce exactement, on parle").toBe(1);
  });

  test("SANS PREUVE D'ÂGE, on se tait", () => {
    /*
     * L'observateur n'a pas de premier battement — premier passage, ou
     * inventaire qui ne le contient pas. Il n'a AUCUNE preuve d'ancienneté.
     *
     * Se taire par ignorance est réparable au passage suivant ; crier par
     * ignorance produit une alerte fausse, et une alerte fausse est ce qui
     * apprend à ignorer les vraies. Le sens de l'erreur est choisi.
     */
    for (const sansAge of [veilleurAge(null), undefined]) {
      const battements = sansAge === undefined ? [jamaisVue] : [sansAge, jamaisVue];
      const alertes = decider({
        veilleur: TACHE_VEILLE,
        battements,
        maintenant: MAINTENANT,
        retardMinutes: RETARD,
      });
      expect(alertes).toEqual([]);
    }
  });

  test("un premier battement ILLISIBLE est traité comme absent", () => {
    const alertes = decider({
      veilleur: TACHE_VEILLE,
      battements: [
        { source: TACHE_VEILLE, etat: "actif", minutes: 0, premierBattement: "pas une date" },
        jamaisVue,
      ],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes).toEqual([]);
  });
});

describe("La veille — le contre-test positif", () => {
  /*
   * ⚠️ UNE SUITE OÙ TOUT ALERTE PASSE À 100 % SANS RIEN PROUVER.
   *
   * Les tests ci-dessus vérifient surtout des SILENCES. Une implémentation qui
   * ne rendrait jamais rien les passerait presque tous. Celui-ci ferme la
   * porte dans l'autre sens : sur un état sain, zéro alerte ; sur un état
   * cassé, une alerte — avec le MÊME code.
   */
  test("tout va bien : aucune alerte", () => {
    const alertes = decider({
      veilleur: TACHE_VEILLE,
      battements: [
        veilleurAge(10_000),
        { source: TACHE_CADENCE, etat: "actif", minutes: 3, premierBattement: ilYA(10_000) },
      ],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes).toEqual([]);
  });

  test("plusieurs tâches en panne : une alerte chacune, jamais fusionnées", () => {
    const alertes = decider({
      veilleur: "observateur-tiers",
      battements: [
        { source: "observateur-tiers", etat: "actif", minutes: 0, premierBattement: ilYA(10_000) },
        { source: TACHE_CADENCE, etat: "en_retard", minutes: 300, premierBattement: ilYA(10_000) },
        { source: TACHE_VEILLE, etat: "jamais_vue", minutes: null, premierBattement: null },
      ],
      maintenant: MAINTENANT,
      retardMinutes: RETARD,
    });
    expect(alertes.length).toBe(2);
    expect(new Set(alertes.map((a) => a.cle)).size, "deux pannes, deux clés distinctes").toBe(2);
  });
});

describe("La grâce accordée à un premier passage", () => {
  test("vaut quatre périodes de retard, avec un plancher d'une heure", () => {
    expect(graceMinutes(90)).toBe(360);
    expect(graceMinutes(30)).toBe(120);
    // Le plancher : un seuil réglé au minimum admis (5 min) ramènerait la grâce
    // à vingt minutes, ce qui est plus court qu'un déploiement. On alerterait
    // alors sur une tâche en cours d'installation.
    expect(graceMinutes(5)).toBe(60);
    expect(graceMinutes(1)).toBe(60);
  });
});
