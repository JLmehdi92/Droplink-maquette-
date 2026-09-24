import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LES E-MAILS DE SUIVI DU CLIENT FINAL — la couche serveur (migration 188 en base).
 *
 * Ce que la base ne peut pas garantir et que ce module doit tenir :
 * - le jeton de confirmation ne part QUE par e-mail, jamais dans la réponse ;
 * - ce qui est stocké est son EMPREINTE, et elle correspond bien au lien envoyé ;
 * - une étape est RÉSERVÉE avant l'envoi et RENDUE s'il échoue ;
 * - chaque e-mail d'étape porte la désinscription en un clic (RFC 8058) ;
 * - rien ne part, rien n'est réservé, quand l'envoi n'est pas configuré.
 */

const appels: { nom: string; args: Record<string, unknown> }[] = [];
let reponses: Record<string, { data: unknown; error: { code?: string; message: string } | null }> = {};
vi.mock("@/lib/supabase/system", () => ({
  creerClientSysteme: () => ({
    rpc: async (nom: string, args: Record<string, unknown>) => {
      appels.push({ nom, args });
      return reponses[nom] ?? { data: [], error: null };
    },
  }),
}));

type Envoye = { a: string; sujet: string; texte: string; desinscription?: string };
const envoyes: Envoye[] = [];
type Resultat = { statut: "envoye" } | { statut: "refuse"; motif: string; portee: "message" | "fournisseur" };
let resultatEnvoi: Resultat = { statut: "envoye" };
/** Si posée, chaque envoi consomme la tête de cette file (un résultat par destinataire). */
let fileEnvoi: Resultat[] = [];
vi.mock("@/lib/email/client-final", () => ({
  envoyerAuClient: async (m: Envoye) => {
    envoyes.push(m);
    return fileEnvoi.shift() ?? resultatEnvoi;
  },
}));

function lire(racine: unknown, chemin: string): unknown {
  return chemin.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], racine);
}
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalogue: unknown = JSON.parse(readFileSync(join(process.cwd(), "messages", locale + ".json"), "utf8"));
    return (cle: string, valeurs: Record<string, string> = {}) => {
      const brut = lire(lire(catalogue, namespace), cle);
      if (typeof brut !== "string") throw new Error(`clé absente : ${locale}/${namespace}.${cle}`);
      return brut.replace(/\{(\w+)\}/g, (_, n: string) => valeurs[n] ?? `{${n}}`);
    };
  },
}));

const {
  demanderNotification,
  confirmerNotification,
  desinscrireNotification,
  envoyerNotificationsEnAttente,
} = await import("@/lib/page-publique/notifications");

const ORIGINE = "https://droplink.fr";
const JETON_PUBLIC = "xK9mQ2pL7vR4nT8wY3zB1";
const SAUVE = { ...process.env };

beforeEach(() => {
  appels.length = 0;
  envoyes.length = 0;
  resultatEnvoi = { statut: "envoye" };
  fileEnvoi = [];
  reponses = { demander_notification: { data: [{ langue: "en", nom_boutique: "Atelier Nord" }], error: null } };
  process.env["RESEND_API_KEY"] = "re_cle_de_test_assez_longue";
  process.env["EMAIL_CLIENTS_DE"] = "DropLink <suivi@droplink.fr>";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  process.env = { ...SAUVE };
});

describe("La demande du client", () => {
  test("⚠️ LE JETON DE CONFIRMATION NE PART QUE PAR E-MAIL, et la base n'en reçoit que l'empreinte", async () => {
    const r = await demanderNotification(JETON_PUBLIC, { email: " Client@Exemple.test " }, ORIGINE);
    expect(r).toEqual({ statut: "envoye" });

    const lien = /https:\/\/droplink\.fr\/en\/notification\?action=confirmer&j=([A-Za-z0-9_-]+)/.exec(envoyes[0]?.texte ?? "");
    expect(lien, "l'e-mail ne porte pas de lien de confirmation").not.toBeNull();
    const jeton = lien?.[1] ?? "";
    const envoiBase = appels.find((a) => a.nom === "demander_notification")?.args;
    expect(envoiBase?.["p_token_hash"]).toBe(createHash("sha256").update(jeton).digest("hex"));
    expect(JSON.stringify(envoiBase), "le jeton en clair est parti en base").not.toContain(jeton);
    expect(JSON.stringify(r)).not.toContain(jeton);
    // Dans la LANGUE DE LA PAGE, adressé à l'adresse normalisée.
    expect(envoyes[0]?.a).toBe("client@exemple.test");
    expect(envoyes[0]?.sujet).toContain("Atelier Nord");
    expect(envoyes[0]?.texte).toContain("Hello");
  });

  test("⚠️ L'E-MAIL DE CONFIRMATION NE DONNE PAS ACCÈS À LA COMMANDE", async () => {
    // Quiconque a le lien de la page peut inscrire n'importe quelle adresse : la
    // confirmation ne doit donc rien livrer de la commande à cette adresse.
    await demanderNotification(JETON_PUBLIC, { email: "x@exemple.test" }, ORIGINE);
    expect(envoyes[0]?.texte).not.toContain(JETON_PUBLIC);
    expect(envoyes[0]?.texte).not.toContain("/p/");
  });

  test("une adresse invalide est refusée sans toucher la base", async () => {
    for (const email of ["", "pas-une-adresse", "a@b", null, 42, "x".repeat(250) + "@e.fr"]) {
      expect(await demanderNotification(JETON_PUBLIC, { email }, ORIGINE), String(email)).toEqual({ statut: "invalide" });
    }
    expect(await demanderNotification(JETON_PUBLIC, null, ORIGINE)).toEqual({ statut: "invalide" });
    expect(appels).toHaveLength(0);
  });

  test("un jeton public mal formé est « introuvable » sans toucher la base", async () => {
    expect(await demanderNotification("../admin", { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "introuvable" });
    expect(appels).toHaveLength(0);
  });

  test("un lien inconnu, archivé ou bloqué n'envoie rien", async () => {
    reponses["demander_notification"] = { data: [], error: null };
    expect(await demanderNotification(JETON_PUBLIC, { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "introuvable" });
    expect(envoyes).toHaveLength(0);
  });

  test("le plafond de la base (DL074) se dit « trop »", async () => {
    reponses["demander_notification"] = { data: null, error: { code: "DL074", message: "trop" } };
    expect(await demanderNotification(JETON_PUBLIC, { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "trop" });
  });

  test("le plafond de la BOUTIQUE (DL075, migration 194) se dit « trop » aussi, jamais « indisponible »", async () => {
    reponses["demander_notification"] = { data: null, error: { code: "DL075", message: "trop" } };
    expect(await demanderNotification(JETON_PUBLIC, { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "trop" });
  });

  test("⚠️ SANS CONFIGURATION D'ENVOI, RIEN N'EST DEMANDÉ À LA BASE", async () => {
    delete process.env["EMAIL_CLIENTS_DE"];
    expect(await demanderNotification(JETON_PUBLIC, { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "indisponible" });
    expect(appels).toHaveLength(0);
  });

  test("un e-mail qui ne part pas se dit « indisponible », jamais « envoyé »", async () => {
    resultatEnvoi = { statut: "refuse", motif: "HTTP 500", portee: "fournisseur" };
    expect(await demanderNotification(JETON_PUBLIC, { email: "a@exemple.test" }, ORIGINE)).toEqual({ statut: "indisponible" });
  });
});

describe("La confirmation et la désinscription", () => {
  test("la confirmation transmet l'EMPREINTE du jeton reçu", async () => {
    const jeton = "A".repeat(43);
    reponses["confirmer_notification"] = { data: [{ langue: "zh-CN" }], error: null };
    expect(await confirmerNotification(jeton)).toEqual({ statut: "ok", langue: "zh-CN" });
    expect(appels[0]?.args).toEqual({ p_token_hash: createHash("sha256").update(jeton).digest("hex") });
  });

  test("un jeton mal formé ou inconnu est « invalide »", async () => {
    expect(await confirmerNotification("court")).toEqual({ statut: "invalide" });
    expect(await confirmerNotification(undefined)).toEqual({ statut: "invalide" });
    expect(appels).toHaveLength(0);
    expect(await confirmerNotification("B".repeat(43))).toEqual({ statut: "invalide" });
  });

  test("la désinscription passe le jeton de désinscription tel quel", async () => {
    reponses["desabonner_notification"] = { data: [{ langue: "fr" }], error: null };
    expect(await desinscrireNotification("J".repeat(32))).toEqual({ statut: "ok", langue: "fr" });
    expect(await desinscrireNotification("../x")).toEqual({ statut: "invalide" });
  });
});

describe("L'envoi des étapes", () => {
  const LIGNE = {
    order_id: "00000000-0000-4000-8000-000000000001",
    etape: "livre",
    email: "client@exemple.test",
    jeton_public: JETON_PUBLIC,
    jeton_desinscription: "D".repeat(32),
    langue: "fr",
    nom_boutique: null,
    nom_de_lien: null,
  };

  test("CONTRE-TEST : une étape réservée part, avec le lien de la page et la désinscription en un clic", async () => {
    reponses["notifications_a_envoyer"] = { data: [LIGNE], error: null };
    reponses["reserver_notification"] = { data: true, error: null };
    expect(await envoyerNotificationsEnAttente(ORIGINE)).toEqual({ envoyes: 1, echoues: 0 });
    const m = envoyes[0];
    expect(m?.sujet).toContain("livrée");
    expect(m?.sujet).toContain("votre vendeur"); // boutique sans nom : repli traduit
    expect(m?.texte).toContain(`${ORIGINE}/p/${JETON_PUBLIC}`);
    expect(m?.desinscription).toBe(`${ORIGINE}/api/notification/desinscription?j=${"D".repeat(32)}`);
    expect(m?.texte).toContain(`${ORIGINE}/fr/notification?action=desinscrire&j=${"D".repeat(32)}`);
    // La réservation vient AVANT l'envoi.
    expect(appels.map((a) => a.nom)).toEqual(["notifications_a_envoyer", "reserver_notification"]);
  });

  test("⚠️ UN VENDEUR PRO VOIT SON LIEN À SON NOM DANS L'E-MAIL — jamais l'autre forme", async () => {
    // Défaut trouvé par la garde `lien-page-client` : l'e-mail fabriquait
    // `/p/<jeton>` à la main, là où le vendeur Pro a payé pour `/<son-nom>/<jeton>`.
    reponses["notifications_a_envoyer"] = { data: [{ ...LIGNE, nom_de_lien: "atelier-nord" }], error: null };
    reponses["reserver_notification"] = { data: true, error: null };
    await envoyerNotificationsEnAttente(ORIGINE);
    expect(envoyes[0]?.texte).toContain(`${ORIGINE}/atelier-nord/${JETON_PUBLIC}`);
    expect(envoyes[0]?.texte).not.toContain(`/p/${JETON_PUBLIC}`);
  });

  test("⚠️ UNE ÉTAPE DÉJÀ RÉSERVÉE N'EST PAS ENVOYÉE DEUX FOIS", async () => {
    reponses["notifications_a_envoyer"] = { data: [LIGNE], error: null };
    reponses["reserver_notification"] = { data: false, error: null };
    expect(await envoyerNotificationsEnAttente(ORIGINE)).toEqual({ envoyes: 0, echoues: 0 });
    expect(envoyes).toHaveLength(0);
  });

  test("⚠️ UN ENVOI ÉCHOUÉ REND LA RÉSERVATION, et le lot s'arrête", async () => {
    reponses["notifications_a_envoyer"] = { data: [LIGNE, { ...LIGNE, order_id: "00000000-0000-4000-8000-000000000002" }], error: null };
    reponses["reserver_notification"] = { data: true, error: null };
    resultatEnvoi = { statut: "refuse", motif: "HTTP 429", portee: "fournisseur" };
    expect(await envoyerNotificationsEnAttente(ORIGINE)).toEqual({ envoyes: 0, echoues: 1 });
    const rendue = appels.find((a) => a.nom === "rendre_notification")?.args;
    expect(rendue).toEqual({ p_order: LIGNE.order_id, p_etape: "livre" });
    expect(envoyes, "le lot a continué après un refus du fournisseur").toHaveLength(1);
  });

  test("⚠️ UN REFUS PROPRE À UN DESTINATAIRE N'ARRÊTE PAS LE LOT (audit ECC, 24/09/2026)", async () => {
    /*
     * Le `break` supposait tout refus « fournisseur » (quota, clé). Un refus qui ne
     * vise QUE ce message (HTTP 422 : adresse rejetée) revient pourtant en tête
     * de liste à chaque passage — et bloquait TOUTE la file, pour toujours.
     */
    const autre = { ...LIGNE, order_id: "00000000-0000-4000-8000-000000000002" };
    reponses["notifications_a_envoyer"] = { data: [LIGNE, autre], error: null };
    reponses["reserver_notification"] = { data: true, error: null };
    fileEnvoi = [{ statut: "refuse", motif: "HTTP 422", portee: "message" }, { statut: "envoye" }];
    expect(await envoyerNotificationsEnAttente(ORIGINE)).toEqual({ envoyes: 1, echoues: 1 });
    expect(envoyes).toHaveLength(2);
    // Et la réservation du refusé est bien rendue : il repartira.
    expect(appels.filter((a) => a.nom === "rendre_notification").map((a) => a.args)).toEqual([
      { p_order: LIGNE.order_id, p_etape: "livre" },
    ]);
  });

  test("⚠️ UNE RÉSERVATION QUI NE SE REND PAS EST DITE — l'étape ne repartirait jamais", async () => {
    reponses["notifications_a_envoyer"] = { data: [LIGNE], error: null };
    reponses["reserver_notification"] = { data: true, error: null };
    reponses["rendre_notification"] = { data: null, error: { message: "coupure" } };
    resultatEnvoi = { statut: "refuse", motif: "HTTP 500", portee: "fournisseur" };
    const erreurs: string[] = [];
    vi.mocked(console.error).mockImplementation((...a: unknown[]) => {
      erreurs.push(a.map(String).join(" "));
    });
    await envoyerNotificationsEnAttente(ORIGINE);
    expect(erreurs.some((e) => e.includes(LIGNE.order_id) && e.includes("coupure"))).toBe(true);
  });

  test("⚠️ SANS CONFIGURATION, RIEN N'EST RÉSERVÉ — donc rien n'est perdu", async () => {
    delete process.env["RESEND_API_KEY"];
    expect(await envoyerNotificationsEnAttente(ORIGINE)).toEqual({ envoyes: 0, echoues: 0 });
    expect(appels).toHaveLength(0);
  });
});
