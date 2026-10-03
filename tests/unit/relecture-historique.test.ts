import { describe, expect, test, vi } from "vitest";
import { DELAIS_RELECTURE_MS, relireJusquaNouveau } from "@/lib/commandes/relecture-historique";

/**
 * L'HISTORIQUE RELU JUSQU'À CE QUE LA LIGNE NOUVELLE SOIT LÀ (contre-audit du 03/10/2026).
 * Le journal s'écrit après la réponse : une seule relecture à 700 ms pouvait le devancer.
 */

function scenario(reponses: Array<{ plusRecent: string } | null>) {
  const attentes: number[] = [];
  let appels = 0;
  return {
    attentes,
    appels: () => appels,
    options: (connu: string | null, abandonne = () => false) => ({
      relire: async () => reponses[appels++] ?? null,
      connu,
      attendre: async (ms: number) => {
        attentes.push(ms);
      },
      abandonne,
    }),
  };
}

describe("relireJusquaNouveau", () => {
  test("les relectures tombent à 700 ms, 1,5 s puis 3 s après le geste", () => {
    expect(DELAIS_RELECTURE_MS).toEqual([700, 1500, 3000]);
  });

  test("s'arrête dès que la ligne la plus récente a changé", async () => {
    const s = scenario([{ plusRecent: "a" }, { plusRecent: "b" }, { plusRecent: "c" }]);
    const relue = await relireJusquaNouveau(s.options("a"));
    expect(relue).toEqual({ plusRecent: "b" });
    expect(s.appels()).toBe(2);
    expect(s.attentes).toEqual([700, 800]);
  });

  test("trois essais au plus, puis rien de neuf à montrer", async () => {
    const s = scenario([{ plusRecent: "a" }, { plusRecent: "a" }, { plusRecent: "a" }, { plusRecent: "z" }]);
    expect(await relireJusquaNouveau(s.options("a"))).toBeNull();
    expect(s.appels()).toBe(3);
    expect(s.attentes).toEqual([700, 800, 1500]);
  });

  test("une lecture vide (null) n'arrête pas la série", async () => {
    const s = scenario([null, { plusRecent: "b" }]);
    expect(await relireJusquaNouveau(s.options("a"))).toEqual({ plusRecent: "b" });
  });

  test("abandonnée (nouveau geste, autre commande), elle ne rend rien et ne relit plus", async () => {
    let abandon = false;
    const s = scenario([{ plusRecent: "b" }]);
    const opts = s.options("a", () => abandon);
    abandon = true;
    expect(await relireJusquaNouveau(opts)).toBeNull();
    expect(s.appels()).toBe(0);
  });

  test("contre-test : aucune ligne connue, la première relecture suffit", async () => {
    const s = scenario([{ plusRecent: "a" }]);
    expect(await relireJusquaNouveau(s.options(null))).toEqual({ plusRecent: "a" });
  });
});

const lignes = vi.hoisted(() => ({ valeur: [] as Array<{ id: string }> }));
const profil = vi.hoisted(() => ({ valeur: null as null | { statut: string } }));
vi.mock("@/lib/comptes/profil", () => ({ lireProfilVendeur: async () => profil.valeur }));
vi.mock("@/lib/supabase/server", () => ({ creerClientServeur: async () => ({}) }));
vi.mock("@/lib/commandes/historique", () => ({ lireHistorique: async () => lignes.valeur }));
vi.mock("@/components/commandes/historique-commande", () => ({ HistoriqueCommande: () => null }));

describe("relireHistorique (l'action)", () => {
  const ID = "4c676d85-0000-4000-8000-000000000001";

  test("rend le bloc ET l'identifiant de la ligne la plus récente", async () => {
    profil.valeur = { statut: "active" };
    lignes.valeur = [{ id: "plus-recente" }, { id: "plus-ancienne" }];
    const { relireHistorique } = await import("@/app/[locale]/(app)/commandes/[id]/actions");
    const r = await relireHistorique(ID);
    expect(r?.plusRecent).toBe("plus-recente");
    expect(r?.bloc).toBeTruthy();
  });

  test("rien sans session, sur un identifiant invalide, ou sur une lecture vide", async () => {
    const { relireHistorique } = await import("@/app/[locale]/(app)/commandes/[id]/actions");
    profil.valeur = null;
    lignes.valeur = [{ id: "x" }];
    expect(await relireHistorique(ID)).toBeNull();
    profil.valeur = { statut: "active" };
    expect(await relireHistorique("pas-un-uuid")).toBeNull();
    lignes.valeur = [];
    expect(await relireHistorique(ID)).toBeNull();
  });
});
