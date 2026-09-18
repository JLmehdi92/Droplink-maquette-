import { describe, expect, test, vi } from "vitest";

/*
 * Le fournisseur n'est JAMAIS appelé ici : la prise en charge est remplacée,
 * et on ne regarde que le verdict que `attacherColis` en tire.
 */
vi.mock("@/lib/tracking/prise-en-charge", () => ({
  prendreEnCharge: vi.fn(() => Promise.resolve({ statut: "pris_en_charge" })),
}));
vi.mock("next/server", () => ({ after: (f: () => unknown) => void f() }));

const { attacherColis } = await import("@/lib/tracking/attache");

/** Un client qui rend la commande, puis la ligne de la RPC qu'on lui donne. */
function client(ligne: Record<string, unknown>) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { tracking_number: "LX1", carrier_code: null }, error: null }),
        }),
      }),
    }),
    rpc: () => Promise.resolve({ data: [ligne], error: null }),
  } as unknown as Parameters<typeof attacherColis>[0];
}

/**
 * LE REPLI QUAND LA BASE N'EST PAS ENCORE MIGRÉE.
 *
 * Les migrations s'appliquent à la main : un déploiement peut précéder la
 * migration 164, et la base rend alors une ligne SANS `a_inscrire`. Lu tel
 * quel, le champ absent valait « faux » — plus aucun colis neuf pris en
 * charge, sans une erreur nulle part.
 */
describe("Le verdict de prise en charge", () => {
  test("base NON migrée : un colis neuf part quand même (repli sur `cree`)", async () => {
    const r = await attacherColis(client({ parcel_id: "p1", cree: true }), "o1");
    expect(r).toMatchObject({ statut: "attache", aInscrire: true });
  });

  test("base NON migrée : un colis existant ne part pas", async () => {
    const r = await attacherColis(client({ parcel_id: "p1", cree: false }), "o1");
    expect(r).toMatchObject({ statut: "attache", aInscrire: false });
  });

  test("base migrée : `a_inscrire` décide, même quand rien n'est créé (la relance)", async () => {
    const r = await attacherColis(client({ parcel_id: "p1", cree: false, a_inscrire: true }), "o1");
    expect(r).toMatchObject({ statut: "attache", aInscrire: true });
  });

  test("base migrée : `a_inscrire` faux l'emporte sur tout repli", async () => {
    const r = await attacherColis(client({ parcel_id: "p1", cree: false, a_inscrire: false }), "o1");
    expect(r).toMatchObject({ statut: "attache", aInscrire: false });
  });
});
