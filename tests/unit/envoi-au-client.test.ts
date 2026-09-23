import { afterEach, beforeEach, describe, expect, test } from "vitest";

/**
 * L'ENVOI D'UN E-MAIL AU CLIENT FINAL — ce qui part réellement vers le fournisseur.
 *
 * La désinscription en un clic (RFC 8058) n'est pas une politesse : Gmail et Yahoo
 * l'exigent des expéditeurs en volume. Sans ces deux en-têtes, les e-mails de
 * suivi finissent en indésirables — et la réputation d'envoi de DropLink avec.
 */

const { envoyerAuClient } = await import("@/lib/email/client-final");

const SAUVE = { ...process.env };
let requetes: { url: string; corps: Record<string, unknown> }[] = [];
function fournisseur(statut = 200): typeof fetch {
  return async (url, init) => {
    requetes.push({ url: String(url), corps: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return new Response(JSON.stringify({ id: "x" }), { status: statut });
  };
}

beforeEach(() => {
  requetes = [];
  process.env["RESEND_API_KEY"] = "re_cle_de_test_assez_longue";
  process.env["EMAIL_CLIENTS_DE"] = "DropLink <suivi@droplink.fr>";
});
afterEach(() => {
  process.env = { ...SAUVE };
});

describe("L'envoi au client", () => {
  test("⚠️ LA DÉSINSCRIPTION EN UN CLIC ACCOMPAGNE CHAQUE E-MAIL D'ÉTAPE", async () => {
    const r = await envoyerAuClient(
      { a: "client@exemple.test", sujet: "s", texte: "t", desinscription: "https://droplink.fr/api/notification/desinscription?j=abc" },
      fournisseur(),
    );
    expect(r).toEqual({ statut: "envoye" });
    expect(requetes[0]?.corps["headers"]).toEqual({
      "List-Unsubscribe": "<https://droplink.fr/api/notification/desinscription?j=abc>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(requetes[0]?.corps["from"]).toBe("DropLink <suivi@droplink.fr>");
    expect(requetes[0]?.corps["to"]).toEqual(["client@exemple.test"]);
  });

  test("un e-mail de confirmation n'a pas d'en-tête de désinscription — il n'y a rien à quitter", async () => {
    await envoyerAuClient({ a: "client@exemple.test", sujet: "s", texte: "t" }, fournisseur());
    expect(requetes[0]?.corps["headers"]).toEqual({});
  });

  test("⚠️ SANS L'ADRESSE D'EXPÉDITION DÉDIÉE, RIEN NE PART — pas même par l'adresse des alertes", async () => {
    delete process.env["EMAIL_CLIENTS_DE"];
    process.env["EMAIL_ALERTES_DE"] = "alertes@droplink.fr";
    expect(await envoyerAuClient({ a: "c@exemple.test", sujet: "s", texte: "t" }, fournisseur())).toEqual({
      statut: "non_configure",
    });
    expect(requetes).toHaveLength(0);
  });

  test("un refus du fournisseur ne recopie pas sa réponse — elle peut citer l'adresse du client", async () => {
    const r = await envoyerAuClient({ a: "secret@exemple.test", sujet: "s", texte: "t" }, fournisseur(422));
    expect(r).toEqual({ statut: "refuse", motif: "HTTP 422" });
  });
});
