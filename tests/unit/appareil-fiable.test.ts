import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * L'APPAREIL FIABLE CÔTÉ SERVEUR (203) — le cookie et ses gestes.
 *
 * La base est éprouvée par `tests/rls/appareil-fiable.test.ts` (HMAC, garde,
 * révocation). Ici on éprouve le MODULE : ce qu'il pose en cookie, ce qu'il en
 * lit, et surtout ce qu'il fait quand la base refuse ou tombe — un chemin de
 * connexion ne doit JAMAIS casser parce qu'un appareil n'a pas pu devenir fiable.
 *
 * Tout est falsifiable : on regarde l'appel RPC réellement émis, le cookie
 * réellement posé, et le cookie réellement effacé.
 */

const etat = vi.hoisted(() => ({
  agent: "" as string,
  cookie: undefined as string | undefined,
  poses: [] as Array<{ nom: string; valeur: string; options: Record<string, unknown> }>,
  effaces: [] as string[],
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(etat.agent === "" ? {} : { "user-agent": etat.agent }),
  cookies: async () => ({
    get: (nom: string) => (nom === "dl_appareil" && etat.cookie !== undefined ? { value: etat.cookie } : undefined),
    set: (nom: string, valeur: string, options: Record<string, unknown>) => etat.poses.push({ nom, valeur, options }),
    delete: (nom: string) => etat.effaces.push(nom),
  }),
}));

import { poserPreuveAppareil, confirmerAppareilSiPresent } from "@/lib/auth/appareil-fiable";

type ClientFactice = { rpc: ReturnType<typeof vi.fn> };
function client(reponse: { data: unknown; error: unknown }): ClientFactice {
  return { rpc: vi.fn().mockResolvedValue(reponse) };
}

const AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36";

beforeEach(() => {
  etat.agent = "";
  etat.cookie = undefined;
  etat.poses = [];
  etat.effaces = [];
});
afterEach(() => vi.restoreAllMocks());

describe("poserPreuveAppareil", () => {
  test("pose un cookie « charge.signature » de 30 jours et passe l'agent BRUT", async () => {
    etat.agent = AGENT;
    const c = client({ data: { charge: "id|user|123", signature: "abcd" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await poserPreuveAppareil(c as any);

    expect(c.rpc).toHaveBeenCalledWith("emettre_preuve_appareil", { p_agent: AGENT });
    expect(etat.poses).toHaveLength(1);
    const pose = etat.poses[0]!;
    expect(pose.nom).toBe("dl_appareil");
    expect(pose.valeur).toBe("id|user|123.abcd");
    expect(pose.options.maxAge).toBe(30 * 24 * 60 * 60);
  });

  test("une erreur de la base ne pose AUCUN cookie et ne jette pas", async () => {
    const c = client({ data: null, error: { message: "boom" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(poserPreuveAppareil(c as any)).resolves.toBeUndefined();
    expect(etat.poses).toHaveLength(0);
  });

  test("une réponse mal formée (pas de signature) ne pose aucun cookie", async () => {
    const c = client({ data: { charge: "id|user|123" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await poserPreuveAppareil(c as any);
    expect(etat.poses).toHaveLength(0);
  });
});

describe("confirmerAppareilSiPresent", () => {
  test("sans cookie : rend false, n'appelle pas la base", async () => {
    const c = client({ data: true, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await confirmerAppareilSiPresent(c as any)).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  test("cookie sans séparateur : rend false sans appeler la base", async () => {
    etat.cookie = "chargesanspoint";
    const c = client({ data: true, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await confirmerAppareilSiPresent(c as any)).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });

  test("preuve valide : rend true, découpe au DERNIER point, garde le cookie", async () => {
    etat.cookie = "id|user|123.deadbeef";
    const c = client({ data: true, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await confirmerAppareilSiPresent(c as any)).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("confirmer_appareil_fiable", {
      p_charge: "id|user|123",
      p_signature: "deadbeef",
    });
    expect(etat.effaces).toHaveLength(0);
  });

  test("preuve refusée : rend false ET efface le cookie mort", async () => {
    etat.cookie = "id|user|123.mauvaise";
    const c = client({ data: false, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await confirmerAppareilSiPresent(c as any)).toBe(false);
    expect(etat.effaces).toContain("dl_appareil");
  });

  test("erreur de la base : rend false SANS effacer (best-effort, pas de perte à tort)", async () => {
    etat.cookie = "id|user|123.sig";
    const c = client({ data: null, error: { message: "panne" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await confirmerAppareilSiPresent(c as any)).toBe(false);
    expect(etat.effaces).toHaveLength(0);
  });
});
