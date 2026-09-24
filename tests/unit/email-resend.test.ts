import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { expediteurResend } from "@/lib/email/resend";

/**
 * L'ENVOI DES ALERTES DE VEILLE PAR E-MAIL (`lib/email/resend.ts`).
 *
 * ⚠️ CE FICHIER N'ÉTAIT QU'IMPORTÉ PAR LES SUITES, JAMAIS APPELÉ — trouvé par
 * l'audit ECC du 24/09/2026 : la porte « couverture » le comptait traversé
 * parce que son module se chargeait. C'est le messager qui doit NOUS prévenir ;
 * son échec serait doublement invisible.
 *
 * Le réseau est substitué : aucun appel ne part vers Resend.
 */

const CLE = "re_cle_de_sonde_assez_longue_42";
const SAUVE = { ...process.env };
let requetes: { url: string; init: RequestInit }[] = [];

function fournisseur(reponse: () => Response | Promise<Response>): void {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requetes.push({ url, init });
    return reponse();
  });
}

beforeEach(() => {
  requetes = [];
  process.env["RESEND_API_KEY"] = CLE;
  process.env["EMAIL_ALERTES_DE"] = "DropLink <alertes@droplink.fr>";
  process.env["EMAIL_ALERTES_A"] = "exploitation@droplink.app";
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...SAUVE };
});

const MESSAGE = { sujet: "Veille", texte: "La cadence ne bat plus." };

describe("L'envoi des alertes par Resend", () => {
  test("CONTRE-TEST : un envoi accepté AVEC identifiant est « envoyé », vers l'exploitant", async () => {
    fournisseur(() => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    expect(await expediteurResend().envoyer(MESSAGE)).toEqual({ statut: "envoye", id: "msg_1" });
    expect(requetes).toHaveLength(1);
    const corps = JSON.parse(String(requetes[0]?.init.body)) as { to: string[]; subject: string };
    expect(corps.to).toEqual(["exploitation@droplink.app"]);
    expect(corps.subject).toBe("Veille");
    expect((requetes[0]?.init.headers as Record<string, string>)["authorization"]).toBe(`Bearer ${CLE}`);
  });

  test("⚠️ SANS CONFIGURATION, RIEN NE PART « POUR VOIR »", async () => {
    delete process.env["RESEND_API_KEY"];
    fournisseur(() => new Response("{}", { status: 200 }));
    expect(await expediteurResend().envoyer(MESSAGE)).toEqual({ statut: "non_configure", manquant: ["RESEND_API_KEY"] });
    expect(requetes).toHaveLength(0);
  });

  test("⚠️ UN 200 SANS IDENTIFIANT EST UN REFUS, PAS UN SUCCÈS (L-024)", async () => {
    fournisseur(() => new Response("{}", { status: 200 }));
    expect(await expediteurResend().envoyer(MESSAGE)).toMatchObject({ statut: "refuse" });
  });

  test("⚠️ UN REFUS A UN MOTIF BORNÉ, qui commence par le statut", async () => {
    fournisseur(() => new Response("erreur " + "x".repeat(2000), { status: 500 }));
    const r = await expediteurResend().envoyer(MESSAGE);
    expect(r.statut).toBe("refuse");
    const motif = r.statut === "refuse" ? r.motif : "";
    expect(motif.startsWith("HTTP 500")).toBe(true);
    expect(motif.length).toBeLessThanOrEqual(320);
  });

  test("un fournisseur injoignable est un refus réessayable, jamais une exception", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await expediteurResend().envoyer(MESSAGE)).toMatchObject({ statut: "refuse" });
  });
});
