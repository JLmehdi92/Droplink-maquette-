import { describe, expect, test } from "vitest";
import { ETAPES, normaliser, rang, type Etape } from "@/lib/tracking/normalize";
import { assemblerPassages } from "@/lib/tracking/checkpoints";
import { SEUIL_SILENCE_JOURS, decrireSilence } from "@/lib/tracking/silence";
import {
  FENETRE_VIDE_JOURS,
  INTERROGATIONS_VIDES_MAX,
  decider,
  intervalleHeures,
  type EtatColis,
} from "@/lib/tracking/schedule";

/**
 * LA LOGIQUE DÉCIDABLE HORS RÉSEAU.
 *
 * Tout ce que le suivi décide sans parler à personne est ici, et c'est
 * délibéré : le reste dépend de ce qu'un tiers veut bien répondre au moment du
 * test, ces quatre modules non. Ce qu'ils décident est ce que le client voit.
 */

const AUCUN_JALON = { statut: null, jalons: [] } as const;

describe("Le statut ne recule JAMAIS", () => {
  test("un état plus avancé fait avancer", () => {
    const r = normaliser("preparation", { statut: "InTransit", jalons: [] });
    expect(r.etape).toBe("en_transit");
    expect(r.inchange).toBe(false);
  });

  /**
   * LE CAS QUI MOTIVE TOUT LE MODULE. Les transporteurs reculent : un scan
   * tardif arrive après un scan plus avancé, une correction ramène un colis
   * « en traitement ». Un client qui a lu « en transit » et lit « en
   * préparation » le lendemain conclut que son colis s'est perdu.
   */
  test("un état MOINS avancé ne fait pas reculer", () => {
    const r = normaliser("en_transit", { statut: "InfoReceived", jalons: [] });
    expect(r.etape).toBe("en_transit");
    expect(r.inchange).toBe(true);
  });

  test("même un colis livré ne redescend pas", () => {
    for (const statut of ["InTransit", "InfoReceived", "Exception", "DeliveryFailure"]) {
      expect(normaliser("livre", { statut, jalons: [] }).etape).toBe("livre");
    }
  });

  test("les rangs sont strictement croissants — c'est eux qui interdisent le recul", () => {
    // Le contre-test de la mécanique elle-même : si deux étapes partageaient un
    // rang, la comparaison laisserait passer un recul sans que rien n'échoue.
    const rangs = ETAPES.map(rang);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(rangs).size).toBe(ETAPES.length);
  });
});

describe("Un état inconnu ne fait rien bouger", () => {
  test("il est SIGNALÉ, et laisse l'étape en place", () => {
    const r = normaliser("expedie", { statut: "QuelqueChoseDeNouveau", jalons: [] });
    expect(r.etape).toBe("expedie");
    expect(r.inconnu, "un état non traduit doit être signalé").toBe(true);
  });

  test("un état CONNU n'est pas signalé comme inconnu", () => {
    // Sans ce contre-test, une fonction qui signale tout comme inconnu passerait
    // le test précédent sans rien prouver.
    expect(normaliser("preparation", { statut: "Delivered", jalons: [] }).inconnu).toBe(false);
  });

  test("la casse et la ponctuation du fournisseur n'ont pas d'importance", () => {
    // Une correspondance sensible à la casse casserait le jour où le fournisseur
    // écrirait `IN_TRANSIT` : le colis cesserait d'avancer, sans erreur.
    for (const forme of ["InTransit", "INTRANSIT", "in_transit", " in-transit "]) {
      expect(normaliser("preparation", { statut: forme, jalons: [] }).etape).toBe("en_transit");
    }
  });

  test("`Expired` et `Exception` ne disent pas OÙ est le colis", () => {
    for (const statut of ["Expired", "Exception"]) {
      const r = normaliser("expedie", { statut, jalons: [] });
      expect(r.etape).toBe("expedie");
      expect(r.inconnu, `${statut} est connu, il ne doit pas être signalé`).toBe(false);
    }
  });
});

describe("Les jalons datés", () => {
  test("`PickedUp` est le SEUL signal de remise au transporteur", () => {
    // Aucun statut ne dit « le transporteur a le colis » : sans les jalons,
    // l'étape « expédiée » n'existerait jamais.
    const r = normaliser("preparation", {
      statut: "InfoReceived",
      jalons: [{ etape: "PickedUp", date: "2026-08-01T10:00:00Z" }],
    });
    expect(r.etape).toBe("expedie");
  });

  /**
   * LE PIÈGE DU GABARIT. Le fournisseur rend la LISTE COMPLÈTE des jalons
   * possibles, dates nulles comprises — `Delivered` y figure dès
   * l'enregistrement. Les compter livrerait tous les colis à la seconde où on
   * les enregistre.
   */
  test("un jalon SANS DATE n'a pas eu lieu", () => {
    const r = normaliser("preparation", {
      statut: "InfoReceived",
      jalons: [
        { etape: "PickedUp", date: null },
        { etape: "Delivered", date: null },
        { etape: "Returned", date: "" },
      ],
    });
    expect(r.etape, "un colis a été livré par un jalon vide").toBe("preparation");
  });

  test("le jalon le plus avancé gagne, quel que soit l'ordre du tableau", () => {
    const r = normaliser("preparation", {
      statut: null,
      jalons: [
        { etape: "Delivered", date: "2026-08-05T10:00:00Z" },
        { etape: "PickedUp", date: "2026-08-01T10:00:00Z" },
      ],
    });
    expect(r.etape).toBe("livre");
  });

  test("un retour n'est pas une livraison", () => {
    const r = normaliser("en_transit", {
      statut: null,
      jalons: [{ etape: "Returned", date: "2026-08-05T10:00:00Z" }],
    });
    expect(r.etape).toBe("en_transit");
  });

  test("aucune information du tout laisse tout en place", () => {
    expect(normaliser("expedie", AUCUN_JALON).etape).toBe("expedie");
    expect(normaliser("expedie", AUCUN_JALON).inconnu).toBe(false);
  });
});

describe("Les points de passage", () => {
  const BRUTS = [
    { instant: "2026-08-01T10:00:00Z", description: "Pris en charge", lieu: "Shenzhen" },
    { instant: "2026-08-05T08:00:00Z", description: "Arrivé au centre de tri", lieu: "Paris" },
    // Doublon exact : le fournisseur renvoie l'historique COMPLET à chaque appel.
    { instant: "2026-08-01T10:00:00Z", description: "Pris en charge", lieu: "Shenzhen" },
    { instant: "2026-08-03T12:00:00Z", description: "Départ du pays d'origine", lieu: null },
  ];

  test("ordonnés du plus récent au plus ancien, sans doublon", () => {
    const p = assemblerPassages(BRUTS);
    expect(p.points.length, "la sonde n'inspecte rien").toBe(3);
    expect(p.points.map((x) => x.description)).toEqual([
      "Arrivé au centre de tri",
      "Départ du pays d'origine",
      "Pris en charge",
    ]);
    expect(p.ecartes, "le doublon n'a pas été compté").toBe(1);
  });

  test("les bornes datent le colis", () => {
    const p = assemblerPassages(BRUTS);
    expect(p.dernierMouvement?.toISOString()).toBe("2026-08-05T08:00:00.000Z");
    expect(p.premierMouvement?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  /**
   * `new Date("n'importe quoi")` ne LÈVE PAS : elle rend une date invalide, qui
   * se propage ensuite dans des comparaisons rendant toutes `false`. Le colis
   * paraîtrait immobile pour toujours, sans qu'aucune erreur ne soit levée.
   */
  test("une date illisible écarte le point au lieu de contaminer le reste", () => {
    const p = assemblerPassages([
      { instant: "pas une date", description: "Scan douteux" },
      { instant: "2026-08-05T08:00:00Z", description: "Bon scan" },
      { instant: "2026-08-06T08:00:00Z", description: "   " },
    ]);
    expect(p.points.length).toBe(1);
    expect(p.ecartes).toBe(2);
    expect(p.dernierMouvement?.toISOString()).toBe("2026-08-05T08:00:00.000Z");
  });

  test("le plafond garde les plus RÉCENTS, et les bornes restent justes", () => {
    const beaucoup = Array.from({ length: 40 }, (_, i) => ({
      instant: new Date(Date.UTC(2026, 7, 1, i)).toISOString(),
      description: "Scan " + String(i),
    }));
    const p = assemblerPassages(beaucoup, 5);

    expect(p.points.length).toBe(5);
    expect(p.points[0]?.description).toBe("Scan 39");
    // Le premier mouvement est calculé AVANT le plafond : c'est lui qui date le
    // départ, et c'est exactement celui que le plafond couperait.
    expect(p.premierMouvement?.toISOString()).toBe(new Date(Date.UTC(2026, 7, 1, 0)).toISOString());
  });

  test("aucun point du tout ne rend pas de date inventée", () => {
    const p = assemblerPassages([]);
    expect(p.points).toEqual([]);
    expect(p.dernierMouvement).toBeNull();
    expect(p.premierMouvement).toBeNull();
  });
});

describe("Le silence", () => {
  const T = (jours: number): Date => new Date(Date.UTC(2026, 7, 20, 12) - jours * 86_400_000);
  const MAINTENANT = new Date(Date.UTC(2026, 7, 20, 12));

  test("aucun mouvement n'est pas un silence, c'est un début", () => {
    expect(decrireSilence(null, MAINTENANT)).toEqual({ etat: "aucun-mouvement" });
  });

  test("en deçà du seuil, le silence n'est pas nommé", () => {
    const s = decrireSilence(T(SEUIL_SILENCE_JOURS - 1), MAINTENANT);
    expect(s.etat).toBe("recent");
  });

  test("AU SEUIL EXACT, il l'est", () => {
    // La borne est vérifiée des deux côtés : un seuil testé d'un seul côté laisse
    // passer un décalage d'un jour, qui est exactement l'erreur qu'on fait.
    const s = decrireSilence(T(SEUIL_SILENCE_JOURS), MAINTENANT);
    expect(s.etat).toBe("silencieux");
    expect(s.etat === "silencieux" ? s.jours : -1).toBe(SEUIL_SILENCE_JOURS);
  });

  test("les jours sont arrondis vers le BAS", () => {
    // 3 jours et 20 heures se disent « 3 jours ». Arrondir à 4 affirmerait un
    // jour qui n'a pas eu lieu, sur le seul élément de la page qui change
    // quotidiennement.
    const presque = new Date(MAINTENANT.getTime() - (3 * 86_400_000 + 20 * 3_600_000));
    const s = decrireSilence(presque, MAINTENANT);
    expect(s.etat === "recent" ? s.jours : -1).toBe(3);
  });

  test("un scan daté dans le futur ne rend pas un nombre négatif", () => {
    // Les transporteurs datent dans leur fuseau, et un décalage traverse
    // régulièrement minuit. « il y a -1 jour » s'afficherait tel quel.
    const futur = new Date(MAINTENANT.getTime() + 5 * 3_600_000);
    const s = decrireSilence(futur, MAINTENANT);
    expect(s.etat === "recent" ? s.jours : -1).toBe(0);
  });
});

describe("La cadence d'interrogation", () => {
  const MAINTENANT = new Date(Date.UTC(2026, 7, 20, 12));
  const ilYA = (jours: number): Date => new Date(MAINTENANT.getTime() - jours * 86_400_000);

  const base: EtatColis = {
    enregistreLe: ilYA(1),
    dernierMouvement: null,
    derniereInterrogation: null,
    interrogationsVides: 0,
    etape: "preparation",
    abandonneLe: null,
  };

  test("la PREMIÈRE interrogation est immédiate", () => {
    // Un vendeur qui colle un numéro et ne voit rien pendant quatre heures
    // conclut que ça ne marche pas — et rien ne le détrompe.
    const d = decider(base, MAINTENANT);
    expect(d).toEqual({ action: "interroger", motif: "premiere" });
  });

  test("un colis livré ne s'interroge plus", () => {
    expect(decider({ ...base, etape: "livre" }, MAINTENANT).action).toBe("terminer");
  });

  test("un colis abandonné ne se réveille pas tout seul", () => {
    expect(
      decider({ ...base, abandonneLe: ilYA(1), derniereInterrogation: ilYA(1) }, MAINTENANT).action,
    ).toBe("terminer");
  });

  test("l'intervalle s'ALLONGE avec le silence, et reste borné", () => {
    const paliers = [0, 1, 3, 7, 30].map(intervalleHeures);
    expect(paliers).toEqual([...paliers].sort((a, b) => a - b));
    expect(paliers[paliers.length - 1]).toBe(24);
    // Contre-test : l'intervalle n'est pas constant, sinon « il s'allonge »
    // serait vrai de la même façon qu'un mur est croissant.
    expect(new Set(paliers).size).toBeGreaterThan(1);
  });

  /*
   * LES DEUX CÔTÉS DE LA MÊME BORNE, sur un palier NOMMÉ. Le colis a bougé il y
   * a moins d'un jour, donc l'intervalle vaut trois heures. Écrire « cinq heures
   * suffisent » sans dire de quel palier on parle produirait un test qui casse
   * au premier ajustement de la cadence — et qu'on corrigerait alors sans savoir
   * ce qu'il éprouvait.
   */
  const bougeRecemment = { ...base, dernierMouvement: new Date(MAINTENANT.getTime() - 3_600_000) };

  test("entre deux interrogations, on attend", () => {
    expect(intervalleHeures(0)).toBe(3);
    const d = decider(
      { ...bougeRecemment, derniereInterrogation: new Date(MAINTENANT.getTime() - 3_600_000) },
      MAINTENANT,
    );
    expect(d.action).toBe("attendre");
  });

  test("passé l'intervalle, on redemande", () => {
    const d = decider(
      { ...bougeRecemment, derniereInterrogation: new Date(MAINTENANT.getTime() - 4 * 3_600_000) },
      MAINTENANT,
    );
    expect(d).toEqual({ action: "interroger", motif: "cadence" });
  });

  test("et la cadence RALENTIT vraiment quand le colis se tait", () => {
    // Contre-test du palier : à trente jours de silence, quatre heures ne
    // suffisent plus. Sans lui, un intervalle constant de trois heures passerait
    // les deux tests précédents.
    const vieux = { ...base, dernierMouvement: ilYA(30) };
    const d = decider(
      { ...vieux, derniereInterrogation: new Date(MAINTENANT.getTime() - 4 * 3_600_000) },
      MAINTENANT,
    );
    expect(d.action).toBe("attendre");
  });
});

describe("L'abandon, et ce qui ne doit PAS le déclencher", () => {
  const MAINTENANT = new Date(Date.UTC(2026, 7, 20, 12));
  const ilYA = (jours: number): Date => new Date(MAINTENANT.getTime() - jours * 86_400_000);

  const jamaisBouge: EtatColis = {
    enregistreLe: ilYA(FENETRE_VIDE_JOURS + 1),
    dernierMouvement: null,
    derniereInterrogation: ilYA(1),
    interrogationsVides: 5,
    etape: "preparation",
    abandonneLe: null,
  };

  test("au-delà de la fenêtre, un numéro qui n'a JAMAIS rien dit est abandonné", () => {
    expect(decider(jamaisBouge, MAINTENANT)).toEqual({
      action: "abandonner",
      motif: "silence-initial",
    });
  });

  test("trop d'interrogations vides abandonnent aussi, dans la fenêtre", () => {
    expect(
      decider(
        {
          ...jamaisBouge,
          enregistreLe: ilYA(2),
          interrogationsVides: INTERROGATIONS_VIDES_MAX,
        },
        MAINTENANT,
      ),
    ).toEqual({ action: "abandonner", motif: "trop-de-vides" });
  });

  /**
   * LE CAS QUI PIÈGE, et le seul qui compte vraiment ici. Un colis qui a bougé
   * UNE FOIS puis s'est tu pendant des semaines — le blocage en douane — ne doit
   * JAMAIS être abandonné : il est en transit quelque part, et c'est précisément
   * le client qui a le plus besoin de son suivi.
   */
  test("un colis qui a bougé UNE FOIS n'est jamais abandonné pour silence", () => {
    const bloque: EtatColis = {
      enregistreLe: ilYA(60),
      dernierMouvement: ilYA(45),
      derniereInterrogation: ilYA(2),
      interrogationsVides: 40,
      etape: "en_transit",
      abandonneLe: null,
    };
    const d = decider(bloque, MAINTENANT);
    expect(d.action, "un colis bloqué en douane a été abandonné").not.toBe("abandonner");
    expect(d).toEqual({ action: "interroger", motif: "cadence" });
  });

  test("dans la fenêtre et sans trop de vides, on continue simplement", () => {
    // Contre-test de l'abandon : sans lui, « abandonner tout le temps » passerait
    // les deux premiers tests de ce bloc.
    const d = decider(
      { ...jamaisBouge, enregistreLe: ilYA(2), interrogationsVides: 2 },
      MAINTENANT,
    );
    expect(d.action).not.toBe("abandonner");
  });
});

describe("Les étapes de la frise sont bien celles du produit", () => {
  test("quatre, et dans cet ordre", () => {
    // La frise reste à QUATRE étapes : la granularité vit dans le détail du
    // suivi. Une cinquième valeur ajoutée ici passerait inaperçue et casserait
    // l'affichage de la page publique, qui itère sur cette liste.
    const attendues: readonly Etape[] = ["preparation", "expedie", "en_transit", "livre"];
    expect(ETAPES).toEqual(attendues);
  });
});
