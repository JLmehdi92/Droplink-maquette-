import { describe, expect, test } from "vitest";
import { lireSurveillance } from "@/lib/audit/surveillance";

/**
 * L'ÉCRAN DE SURVEILLANCE NE TOMBE PAS QUAND CE QU'IL SURVEILLE TOMBE.
 *
 * ⚠️ QUATRIÈME OCCURRENCE DE LA MÊME FAMILLE, ET C'EST POURQUOI ELLE EST
 * TRAITÉE ICI PLUTÔT QU'ATTENDUE. Trois lectures dans un `Promise.all`, chacune
 * levant sur TOUTE erreur : un `fetch failed` emporte l'écran entier. C'est le
 * même défaut que le panneau, sur l'écran voisin — et son propre commentaire
 * disait déjà *« un écran qu'on ouvre précisément quand quelque chose semble
 * aller mal »*, ce qui est l'argument exact contre le 500.
 *
 * ⚠️ ET IL PORTE UN MENSONGE QUE LE PANNEAU N'AVAIT PAS. `surveillees` est
 * DÉRIVÉ de `taches` : la jointure est menée par l'inventaire des tâches
 * attendues, si bien qu'une lecture muette ferait afficher « jamais exécutée »
 * pour CHACUNE. Sur l'écran dont tout le rôle est de dire si les planificateurs
 * tournent, c'est la pire des sorties possibles — elle envoie chercher une
 * panne inexistante au moment précis où le réseau en cache une vraie.
 */

const LECTURES = ["sante_infrastructure", "etat_veilleur", "colis_par_jour_admin"] as const;

/** Un client dont UNE seule fonction échoue, les autres répondant normalement. */
function surveillanceAvec(enEchec: string, message: string) {
  const reponses: Record<string, unknown> = {
    sante_infrastructure: [{ genre: "stockage", indicateur: "octets", valeur: 0 }],
    etat_veilleur: [
      { source: "suivi-cadence", dernier_battement: "2026-09-04T00:00:00Z", minutes: 3, etat: "actif" },
    ],
    colis_par_jour_admin: [{ jour: "2026-09-04", n: 0 }],
  };
  return {
    rpc: (nom: string) =>
      Promise.resolve(
        nom === enEchec
          ? { data: null, error: { message } }
          : { data: reponses[nom] ?? null, error: null },
      ),
  } as never;
}

describe("L'écran de surveillance, lecture par lecture", () => {
  test("CONTRE-TEST : sans panne, tout se lit", async () => {
    // ⚠️ EN PREMIER. Sans lui, « ne lève pas » serait vrai d'un écran mort.
    const s = await lireSurveillance(surveillanceAvec("aucune", ""), 90);
    expect(s.indicateurs).not.toBeNull();
    expect(s.taches).not.toBeNull();
    expect(s.colisParJour).not.toBeNull();
    expect(s.surveillees).not.toBeNull();
    expect(s.surveillees?.length ?? 0).toBeGreaterThan(0);
  });

  test("la sonde inventorie réellement les trois lectures", () => {
    expect(LECTURES.length).toBe(3);
  });

  test("AUCUNE panne de transport n'emporte l'écran entier", async () => {
    for (const lecture of LECTURES) {
      const r = await lireSurveillance(
        surveillanceAvec(lecture, "TypeError: fetch failed"),
        90,
      ).catch((e: unknown) => e as Error);
      expect(
        r instanceof Error,
        `« ${lecture} » en panne fait tomber TOUT l'écran : ${r instanceof Error ? r.message : ""}`,
      ).toBe(false);
    }
  });

  test("LE MENSONGE À NE PAS DIRE : une lecture muette n'invente pas « jamais exécutée »", async () => {
    /*
     * C'est le contrôle qui distingue cet écran du panneau. La jointure est
     * menée par l'inventaire des tâches ATTENDUES : sur une liste vide, chacune
     * ressortirait « jamais_executee ». Sur l'écran dont tout le rôle est de
     * dire si les planificateurs battent, ce serait une alerte inventée — et
     * *une alerte qui se trompe est une alerte qu'on apprend à ignorer.*
     */
    const s = await lireSurveillance(surveillanceAvec("etat_veilleur", "fetch failed"), 90);
    expect(s.taches, "les tâches devraient être NOMMÉES illisibles").toBeNull();
    expect(s.surveillees, "l'écran affirmerait « jamais exécutée » pour chaque tâche").toBeNull();
    expect(s.surveillees).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ etat: "jamais_executee" })]),
    );
  });

  test("chaque section touchée vaut `null`, jamais une valeur neutre", async () => {
    const sansSante = await lireSurveillance(surveillanceAvec("sante_infrastructure", "fetch failed"), 90);
    expect(sansSante.indicateurs).toBeNull();
    expect(sansSante.indicateurs).not.toEqual([]);

    const sansColis = await lireSurveillance(surveillanceAvec("colis_par_jour_admin", "fetch failed"), 90);
    expect(sansColis.colisParJour).toBeNull();
    // Une frise vide se lirait « aucun colis pris en charge en 14 jours », ce
    // qui est une affirmation, et une affirmation qu'on n'a pas mesurée.
    expect(sansColis.colisParJour).not.toEqual([]);
  });

  test("L'AUTRE SENS : une erreur APPLICATIVE continue de lever", async () => {
    for (const lecture of LECTURES) {
      await expect(
        lireSurveillance(surveillanceAvec(lecture, "permission denied for function " + lecture), 90),
        `« ${lecture} » avale une erreur applicative comme une panne réseau`,
      ).rejects.toThrow();
    }
  });
});
