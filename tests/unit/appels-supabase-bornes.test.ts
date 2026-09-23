import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * AUCUN APPEL À SUPABASE N'ATTEND SANS FIN — 23/09/2026.
 *
 * Mesuré le 04/09/2026 : `/fr/analyses` a rendu un 500 après 10,7 s, le
 * serveur d'authentification ne répondant pas. Le refus était voulu (on ne
 * sert pas une page authentifiée sans savoir qui la demande) ; c'est l'ATTENTE
 * qui n'était bornée nulle part. Un serveur qui ne répond pas retenait la page
 * aussi longtemps que la pile réseau le voulait — et chaque requête suivante
 * s'empilait derrière.
 *
 * La borne vit dans le `fetch` de chaque client : au-delà, l'appel est abandonné
 * avec un message que `estPanneDeTransport` reconnaît, donc traité par les
 * chemins de panne qui existent déjà (`SessionIndisponible`, lecture illisible).
 */

const { fetchBorne, BORNE_SUPABASE_MS } = await import("@/lib/reseau/fetch-borne");
const { estPanneDeTransport } = await import("@/lib/reseau/panne");

/** Un serveur qui ne répond jamais — mais qui entend qu'on raccroche. */
function serveurMuet(): typeof fetch {
  return (_entree, init) =>
    new Promise<Response>((_, rejeter) => {
      init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason));
    });
}

describe("Le fetch borné", () => {
  test("CONTRE-TEST : une réponse rapide passe telle quelle", async () => {
    const r = await fetchBorne(200, async () => new Response("ok", { status: 201 }))("https://exemple.test");
    expect(r.status).toBe(201);
  });

  test("⚠️ UN SERVEUR MUET EST ABANDONNÉ À LA BORNE, en panne de transport reconnue", async () => {
    const debut = Date.now();
    const erreur = await fetchBorne(80, serveurMuet())("https://exemple.test").catch((e: unknown) => e);
    expect(Date.now() - debut).toBeLessThan(1500);
    expect(estPanneDeTransport(String((erreur as Error).message ?? erreur))).toBe(true);
  });

  test("le signal de l'appelant est toujours honoré", async () => {
    const annulation = new AbortController();
    const promesse = fetchBorne(10_000, serveurMuet())("https://exemple.test", { signal: annulation.signal });
    annulation.abort(new Error("annulé par l'appelant"));
    await expect(promesse).rejects.toThrow("annulé par l'appelant");
  });

  test("la borne de production laisse passer une requête lente mais saine, pas une attente infinie", () => {
    expect(BORNE_SUPABASE_MS).toBeGreaterThanOrEqual(5_000);
    expect(BORNE_SUPABASE_MS).toBeLessThanOrEqual(15_000);
  });
});

describe("⚠️ LA BIBLIOTHÈQUE NE RÉESSAIE PAS UNE ATTENTE DÉJÀ BORNÉE", () => {
  test("une lecture muette n'est demandée qu'UNE fois — pas quatre", async () => {
    /*
     * `postgrest-js` réessaie seul une lecture en échec réseau (1, 2 puis 4 s
     * d'intervalle), sauf si l'erreur s'appelle `AbortError`. Une borne nommée
     * autrement était réessayée : mesuré, 4 demandes et 7,5 s pour une borne de
     * 100 ms — 47 s avec la borne de production.
     */
    let demandes = 0;
    const muet = serveurMuet();
    const client = createClient("https://muet.exemple.test", "cle", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: fetchBorne(100, (e, i) => {
          demandes += 1;
          return muet(e, i);
        }),
      },
    });
    const debut = Date.now();
    const { error } = await client.from("profiles").select("id").maybeSingle();
    expect(error).not.toBeNull();
    expect(demandes, "la lecture a été réessayée derrière la borne").toBe(1);
    expect(Date.now() - debut).toBeLessThan(1000);
  });
});

describe("⚠️ DE BOUT EN BOUT : un serveur d'authentification muet", () => {
  test("la lecture du compte lève « injoignable » dans la borne, au lieu d'attendre", async () => {
    const { lireEtatDuCompteAvec } = await import("@/lib/comptes/profil");
    // Une session présente, lue en mémoire, force l'appel au serveur
    // d'authentification — sans elle, `getUser` répondrait sans réseau.
    const session = JSON.stringify({
      access_token: "a.b.c",
      refresh_token: "r",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated" },
    });
    const client = createClient("https://muet.exemple.test", "cle-publiable", {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        storageKey: "session-de-sonde",
        storage: { getItem: () => session, setItem: () => undefined, removeItem: () => undefined },
      },
      global: { fetch: fetchBorne(100, serveurMuet()) },
    });
    const debut = Date.now();
    await expect(
      lireEtatDuCompteAvec(client as unknown as Parameters<typeof lireEtatDuCompteAvec>[0]),
    ).rejects.toThrow(/injoignable/);
    expect(Date.now() - debut).toBeLessThan(3000);
  }, 10_000);
});

// ─────────────────────────────────────────────────────────────────────────────

const optionsVues: { fabrique: string; options: { global?: { fetch?: typeof fetch } } }[] = [];
vi.mock("@supabase/supabase-js", async () => {
  const vrai = await vi.importActual<typeof import("@supabase/supabase-js")>("@supabase/supabase-js");
  return {
    ...vrai,
    createClient: (url: string, cle: string, options: { global?: { fetch?: typeof fetch } }) => {
      optionsVues.push({ fabrique: "createClient", options });
      return vrai.createClient(url, cle, options as never);
    },
  };
});
vi.mock("@supabase/ssr", async () => {
  const vrai = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
  return {
    ...vrai,
    createServerClient: (url: string, cle: string, options: { global?: { fetch?: typeof fetch } }) => {
      optionsVues.push({ fabrique: "createServerClient", options });
      return vrai.createServerClient(url, cle, options as never);
    },
  };
});
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "sonde" }),
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

describe("Chaque client Supabase du serveur porte la borne", () => {
  beforeEach(() => {
    optionsVues.length = 0;
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ??= "https://projet.exemple.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] ??= "cle-publiable";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??= "cle-service";
  });

  const FABRIQUES: Record<string, () => Promise<unknown>> = {
    serveur: async () => (await import("@/lib/supabase/server")).creerClientServeur(),
    anonyme: async () => (await import("@/lib/supabase/anon")).creerClientAnonyme(),
    systeme: async () => (await import("@/lib/supabase/system")).creerClientSysteme(),
    verification: async () => (await import("@/lib/supabase/verification")).creerClientVerification(),
  };

  for (const [nom, creer] of Object.entries(FABRIQUES)) {
    test(`⚠️ ${nom} : son fetch abandonne un serveur muet`, async () => {
      await creer();
      const vu = optionsVues.at(-1);
      expect(vu, `${nom} n'a créé aucun client : la sonde n'inspecte rien`).toBeDefined();
      const fetchDuClient = vu?.options.global?.fetch;
      expect(fetchDuClient, `${nom} n'a pas de fetch borné`).toBeTypeOf("function");
      // Le fetch du client s'appuie sur le fetch GLOBAL au moment de l'appel :
      // on y pose le serveur muet, et on exige l'abandon — pas une attente.
      const natif = globalThis.fetch;
      vi.useFakeTimers();
      globalThis.fetch = serveurMuet();
      try {
        const promesse = (fetchDuClient as typeof fetch)("https://projet.exemple.test/rest/v1/x").catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(BORNE_SUPABASE_MS + 1);
        const erreur = await promesse;
        expect(estPanneDeTransport(String((erreur as Error).message ?? erreur))).toBe(true);
      } finally {
        globalThis.fetch = natif;
        vi.useRealTimers();
      }
    });
  }
});
