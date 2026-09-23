import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LA CADENCE DU SUIVI NE PAIE PAS POUR RIEN.
 *
 * `passerLaCadence` décide, colis par colis, lesquels déclenchent une
 * interrogation du fournisseur de suivi — et chaque interrogation se paie. La
 * couverture la donnait à 0 % le 23/09/2026 : les fonctions SQL qu'elle appelle
 * sont éprouvées sur la vraie base (`tests/rls/suivi-*`), mais sa LOGIQUE — qui
 * a droit à un appel payant, qui n'y a pas droit — n'était exercée par rien.
 *
 * ⚠️ ON SUBSTITUE SES DÉPENDANCES, ET C'EST PRÉCISÉMENT CE QU'IL FAUT ICI. La
 * règle du dépôt « jamais de mock » vise la RLS : un test qui simule la base ne
 * teste pas la base. Ce qu'on éprouve ici n'est pas la base, c'est la décision
 * d'appeler un tiers payant ; la substitution est ce qui permet de COMPTER ces
 * appels sans en payer un seul.
 */

// ── Les dépendances, remplacées par des témoins qui comptent ────────────────

const appels = {
  interroger: vi.fn(),
  prendreEnCharge: vi.fn(),
  ingerer: vi.fn(),
  rpc: [] as string[],
};

/** Ce que la base répond, RPC par RPC. Réglé par chaque test. */
let reponses: Record<string, { data: unknown; error: { message: string } | null }> = {};

vi.mock("@/lib/supabase/system", () => ({
  creerClientSysteme: () => ({
    rpc: async (nom: string) => {
      appels.rpc.push(nom);
      return reponses[nom] ?? { data: null, error: null };
    },
  }),
}));
vi.mock("@/lib/tracking/provider/dix-sept-track", () => ({
  dixSeptTrack: { interroger: (...a: unknown[]) => appels.interroger(...a) },
}));
vi.mock("@/lib/tracking/prise-en-charge", () => ({
  prendreEnCharge: (...a: unknown[]) => appels.prendreEnCharge(...a),
}));
vi.mock("@/lib/tracking/ingestion", () => ({
  ingererEtat: (...a: unknown[]) => appels.ingerer(...a),
}));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre: async () => true }));
vi.mock("@/lib/veille/passer", () => ({ veillerSur: async () => undefined }));

/** La décision de l'ordonnanceur, réglée par chaque test. */
let decision: { action: string; motif?: string } = { action: "interroger" };
vi.mock("@/lib/tracking/schedule", () => ({ decider: () => decision }));
vi.mock("@/lib/tracking/silence", () => ({
  decrireSilence: () => ({ etat: "recent", jours: 0 }),
}));

const { passerLaCadence } = await import("@/lib/tracking/cadence");

// ── Le jeu ──────────────────────────────────────────────────────────────────

function colis(id: string, enregistre = true) {
  return {
    id,
    tracking_number: "LP" + id.padStart(10, "0") + "FR",
    carrier_code: 6051,
    registered_at: enregistre ? "2026-09-01T10:00:00.000Z" : null,
    last_movement_at: "2026-09-20T10:00:00.000Z",
    last_query_at: "2026-09-21T10:00:00.000Z",
    empty_count: 0,
    normalized_status: "en_transit",
  };
}

const MAINTENANT = new Date("2026-09-23T12:00:00.000Z");

beforeEach(() => {
  appels.interroger.mockReset().mockResolvedValue({ statut: "ok", evenements: [] });
  appels.prendreEnCharge.mockReset().mockResolvedValue({ statut: "pris" });
  appels.ingerer.mockReset().mockResolvedValue(undefined);
  appels.rpc = [];
  decision = { action: "interroger" };
  reponses = {
    lire_suivi_actif: { data: true, error: null },
    colis_a_interroger: { data: [colis("1"), colis("2")], error: null },
    marquer_interroge: { data: null, error: null },
    purger_donnees_de_suivi: { data: [{ instantanes: 0, notifications: 0 }], error: null },
    battre: { data: null, error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("La cadence du suivi ne paie pas pour rien", () => {
  test("CONTRE-TEST : deux colis à interroger, deux appels au fournisseur", async () => {
    // Sans lui, une cadence qui n'interrogerait plus RIEN passerait tous les
    // contrôles de ce fichier — et c'est exactement le défaut du 02/09/2026 :
    // « la cadence de suivi n'interrogeait AUCUN colis ».
    const bilan = await passerLaCadence(MAINTENANT);
    expect(appels.interroger).toHaveBeenCalledTimes(2);
    expect(appels.ingerer).toHaveBeenCalledTimes(2);
    expect(bilan).toMatchObject({ examines: 2, interroges: 2, indisponibles: 0 });
  });

  test("⚠️ INTERRUPTEUR COUPÉ : aucun appel payant, et la liste n'est même pas lue", async () => {
    /*
     * L'interrupteur est le frein d'urgence : quand le budget du fournisseur est
     * épuisé, c'est lui qu'on abaisse. Un frein qui laisserait partir « juste la
     * liste » ou « juste les colis déjà enregistrés » ne freinerait rien.
     */
    reponses.lire_suivi_actif = { data: false, error: null };
    const bilan = await passerLaCadence(MAINTENANT);
    expect(appels.interroger).not.toHaveBeenCalled();
    expect(appels.prendreEnCharge).not.toHaveBeenCalled();
    expect(appels.rpc).not.toContain("colis_a_interroger");
    expect(bilan.examines).toBe(0);
    // Et le battement part quand même : un arrêt voulu n'est pas une panne, la
    // veille ne doit pas crier au planificateur mort.
    expect(appels.rpc).toContain("battre");
  });

  test("un interrupteur ILLISIBLE laisse passer — et le DIT", async () => {
    // Décision écrite dans le code : refuser sur une lecture ratée arrêterait le
    // suivi de tous les clients pour un incident qui ne les regarde pas. Ce test
    // fixe ce choix pour qu'il ne s'inverse pas en silence.
    reponses.lire_suivi_actif = { data: null, error: { message: "délai dépassé" } };
    await passerLaCadence(MAINTENANT);
    expect(appels.interroger).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("interrupteur illisible"));
  });

  test("⚠️ DATE D'INTERROGATION NON POSÉE : le colis est SAUTÉ, pas repayé en boucle", async () => {
    /*
     * LE CONTRÔLE QUI PROTÈGE LE BUDGET. Si la date d'interrogation n'est pas
     * écrite, le colis ressort en tête de la liste au passage suivant — et au
     * suivant. Interroger quand même reviendrait à payer le même colis à chaque
     * passage, indéfiniment, sans que rien ne le signale ailleurs qu'ici.
     */
    reponses.marquer_interroge = { data: null, error: { message: "verrou" } };
    const bilan = await passerLaCadence(MAINTENANT);
    expect(appels.interroger).not.toHaveBeenCalled();
    expect(bilan.interroges).toBe(0);
  });

  test("⚠️ UNE EXCEPTION DU FOURNISSEUR SUR UN COLIS N'ARRÊTE PAS LES AUTRES", async () => {
    /*
     * Un défaut qui en déclenche un autre : un seul numéro qui fait lever le
     * client HTTP, et sans le rattrapage, TOUS les colis suivants de la liste
     * restent sans nouvelles — alors qu'ils n'y sont pour rien.
     */
    appels.interroger
      .mockReset()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue({ statut: "ok", evenements: [] });
    const bilan = await passerLaCadence(MAINTENANT);
    expect(appels.interroger).toHaveBeenCalledTimes(2);
    expect(bilan).toMatchObject({ indisponibles: 1, interroges: 1 });
  });

  test("« attendre » et « terminer » ne déclenchent AUCUN appel", async () => {
    for (const action of ["attendre", "terminer"]) {
      appels.interroger.mockClear();
      decision = { action };
      await passerLaCadence(MAINTENANT);
      expect(appels.interroger, action).not.toHaveBeenCalled();
    }
  });

  test("un colis jamais enregistré passe par la prise en charge, pas par l'interrogation", async () => {
    // Interroger un colis que le fournisseur ne connaît pas encore paierait une
    // réponse vide ; il faut d'abord le lui confier.
    reponses.colis_a_interroger = { data: [colis("9", false)], error: null };
    const bilan = await passerLaCadence(MAINTENANT);
    expect(appels.prendreEnCharge).toHaveBeenCalledTimes(1);
    expect(appels.interroger).not.toHaveBeenCalled();
    expect(bilan.repris).toBe(1);
  });

  test("une liste illisible fait ÉCHOUER le passage au lieu de rendre « 0 colis »", async () => {
    // « Rien à interroger » et « je n'ai pas pu lire la liste » ne doivent pas se
    // ressembler : le premier est un bon jour, le second une panne.
    reponses.colis_a_interroger = { data: null, error: { message: "délai dépassé" } };
    await expect(passerLaCadence(MAINTENANT)).rejects.toThrow("cadence-liste-illisible");
    expect(appels.interroger).not.toHaveBeenCalled();
  });
});
