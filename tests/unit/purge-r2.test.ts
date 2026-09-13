import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LA PURGE DES OBJETS R2 — sans réseau, et c'est délibéré : les seuls
 * identifiants R2 de cette machine sont ceux de la PRODUCTION. On éprouve donc
 * la RÈGLE, pas le fournisseur : ce qu'une clé emporte, et quand elle est
 * déclarée purgée. `DELETE` lui-même est éprouvé par `pnpm check:r2`.
 */

const supprimees: string[] = [];
let echouer: (cle: string) => boolean = () => false;

vi.mock("@/lib/storage/r2", () => ({
  supprimer: vi.fn(async (cle: string) => {
    if (echouer(cle)) throw new Error("R2 indisponible pour " + cle);
    supprimees.push(cle);
  }),
}));

const { purgerCles } = await import("@/lib/storage/purge");

const MEDIA = "medias/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg";
const LOGO = "logos/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.png";

beforeEach(() => {
  supprimees.length = 0;
  echouer = () => false;
});

describe("purgerCles", () => {
  test("une clé de média emporte sa vignette et sa couverture ; un logo, lui seul", async () => {
    const { purgees, echecs } = await purgerCles([MEDIA, LOGO]);
    expect(echecs).toBe(0);
    expect([...purgees].sort()).toEqual([LOGO, MEDIA].sort());
    expect(supprimees.filter((c) => c.startsWith(MEDIA.replace(/\.jpg$/, "")))).toHaveLength(3);
    expect(supprimees.some((c) => c.includes("vignette"))).toBe(true);
    expect(supprimees.some((c) => c.includes("couverture"))).toBe(true);
    expect(supprimees.filter((c) => c.startsWith("logos/"))).toEqual([LOGO]);
  });

  test("une clé dont UNE dérivée échoue n'est PAS déclarée purgée — elle reste en file", async () => {
    echouer = (cle) => cle.includes("vignette");
    const { purgees, echecs } = await purgerCles([MEDIA, LOGO]);
    expect(purgees).toEqual([LOGO]);
    expect(echecs).toBe(1);
  });

  test("rien à purger, rien d'appelé", async () => {
    expect(await purgerCles([])).toEqual({ purgees: [], echecs: 0 });
    expect(supprimees).toHaveLength(0);
  });
});
