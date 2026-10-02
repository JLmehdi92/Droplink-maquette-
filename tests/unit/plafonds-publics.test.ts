import { describe, expect, test, vi } from "vitest";
import { lirePlafondsPublics } from "@/lib/page-publique/plafonds";

/**
 * LES PLAFONDS DE LA LANDING : lus en base, ou absents — JAMAIS un nombre de
 * secours. La lecture réelle (droits `anon` des deux fonctions) est éprouvée par
 * les suites RLS ; ici, ce que la page fait de la réponse.
 */
function client(reponses: Record<string, { data: unknown; error: { message: string } | null } | Error>) {
  return {
    rpc: vi.fn(async (nom: "lire_plafond_gratuit_a_vie" | "lire_plafond_commandes") => {
      const r = reponses[nom];
      if (r instanceof Error) throw r;
      return r ?? { data: null, error: { message: "absent" } };
    }),
  };
}

describe("lirePlafondsPublics", () => {
  test("CONTRE-TEST : les deux nombres lus sont rendus tels quels", async () => {
    const c = client({
      lire_plafond_gratuit_a_vie: { data: 5, error: null },
      lire_plafond_commandes: { data: 300, error: null },
    });
    expect(await lirePlafondsPublics(c)).toEqual({ gratuitAVie: 5, proParMois: 300 });
    expect(c.rpc).toHaveBeenCalledTimes(2);
  });

  test("une erreur de la base rend null, et elle est écrite au journal", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = client({
      lire_plafond_gratuit_a_vie: { data: null, error: { message: "permission denied" } },
      lire_plafond_commandes: { data: 300, error: null },
    });
    expect(await lirePlafondsPublics(c)).toEqual({ gratuitAVie: null, proParMois: 300 });
    expect(journal).toHaveBeenCalledWith(expect.stringContaining("lire_plafond_gratuit_a_vie"));
    journal.mockRestore();
  });

  test("une panne de transport rend null, sans emporter la page", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = client({
      lire_plafond_gratuit_a_vie: { data: 5, error: null },
      lire_plafond_commandes: new Error("fetch failed"),
    });
    expect(await lirePlafondsPublics(c)).toEqual({ gratuitAVie: 5, proParMois: null });
    journal.mockRestore();
  });

  test("une valeur qui n'est pas un entier positif n'est pas un plafond", async () => {
    const c = client({
      lire_plafond_gratuit_a_vie: { data: "5", error: null },
      lire_plafond_commandes: { data: -1, error: null },
    });
    expect(await lirePlafondsPublics(c)).toEqual({ gratuitAVie: null, proParMois: null });
  });
});
