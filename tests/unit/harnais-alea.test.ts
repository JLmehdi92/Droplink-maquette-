import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  estQuotaAtteint,
  estReseauInstable,
  fetchResilient,
  malgreLAlea,
} from "../aide/utilisateurs";
import { hoteDe, installerTransportResilient, refusDHote } from "../aide/transport";

/**
 * LA BORNE DU QUOTA D'AUTHENTIFICATION — éprouvée, pas déclarée.
 *
 * Cette borne protège le HARNAIS, pas le produit. Elle mérite quand même d'être
 * exercée, pour deux raisons.
 *
 * D'ABORD PARCE QU'ELLE PEUT MASQUER UN DÉFAUT RÉEL. Une attente posée sur
 * n'importe quelle erreur transformerait un refus légitime — un mot de passe
 * faux, une garde qui refuse — en lenteur puis en échec tardif, attribué au
 * quota. C'est le contrôle le plus important ici : ce qui n'est PAS un quota ne
 * patiente pas.
 *
 * ENSUITE PARCE QU'UNE BORNE QU'ON N'A JAMAIS VUE AGIR NE PROUVE RIEN. Deux
 * exécutions consécutives de la suite viennent de passer sans l'atteindre : la
 * seule façon d'établir qu'elle fonctionne est de la déclencher exprès.
 */

describe("Ce qui est reconnu comme un quota", () => {
  test("un 429 et un message de limite le sont", () => {
    expect(estQuotaAtteint({ status: 429, message: "peu importe" })).toBe(true);
    expect(estQuotaAtteint({ message: "Request rate limit reached" })).toBe(true);
  });

  test("contre-test : une erreur ordinaire ne l'est pas", () => {
    // Sans lui, une fonction qui rendrait toujours `true` passerait le test
    // précédent — et ferait patienter sur chaque échec, quel qu'il soit.
    expect(estQuotaAtteint({ status: 400, message: "Invalid login credentials" })).toBe(false);
    expect(estQuotaAtteint(null)).toBe(false);
  });
});

describe("Ce qui n'est pas un quota ne patiente pas", () => {
  test("une erreur ordinaire remonte IMMÉDIATEMENT, sans réessai", async () => {
    const etape = vi.fn(async () => ({
      erreur: { status: 400, message: "Invalid login credentials" },
      valeur: null,
    }));

    await expect(malgreLAlea("connexion", etape, [1, 1], [])).rejects.toThrow(/Invalid login/);
    // UN SEUL APPEL. Réessayer ici reviendrait à relancer une assertion jusqu'au
    // vert, ce que la discipline du projet interdit — et un refus légitime
    // finirait par être imputé au quota.
    expect(etape, "une erreur ordinaire a été réessayée").toHaveBeenCalledTimes(1);
  });
});

describe("Un quota est attendu, puis nommé", () => {
  test("il patiente et rend la valeur dès que l'appel passe", async () => {
    let appels = 0;
    const etape = async () => {
      appels += 1;
      return appels < 3
        ? { erreur: { status: 429, message: "Request rate limit reached" }, valeur: "" }
        : { erreur: null, valeur: "session" };
    };

    expect(await malgreLAlea("connexion", etape, [1, 1], [])).toBe("session");
    expect(appels).toBe(3);
  });

  test("épuisé, il échoue en DISANT que ce n'est pas le produit", async () => {
    // Le message compte autant que l'échec. Avant cette borne, le quota
    // produisait « Cannot read properties of undefined » dans des fichiers sans
    // rapport : un rouge qui ressemblait à une régression. Un rouge attribué au
    // mauvais endroit est pire qu'un rouge.
    const etape = async () => ({
      erreur: { status: 429, message: "Request rate limit reached" },
      valeur: null,
    });

    await expect(malgreLAlea("connexion", etape, [1], [])).rejects.toThrow(
      /N'EST PAS LE PRODUIT/,
    );
  });

  test("le nombre de tentatives suit les attentes déclarées", async () => {
    // La borne est BORNÉE : sans ce contrôle, une boucle qui attendrait
    // indéfiniment passerait tous les tests ci-dessus.
    const etape = vi.fn(async () => ({
      erreur: { status: 429, message: "Request rate limit reached" },
      valeur: null,
    }));

    await expect(malgreLAlea("connexion", etape, [1, 1, 1], [])).rejects.toThrow();
    expect(etape).toHaveBeenCalledTimes(4);
  });
});

/**
 * ⚠️ LA SECONDE CLASSE D'ALÉA — AJOUTÉE APRÈS UN ROUGE MAL ATTRIBUÉ.
 *
 * Le 01/09/2026, une exécution a rendu `632/642` : dix échecs dans trois
 * fichiers sans rapport, tous portant `fetch failed`. La base était saine
 * (30 Mo, lecture seule OFF) et l'API d'authentification répondait en 37 ms
 * quand je l'ai mesurée juste après. C'était le réseau, et l'enrobage ne
 * patientait que sur le quota.
 *
 * Ces tests existent pour que ce rouge-là ne revienne pas — ET pour que le
 * remède ne devienne pas pire que le mal : un enrobage qui réessaierait sur
 * TOUTE erreur masquerait les défauts qu'il est censé laisser passer.
 */
describe("Ce qui est reconnu comme un aléa de transport", () => {
  test("les formes usuelles d'une coupure le sont", () => {
    for (const message of [
      "fetch failed",
      "TypeError: fetch failed",
      "read ECONNRESET",
      "connect ETIMEDOUT 1.2.3.4:443",
      "getaddrinfo EAI_AGAIN api.supabase.co",
      "socket hang up",
      "network error",
      "terminated",
    ]) {
      expect(estReseauInstable({ message }), `« ${message} » non reconnu`).toBe(true);
    }
    for (const status of [502, 503, 504]) {
      expect(estReseauInstable({ status, message: "Bad Gateway" })).toBe(true);
    }
  });

  test("CONTRE-TEST : un refus métier n'en est PAS un", () => {
    /*
     * LE TEST QUI COMPTE LE PLUS DE TOUT CE FICHIER.
     *
     * Si ce prédicat s'élargissait, chaque refus légitime — mot de passe faux,
     * garde qui refuse, contrainte violée — serait réessayé trois fois puis
     * imputé au réseau. L'enrobage cesserait de rendre les aléas invisibles
     * pour rendre les DÉFAUTS invisibles, ce qui est exactement l'inverse.
     */
    for (const erreur of [
      { status: 400, message: "Invalid login credentials" },
      { status: 401, message: "Unauthorized" },
      { status: 409, message: "duplicate key value violates unique constraint" },
      { status: 500, message: "record not found" },
      { message: "new row violates row-level security policy" },
    ]) {
      expect(estReseauInstable(erreur), `« ${erreur.message} » pris pour du réseau`).toBe(false);
    }
    expect(estReseauInstable(null)).toBe(false);
  });

  test("les deux classes ne se confondent pas", () => {
    // Un quota n'est pas un aléa de transport, et réciproquement : chacune a
    // son rythme, et les mélanger ferait épuiser l'une par l'autre.
    expect(estQuotaAtteint({ status: 429, message: "rate limit" })).toBe(true);
    expect(estReseauInstable({ status: 429, message: "rate limit" })).toBe(false);
    expect(estReseauInstable({ message: "fetch failed" })).toBe(true);
    expect(estQuotaAtteint({ message: "fetch failed" })).toBe(false);
  });
});

describe("Un aléa de transport est réessayé, puis nommé", () => {
  test("il réessaie et rend la valeur dès que le transport revient", async () => {
    let appels = 0;
    const etape = async () => {
      appels += 1;
      return appels < 3
        ? { erreur: { message: "fetch failed" }, valeur: "" }
        : { erreur: null, valeur: "supprime" };
    };

    expect(await malgreLAlea("suppression", etape, [], [1, 1])).toBe("supprime");
    expect(appels).toBe(3);
  });

  test("épuisé, il échoue en DISANT que ce n'est pas le produit", async () => {
    const etape = async () => ({ erreur: { message: "fetch failed" }, valeur: null });
    await expect(malgreLAlea("suppression", etape, [], [1])).rejects.toThrow(
      /N'EST PAS LE PRODUIT/,
    );
    // Et il oriente vers la bonne cause plutôt que vers une régression.
    await expect(malgreLAlea("suppression", etape, [], [1])).rejects.toThrow(/connectivité/);
  });

  test("le nombre de tentatives est BORNÉ", async () => {
    // Sans ce contrôle, une boucle qui réessaierait indéfiniment passerait tous
    // les tests ci-dessus — et une coupure réseau figerait la suite entière.
    const etape = vi.fn(async () => ({ erreur: { message: "fetch failed" }, valeur: null }));
    await expect(malgreLAlea("suppression", etape, [], [1, 1, 1])).rejects.toThrow();
    expect(etape).toHaveBeenCalledTimes(4);
  });

  test("les deux compteurs sont INDÉPENDANTS", async () => {
    /*
     * Un aléa réseau ne doit pas consommer les tentatives réservées au quota.
     * Avec un compteur unique, une coupure suivie d'un quota épuiserait la
     * réserve avant d'avoir attendu la seule chose qui demande d'attendre.
     */
    let appels = 0;
    const etape = async () => {
      appels += 1;
      if (appels === 1) return { erreur: { message: "fetch failed" }, valeur: "" };
      if (appels === 2) return { erreur: { status: 429, message: "rate limit" }, valeur: "" };
      if (appels === 3) return { erreur: { message: "fetch failed" }, valeur: "" };
      return { erreur: null, valeur: "ok" };
    };

    expect(await malgreLAlea("mixte", etape, [1], [1, 1])).toBe("ok");
    expect(appels, "un compteur partagé aurait abandonné avant").toBe(4);
  });
});

/**
 * LE TRANSPORT DU HARNAIS.
 *
 * ⚠️ CETTE PIÈCE PORTE LES 642 TESTS D'ISOLATION. Si elle réessayait une
 * RÉPONSE au lieu d'une COUPURE, un 403 de RLS — c'est-à-dire très exactement
 * ce que ces tests cherchent à obtenir — serait retenté trois fois puis rendu
 * quand même. La suite resterait verte et ne prouverait plus rien.
 *
 * C'est pour ce risque-là que ces tests existent, pas pour la commodité du
 * réessai.
 */
describe("Le transport du harnais", () => {
  test("CONTRE-TEST : une réponse HTTP d'erreur est rendue TELLE QUELLE, sans réessai", async () => {
    let appels = 0;
    const faux = vi.fn(async () => {
      appels += 1;
      return new Response("refusé par la RLS", { status: 403 });
    });
    vi.stubGlobal("fetch", faux);

    const r = await fetchResilient("https://exemple.invalid/rest", undefined, [1, 1]);
    expect(r.status, "le refus n'est pas remonté intact").toBe(403);
    expect(appels, "un refus légitime a été réessayé : il serait masqué").toBe(1);
    vi.unstubAllGlobals();
  });

  test("une COUPURE de transport est réessayée, puis passe", async () => {
    let appels = 0;
    vi.stubGlobal("fetch", async () => {
      appels += 1;
      if (appels < 3) throw new TypeError("fetch failed");
      return new Response("ok", { status: 200 });
    });

    const r = await fetchResilient("https://exemple.invalid/rest", undefined, [1, 1]);
    expect(r.status).toBe(200);
    expect(appels).toBe(3);
    vi.unstubAllGlobals();
  });

  test("le réessai est BORNÉ, et il DIT que ce n'est pas le produit", async () => {
    const faux = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", faux);

    await expect(fetchResilient("https://exemple.invalid/rest", undefined, [1, 1])).rejects.toThrow(
      /N'EST PAS LE PRODUIT/,
    );
    expect(faux, "une coupure permanente doit s'arrêter, pas boucler").toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  test("une annulation VOLONTAIRE n'est jamais réessayée", async () => {
    // Réessayer irait contre l'intention de celui qui a annulé — et un délai
    // dépassé se rejouerait indéfiniment sous un autre nom.
    const faux = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    vi.stubGlobal("fetch", faux);

    await expect(
      fetchResilient("https://exemple.invalid/rest", undefined, [1, 1]),
    ).rejects.toThrow(/abort/i);
    expect(faux).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  test("une erreur qui n'est PAS du transport remonte immédiatement", async () => {
    const faux = vi.fn(async () => {
      throw new TypeError("Invalid URL");
    });
    vi.stubGlobal("fetch", faux);

    await expect(fetchResilient("pas-une-url", undefined, [1, 1])).rejects.toThrow(/Invalid URL/);
    expect(faux).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

/**
 * ⚠️ LE TRANSPORT POSÉ POUR TOUT LE PROCESSUS — AJOUTÉ LE 01/09/2026.
 *
 * La première version du remède ne couvrait que les clients fabriqués par le
 * harnais, et son commentaire l'affirmait : « les clients du produit gardent le
 * `fetch` par défaut ». Le lendemain, `tests/rls/veille.test.ts` est parti en
 * rouge sur le même `fetch failed`, mais À L'INTÉRIEUR de `veillerSur` —
 * c'est-à-dire dans un client que le PRODUIT fabrique et qu'aucune injection
 * n'atteint. La garde regardait là où le défaut n'est plus : L-025, appliqué au
 * harnais lui-même.
 *
 * Ces trois contrôles portent ce qui ne se voit pas en relisant :
 *   1. l'enrobage est bien POSÉ — sans quoi il ne protégerait rien ;
 *   2. il ne s'appelle pas LUI-MÊME — la base est capturée avant substitution,
 *      et l'oublier produirait une pile pleine à la première requête ;
 *   3. il ne réessaie toujours PAS une réponse — le contre-test qui empêche
 *      cette pièce de devenir une machine à cacher les défauts.
 */
describe("Le transport posé pour TOUT le processus", () => {
  const origine = globalThis.fetch;
  let base: typeof globalThis.fetch;
  let appels = 0;
  let comportement: () => Promise<Response> = async () => new Response("ok");

  beforeAll(() => {
    base = (async () => {
      appels += 1;
      return comportement();
    }) as typeof globalThis.fetch;
    globalThis.fetch = base;
    installerTransportResilient();
  });

  afterAll(() => {
    globalThis.fetch = origine;
  });

  test("il REMPLACE le `fetch` ambiant — sinon il ne protège rien", () => {
    expect(
      globalThis.fetch,
      "le `fetch` du processus est resté celui d'avant : l'installation n'a rien posé",
    ).not.toBe(base);
  });

  test("une coupure est réessayée, et l'enrobage n'appelle pas LUI-MÊME", async () => {
    appels = 0;
    comportement = async () => {
      if (appels < 3) throw new TypeError("fetch failed");
      return new Response("ok", { status: 200 });
    };

    // S'il relisait `globalThis.fetch` au lieu de la base capturée, cet appel
    // récurserait jusqu'à la pile pleine au lieu de rendre 200.
    const r = await fetch("https://exemple.invalid/rest");
    expect(r.status).toBe(200);
    expect(appels, "la coupure n'a pas été réessayée").toBe(3);
  }, 15_000);

  test("⚠️ un appel vers un tiers PAYANT est refusé, et ne part PAS", async () => {
    /*
     * Ici l'enrobage est REELLEMENT en place — c'est le seul endroit du fichier
     * où le `fetch` du processus est celui que l'installation a posé. Le refus
     * doit venir AVANT le réessai : sinon un appel interdit partirait quatre
     * fois au lieu d'être arrêté.
     */
    appels = 0;
    comportement = async () => new Response("ne devrait jamais etre atteint");

    await expect(fetch("https://api.17track.net/track/v2.4/register")).rejects.toThrow(
      /APPEL SORTANT REFUSÉ/,
    );
    expect(appels, "l'appel interdit a atteint le réseau").toBe(0);
  });

  test("CONTRE-TEST : une RÉPONSE d'erreur passe intacte, sans réessai", async () => {
    // Sans lui, cette pièce masquerait exactement les refus que les 648 tests
    // d'isolation cherchent à obtenir.
    appels = 0;
    comportement = async () => new Response("refusé par la RLS", { status: 403 });

    const r = await fetch("https://exemple.invalid/rest");
    expect(r.status).toBe(403);
    expect(appels, "un refus légitime a été réessayé : il serait masqué").toBe(1);
  });
});

/**
 * ⚠️ LE REFUS DES APPELS SORTANTS COÛTEUX — POSÉ LE 01/09/2026.
 *
 * Tant que `.env.local` était vide, la suite ne pouvait joindre personne. Les
 * clés renseignées, la MÊME suite s'est mise à appeler `/register` chez le
 * fournisseur de suivi — 200 prises en charge À VIE — et à émettre de VRAIS
 * événements dans le projet d'analytics de production, dont `order_created`,
 * qui est le dénominateur du taux d'activation.
 *
 * Rien n'a été perdu : mesuré après coup, `quota_used: 0`, parce qu'un
 * enregistrement rejeté ne coûte rien. C'était de la CHANCE. Ces contrôles
 * remplacent la chance par une règle.
 */
describe("Les appels sortants qui coûtent sont REFUSÉS", () => {
  test("le fournisseur de suivi et l'analytics sont refusés, sous-domaines compris", () => {
    for (const url of [
      "https://api.17track.net/track/v2.4/register",
      "https://eu.i.posthog.com/batch/",
      "https://app.posthog.com/capture/",
      "https://posthog.com/x",
      "https://api.resend.com/emails",
    ]) {
      expect(refusDHote(url), `${url} n'est pas refusé`).not.toBeNull();
      expect(refusDHote(url)?.message).toMatch(/APPEL SORTANT REFUSÉ/);
    }
  });

  test("CONTRE-TEST : ce qui EST le système sous test passe", () => {
    /*
     * Sans lui, un refus trop large couperait Supabase — donc les 648 tests
     * d'isolation — et le blocage passerait pour une réussite en n'ayant plus
     * rien à mesurer. Un ensemble vide passe tout.
     */
    for (const url of [
      "https://abcdefgh.supabase.co/rest/v1/orders",
      "https://xyz.r2.cloudflarestorage.com/depot/objet",
      "http://127.0.0.1:3000/p/abc",
    ]) {
      expect(refusDHote(url), `${url} est refusé à tort`).toBeNull();
    }
  });

  test("les TROIS formes d'argument de `fetch` sont couvertes", () => {
    /*
     * `fetch` accepte une chaîne, une `URL` et une `Request`. N'en traiter
     * qu'une laisserait les deux autres partir — et c'est précisément par un
     * objet `Request` que passent les bibliothèques clientes.
     */
    const cible = "https://api.17track.net/track/v2.4/register";
    expect(hoteDe(cible)).toBe("api.17track.net");
    expect(hoteDe(new URL(cible))).toBe("api.17track.net");
    expect(hoteDe(new Request(cible))).toBe("api.17track.net");
    expect(refusDHote(new URL(cible))).not.toBeNull();
    expect(refusDHote(new Request(cible))).not.toBeNull();
  });

  test("une URL relative n'a pas d'hôte et ne peut viser aucun tiers", () => {
    expect(hoteDe("/api/suivi/cadence")).toBeNull();
    expect(refusDHote("/api/suivi/cadence")).toBeNull();
  });

});
