import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LES MOTS DE PASSE DÉJÀ FUITÉS SONT REFUSÉS — décision de Wassim, 23/09/2026.
 *
 * Sans ce contrôle, le bourrage d'identifiants est gratuit : un attaquant essaie
 * les mots de passe des fuites publiques, et ceux que les gens réutilisent
 * passent. Supabase propose l'option, PAYANTE ; la même base (Have I Been
 * Pwned) s'interroge gratuitement par « k-anonymat » : seuls les CINQ premiers
 * caractères de l'empreinte SHA-1 partent, jamais le mot de passe, jamais
 * l'empreinte entière.
 */

const { verifierFuite, BORNE_FUITES_MS } = await import("@/lib/auth/fuites");

const MOT_DE_PASSE = "un-mot-de-passe-de-test-tres-long";
const EMPREINTE = createHash("sha1").update(MOT_DE_PASSE).digest("hex").toUpperCase();
const PREFIXE = EMPREINTE.slice(0, 5);
const SUFFIXE = EMPREINTE.slice(5);

let appels: { url: string; init: RequestInit | undefined }[] = [];
function repondre(corps: string, statut = 200): typeof fetch {
  return async (url, init) => {
    appels.push({ url: String(url), init });
    return new Response(corps, { status: statut });
  };
}

beforeEach(() => {
  appels = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("La vérification des fuites", () => {
  test("⚠️ NI LE MOT DE PASSE NI SON EMPREINTE ENTIÈRE NE QUITTENT LE SERVEUR", async () => {
    await verifierFuite(MOT_DE_PASSE, repondre(""));
    expect(appels).toHaveLength(1);
    const tout = JSON.stringify(appels);
    expect(tout).not.toContain(MOT_DE_PASSE);
    expect(tout).not.toContain(SUFFIXE);
    expect(appels[0]?.url).toBe(`https://api.pwnedpasswords.com/range/${PREFIXE}`);
  });

  test("le rembourrage est demandé — la taille de la réponse ne trahit pas le préfixe", async () => {
    await verifierFuite(MOT_DE_PASSE, repondre(""));
    expect(new Headers(appels[0]?.init?.headers).get("Add-Padding")).toBe("true");
  });

  test("CONTRE-TEST : un mot de passe présent dans les fuites est reconnu", async () => {
    const corps = `0000000000000000000000000000000000A:3\r\n${SUFFIXE}:48213\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1`;
    expect(await verifierFuite(MOT_DE_PASSE, repondre(corps))).toBe("fuite");
  });

  test("un mot de passe absent des fuites est sain", async () => {
    expect(await verifierFuite(MOT_DE_PASSE, repondre("0000000000000000000000000000000000A:3"))).toBe("sain");
  });

  test("⚠️ UNE LIGNE DE REMBOURRAGE (compte 0) N'EST PAS UNE FUITE", async () => {
    // Le rembourrage ajoute de fausses lignes au compte nul : les prendre pour
    // des fuites refuserait des mots de passe sains, au hasard.
    expect(await verifierFuite(MOT_DE_PASSE, repondre(`${SUFFIXE}:0`))).toBe("sain");
  });

  test("la casse du suffixe renvoyé ne change rien", async () => {
    expect(await verifierFuite(MOT_DE_PASSE, repondre(`${SUFFIXE.toLowerCase()}:2`))).toBe("fuite");
  });

  test("un service en panne rend « inconnu », et le dit dans le journal", async () => {
    expect(await verifierFuite(MOT_DE_PASSE, repondre("", 503))).toBe("inconnu");
    expect(console.warn).toHaveBeenCalled();
  });

  test("⚠️ UN SERVICE MUET EST ABANDONNÉ À LA BORNE — l'inscription n'attend pas un tiers", async () => {
    const muet: typeof fetch = (_u, init) =>
      new Promise((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason)));
    vi.useFakeTimers();
    try {
      const verdict = verifierFuite(MOT_DE_PASSE, muet);
      await vi.advanceTimersByTimeAsync(BORNE_FUITES_MS + 1);
      expect(await verdict).toBe("inconnu");
    } finally {
      vi.useRealTimers();
    }
    expect(BORNE_FUITES_MS).toBeLessThanOrEqual(5000);
  });
});
