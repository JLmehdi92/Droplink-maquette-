import { describe, expect, test, vi } from "vitest";
import {
  estQuotaAtteint,
  estReseauInstable,
  fetchResilient,
  malgreLAlea,
} from "../aide/utilisateurs";

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
