import { describe, expect, test } from "vitest";
import { SEUIL_RESTITUTION_OCTETS, tablesARendre } from "../../scripts/espace.mjs";

/**
 * LA RESTITUTION D'ESPACE — CE QUI SE DÉCIDE, ET CE QUI SE MESURE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX DÉFAUTS RÉELS, TROUVÉS PAR EXÉCUTION LE 01/09/2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. ⚠️ `pnpm purge:test --confirmer` NE RENDAIT RIEN QUAND IL N'Y AVAIT RIEN À
 *    SUPPRIMER. Le script sortait sur « Rien à purger » dès que le compte de
 *    comptes de test valait zéro — c'est-à-dire EXACTEMENT l'état où on
 *    l'appelle : après `pnpm test:perf`, dont les suites nettoient leurs propres
 *    comptes mais laissent le gonflement. Mesuré : la base à **265 Mo**, le
 *    script annonçant « Rien à purger », et 265 Mo après.
 *
 *    Supprimer des LIGNES et rendre de l'ESPACE sont deux travaux différents ;
 *    les enchaîner sous une seule condition fait dépendre le second d'une
 *    question qui ne le concerne pas.
 *
 *    ⚠️ ET LA MÉMOIRE DU PROJET AFFIRMAIT LE CONTRAIRE : « `pnpm purge:test
 *    --confirmer` fait le même travail » que le `vacuum (full, analyze)`
 *    manuel. C'est L-014 — un document affirme un état que personne n'a exécuté.
 *    Il a suffi de le lancer.
 *
 * 2. La liste des tables à compacter était ÉCRITE EN DUR, à cinq noms. Mesurée
 *    sur la même base, elle laissait `shops` (4976 kB pour 3 lignes) et
 *    `usage_counters` (3272 kB pour 4 lignes) intactes. Une sélection ne connaît
 *    que ce que son auteur avait sous les yeux.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier éprouve la DÉCISION, qui est pure. Le `vacuum full` lui-même se
 * vérifie par exécution — on lit la taille avant et après — et non ici : un test
 * qui prendrait un verrou exclusif sur la base partagée bloquerait les 648
 * autres.
 */

/** L'inventaire réel mesuré le 01/09/2026, juste après `pnpm test:perf`. */
const INVENTAIRE_MESURE = [
  { table: "orders", octets: 170_917_888 },
  { table: "order_events", octets: 38_797_312 },
  { table: "link_views", octets: 22_020_096 },
  { table: "tracked_parcels", octets: 8_183_808 },
  { table: "admin_audit_log", octets: 7_913_472 },
  { table: "shops", octets: 5_095_424 },
  { table: "usage_counters", octets: 3_350_528 },
  { table: "profiles", octets: 221_184 },
  { table: "order_media", octets: 65_536 },
  { table: "scheduler_heartbeat", octets: 65_536 },
];

describe("Ce qu'on rend à l'espace", () => {
  test("la sonde inspecte quelque chose — un inventaire vide ne prouve rien", () => {
    // Un ensemble vide passe tout. Sans cette ligne, les contrôles ci-dessous
    // resteraient verts sur un inventaire que personne n'aurait rempli.
    expect(INVENTAIRE_MESURE.length).toBeGreaterThan(5);
  });

  test("⚠️ LES TABLES QUE LA LISTE EN DUR OUBLIAIT SONT MAINTENANT PRISES", () => {
    /*
     * LE CONTRÔLE QUI PORTE LE SECOND DÉFAUT. `shops` et `usage_counters` ne
     * figuraient dans aucune liste, et gonflaient tout autant. C'est le propre
     * d'une sélection : elle vieillit sans le dire.
     */
    const rendues = tablesARendre(INVENTAIRE_MESURE, SEUIL_RESTITUTION_OCTETS);
    expect(rendues, "`shops` est de nouveau laissée de côté").toContain("shops");
    expect(rendues, "`usage_counters` est de nouveau laissée de côté").toContain(
      "usage_counters",
    );
  });

  test("CONTRE-TEST : ce qui est petit est LAISSÉ — le verrou coûte plus que le gain", () => {
    // Sans lui, une fonction qui rendrait TOUT passerait le contrôle précédent,
    // et un `vacuum full` prendrait un verrou exclusif pour 64 kilooctets.
    const rendues = tablesARendre(INVENTAIRE_MESURE, SEUIL_RESTITUTION_OCTETS);
    expect(rendues).not.toContain("profiles");
    expect(rendues).not.toContain("order_media");
    expect(rendues).not.toContain("scheduler_heartbeat");
  });

  test("le seuil mord EXACTEMENT là où il est posé, pas un octet à côté", () => {
    const juste = [
      { table: "pile", octets: SEUIL_RESTITUTION_OCTETS },
      { table: "dessous", octets: SEUIL_RESTITUTION_OCTETS - 1 },
    ];
    expect(tablesARendre(juste, SEUIL_RESTITUTION_OCTETS)).toEqual(["pile"]);
  });

  test("LA PLUS GROSSE D'ABORD — un compactage interrompu doit avoir servi", () => {
    /*
     * Un `vacuum full` peut être coupé : délai, réseau, Ctrl-C. Dans cet ordre,
     * ce qui a été rendu avant l'interruption est le gros du gain. Dans l'ordre
     * inverse, on aurait payé le verrou sans rendre les 163 Mo qui comptent.
     */
    const rendues = tablesARendre(INVENTAIRE_MESURE, SEUIL_RESTITUTION_OCTETS);
    expect(rendues[0]).toBe("orders");
    expect(rendues[1]).toBe("order_events");
  });

  test("un inventaire VIDE rend une liste vide, sans lever", () => {
    // Zéro table est un état légitime — une base neuve. C'est à l'APPELANT de
    // refuser d'agir sur un inventaire vide, parce que lui seul sait s'il
    // s'attendait à en trouver.
    expect(tablesARendre([], SEUIL_RESTITUTION_OCTETS)).toEqual([]);
  });

  test("un seuil absent ou absurde LÈVE, il ne se remplace pas tout seul", () => {
    /*
     * Une valeur par défaut cachée rendrait le coût invisible au site d'appel :
     * on croirait choisir un seuil alors qu'on en subirait un autre. C'est la
     * même règle que pour le plafond du journal d'audit (leçon 191).
     */
    /*
     * ⚠️ LE TRANSTYPAGE EST LE SUJET, PAS UN CONTOURNEMENT. `espace.mjs` est du
     * JavaScript appelé depuis un script `.mjs` : rien n'y vérifie les types à
     * l'exécution. Éprouver la garde EXIGE donc de lui passer ce que le typage
     * interdit — sinon on ne prouverait que ce que `tsc` prouve déjà, et la
     * garde d'exécution resterait sans preuve.
     */
    const absurdes = [0, -1, Number.NaN, undefined] as unknown as number[];
    for (const absurde of absurdes) {
      expect(() => tablesARendre(INVENTAIRE_MESURE, absurde), String(absurde)).toThrow(
        /seuil de restitution/,
      );
    }
  });
});
