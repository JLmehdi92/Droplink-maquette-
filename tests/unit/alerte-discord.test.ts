import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { expediteurDiscord } from "@/lib/alerte/discord";

/**
 * L'ALERTE QUI PART SUR DISCORD, ET CE QU'ELLE DOIT REFUSER DE FAIRE.
 *
 * Décision de Wassim, 20/09/2026 : « on mets un webhook qui m'envoie la notif
 * sur discord », et « à chaque quota utilisé sur notre compte 17track ». Cette
 * alerte est le seul signal qui dira que le budget DE SUIVI se vide — 200
 * prises en charge À VIE, dont il reste 191.
 *
 * ⚠️ UNE URL DE WEBHOOK EST UNE CAPACITÉ, PAS UN RÉGLAGE. Qui la détient publie
 * dans le salon. C'est pourquoi ce fichier vérifie autant ce que l'adaptateur
 * REFUSE que ce qu'il envoie : une URL mal substituée, un hôte qui n'est pas
 * celui de Discord, et l'URL recopiée dans un motif d'erreur — c'est-à-dire
 * publiée dans un journal.
 *
 * ⚠️ ET UN 200 NE PROUVE RIEN (L-024). Discord rend `204 No Content` par défaut :
 * un adaptateur qui se contenterait du statut déclarerait « envoyé » pour un
 * salon supprimé. On demande donc `?wait=true`, qui fait rendre le MESSAGE créé
 * avec son identifiant, et l'absence d'identifiant est un refus.
 */

const URL_VALIDE = "https://discord.com/api/webhooks/123456789/jeton-de-sonde";

/** Une réponse `fetch` minimale, sans toucher au réseau. */
const reponse = (statut: number, corps: unknown): Response =>
  ({
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: () => Promise.resolve(corps),
    text: () => Promise.resolve(typeof corps === "string" ? corps : JSON.stringify(corps)),
  }) as Response;

let appels: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  appels = [];
  process.env["DISCORD_WEBHOOK_URL"] = URL_VALIDE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["DISCORD_WEBHOOK_URL"];
});

function bouchonner(reponsePromise: () => Promise<Response>): void {
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    appels.push({ url: String(url), init });
    return reponsePromise();
  });
}

describe("L'expéditeur Discord", () => {
  test("envoie, et rend l'identifiant du message créé", async () => {
    bouchonner(() => Promise.resolve(reponse(200, { id: "1420" })));

    const issue = await expediteurDiscord().envoyer({
      sujet: "Budget de suivi",
      texte: "191 prises en charge restantes.",
    });

    expect(issue).toEqual({ statut: "envoye", id: "1420" });
    expect(appels).toHaveLength(1);
    // `?wait=true` : sans lui Discord rend 204 sans corps, et « envoyé » ne
    // serait qu'une lecture de statut.
    expect(appels[0]?.url).toContain("wait=true");
    const corps = String(appels[0]?.init.body);
    expect(corps).toContain("Budget de suivi");
    expect(corps).toContain("191 prises en charge restantes.");
  });

  test("REFUSE un 200 sans identifiant — « il répond » n'est pas « il a accepté »", async () => {
    // C'est la forme exacte de fausse réussite que L-024 décrit, et celle que
    // Discord rend par défaut (204). Un adaptateur qui la prendrait pour un
    // succès nous ferait croire que l'alerte est partie.
    bouchonner(() => Promise.resolve(reponse(204, "")));

    const issue = await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    expect(issue.statut).toBe("refuse");
  });

  test("un refus du salon est RÉESSAYABLE, et ne publie jamais l'URL", async () => {
    bouchonner(() => Promise.resolve(reponse(400, { message: "Invalid Webhook Token" })));

    const issue = await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    expect(issue.statut).toBe("refuse");
    // ⚠️ L'URL PORTE LE JETON DU WEBHOOK. La recopier dans un motif la publie
    // dans les journaux, où elle sera lue par plus de monde que le salon.
    expect(JSON.stringify(issue)).not.toContain("jeton-de-sonde");
    expect(JSON.stringify(issue)).not.toContain("123456789");
  });

  test("un réseau coupé est un refus, pas un défaut de configuration", async () => {
    bouchonner(() => Promise.reject(new Error("fetch failed")));

    const issue = await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    // Réessayer a un sens ; c'est ce qui distingue `refuse` de `non_configure`.
    expect(issue.statut).toBe("refuse");
  });

  test("sans variable, il ne tente RIEN et nomme ce qui manque", async () => {
    delete process.env["DISCORD_WEBHOOK_URL"];
    bouchonner(() => Promise.resolve(reponse(200, { id: "x" })));

    const issue = await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    expect(issue).toEqual({ statut: "non_configure", manquant: ["DISCORD_WEBHOOK_URL"] });
    // Ne pas tenter « pour voir » : un envoi sans destination produirait un
    // refus que l'appelant réessaierait indéfiniment.
    expect(appels, "aucune requête ne doit partir sans destination").toHaveLength(0);
  });

  test.each([
    ["https://exemple.com/api/webhooks/1/x", "un hôte qui n'est pas Discord"],
    ["https://discord.com.pirate.net/api/webhooks/1/x", "un hôte qui IMITE Discord"],
    ["http://discord.com/api/webhooks/1/x", "du clair, donc un jeton lisible en route"],
    ["https://discord.com/api/webhooks/VOTRE_ID/VOTRE_JETON", "un gabarit non substitué"],
  ])("REFUSE %s (%s), sans rien envoyer", async (url) => {
    process.env["DISCORD_WEBHOOK_URL"] = url;
    bouchonner(() => Promise.resolve(reponse(200, { id: "x" })));

    const issue = await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    /*
     * ⚠️ POURQUOI `non_configure` ET NON `refuse` : réessayer ne corrigera
     * jamais une URL fausse. C'est la distinction que le port existe pour
     * porter — « personne n'a été joint, et personne ne le sera tant qu'une
     * variable n'est pas corrigée ».
     */
    expect(issue.statut).toBe("non_configure");
    expect(appels, "une URL douteuse ne doit jamais recevoir nos alertes").toHaveLength(0);
  });

  test("un message trop long est TRONQUÉ plutôt que refusé en entier", async () => {
    bouchonner(() => Promise.resolve(reponse(200, { id: "1" })));

    const issue = await expediteurDiscord().envoyer({
      sujet: "Budget",
      texte: "x".repeat(5_000),
    });

    // Discord refuse tout message au-delà de 2 000 caractères. Sans troncature,
    // l'alerte la plus longue — donc la plus grave — serait la seule à ne
    // jamais partir.
    expect(issue.statut).toBe("envoye");
    const contenu = String(JSON.parse(String(appels[0]?.init.body)).content);
    expect(contenu.length).toBeLessThanOrEqual(2_000);
    expect(contenu).toContain("Budget");
  });

  test("l'envoi est BORNÉ dans le temps", async () => {
    // Leçon du jour : sur un chemin qui n'est pas celui d'un humain, un appel
    // sortant sans borne fige la tâche qui l'a demandé. Le signal d'abandon est
    // posé, et c'est vérifiable sans attendre le délai.
    bouchonner(() => Promise.resolve(reponse(200, { id: "1" })));

    await expediteurDiscord().envoyer({ sujet: "s", texte: "t" });

    expect(appels[0]?.init.signal, "aucun signal d'abandon : l'appel est sans borne").toBeDefined();
  });
});
