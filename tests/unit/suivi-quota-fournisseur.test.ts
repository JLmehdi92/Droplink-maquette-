import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";
import { MOTIF_CLE_ABSENTE } from "@/lib/tracking/provider/port";

/**
 * LE SOLDE DU PALIER SE LIT CHEZ LE FOURNISSEUR, PAS CHEZ NOUS (30/09/2026).
 *
 * ⚠️ DÉFAUT RÉEL, SIGNALÉ PAR MEHDI : l'alerte Discord a annoncé « 197 restantes
 * sur 200 (3 utilisées) » quand le tableau de bord de 17TRACK en montrait 190.
 * `etat_budget_suivi()` compte les colis marqués pris en charge dans NOTRE base,
 * plus un décalage réglé à la main (180). Or des lignes disparaissent — comptes
 * supprimés, « Supprimer mes données », anciennes suites qui visaient la
 * production — et l'argent, lui, est parti. La 180 l'écrivait déjà : « notre base
 * ne peut pas connaître ce chiffre ».
 *
 * `getquota` (API v2.4) rend le solde que le fournisseur facture. Il ne se paie
 * pas : c'est une lecture de compte, sans numéro. Ce fichier éprouve sa lecture
 * sans réseau — un `fetch` de substitution — et surtout ce qu'elle REFUSE : un
 * solde qu'on ne peut pas lire ne devient jamais un nombre.
 */

const QUOTA = {
  code: 0,
  data: {
    quota_total: 200,
    quota_used: 10,
    quota_remain: 190,
    today_used: 1,
    max_track_daily: 10000000,
    free_email_quota: 0,
    free_email_quotaused: 0,
  },
};

const reponse = (statut: number, corps: unknown): Response =>
  ({
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: () => Promise.resolve(corps),
  }) as Response;

let appels: { url: string; init: RequestInit }[] = [];
let ancienne: string | undefined;

function bouchonner(fabrique: () => Promise<Response>): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    appels.push({ url: String(url), init });
    return fabrique();
  });
}

beforeEach(() => {
  appels = [];
  ancienne = process.env["TRACKING_API_KEY"];
  process.env["TRACKING_API_KEY"] = "cle-de-sonde";
});

afterEach(() => {
  if (ancienne === undefined) delete process.env["TRACKING_API_KEY"];
  else process.env["TRACKING_API_KEY"] = ancienne;
  vi.unstubAllGlobals();
});

describe("Le solde du palier, lu chez le fournisseur", () => {
  test("CONTRE-TEST : un solde lisible rend les nombres DU FOURNISSEUR", async () => {
    bouchonner(() => Promise.resolve(reponse(200, QUOTA)));

    const q = await dixSeptTrack.lireQuota();

    expect(q).toEqual({ statut: "ok", total: 200, utilisees: 10, restantes: 190, aujourdhui: 1 });
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe("https://api.17track.net/track/v2.4/getquota");
    // Leur documentation exige un tableau vide : aucun numéro ne part, donc
    // aucune prise en charge ne peut être déclenchée par cette lecture.
    expect(appels[0]?.init.body).toBe("[]");
    expect(appels[0]?.init.signal, "l'appel est sans borne").toBeDefined();
  });

  test("« aujourd'hui » absent reste absent — jamais un zéro inventé", async () => {
    const { today_used: _ignore, ...sansJour } = QUOTA.data;
    bouchonner(() => Promise.resolve(reponse(200, { code: 0, data: sansJour })));

    const q = await dixSeptTrack.lireQuota();

    expect(q).toEqual({ statut: "ok", total: 200, utilisees: 10, restantes: 190, aujourdhui: null });
  });

  test.each([
    ["un code de compte non nul", reponse(200, { code: -18010012, data: QUOTA.data })],
    ["une réponse HTTP en échec", reponse(401, { code: 0 })],
    ["un solde sans le nombre restant", reponse(200, { code: 0, data: { quota_total: 200, quota_used: 10 } })],
    ["un solde négatif", reponse(200, { code: 0, data: { ...QUOTA.data, quota_remain: -3 } })],
    ["un nombre qui n'en est pas un", reponse(200, { code: 0, data: { ...QUOTA.data, quota_remain: "190" } })],
    ["un corps sans données", reponse(200, { code: 0 })],
  ])("REFUSE %s : indisponible, aucun nombre", async (_cas, r) => {
    bouchonner(() => Promise.resolve(r));

    const q = await dixSeptTrack.lireQuota();

    expect(q.statut).toBe("indisponible");
    expect(q).not.toHaveProperty("restantes");
  });

  test("une page de maintenance est `reponse-illisible`, pas une panne réseau", async () => {
    bouchonner(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("<html>")) } as Response),
    );
    expect(await dixSeptTrack.lireQuota()).toEqual({ statut: "indisponible", motif: "reponse-illisible" });
  });

  test("une clé révoquée SANS nombres se nomme par son code, pas « illisible »", async () => {
    bouchonner(() => Promise.resolve(reponse(200, { code: 401, data: {} })));
    expect(await dixSeptTrack.lireQuota()).toEqual({ statut: "indisponible", motif: "code-401" });
  });

  test("un réseau coupé est `reseau`, une clé absente est `cle-absente`", async () => {
    bouchonner(() => Promise.reject(new Error("fetch failed")));
    expect(await dixSeptTrack.lireQuota()).toEqual({ statut: "indisponible", motif: "reseau" });

    delete process.env["TRACKING_API_KEY"];
    expect(await dixSeptTrack.lireQuota()).toEqual({ statut: "indisponible", motif: MOTIF_CLE_ABSENTE });
  });
});
