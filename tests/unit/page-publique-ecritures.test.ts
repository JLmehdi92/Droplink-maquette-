import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * LES DEUX ÉCRITURES DE LA PAGE CLIENT — celles qu'un visiteur SANS COMPTE
 * déclenche.
 *
 * `arbitrerQc` (le client valide ou refuse les photos) et `enregistrerVue` (le
 * compteur qui dit au vendeur si son lien a été ouvert) étaient à 0 % de
 * couverture le 23/09/2026. La mémoire du projet le notait déjà le 03/09 :
 * « restent non pilotés : l'arbitrage QC ». Ce sont pourtant les deux seules
 * surfaces du produit où quelqu'un qui n'a jamais eu de compte ÉCRIT en base.
 *
 * Les fonctions SQL derrière (`arbitrer_qc`, `enregistrer_vue`) vivent sur la
 * base ; ce qu'on éprouve ici est ce que l'application laisse partir vers elles
 * — et surtout ce qu'elle refuse de laisser partir.
 */

const JETON = "xK9mQ2pL7vR4nT8wY3zB1";
const IP_SENTINELLE = "203.0.113.77"; // plage de documentation, RFC 5737

const rpc = { anon: vi.fn(), systeme: vi.fn() };
let profilConnecte: { profilId: string } | null = null;
let ip: string | null = IP_SENTINELLE;
let agent: string | null = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

vi.mock("@/lib/supabase/anon", () => ({
  creerClientAnonyme: () => ({ rpc: (...a: unknown[]) => rpc.anon(...a) }),
}));
vi.mock("@/lib/supabase/system", () => ({
  creerClientSysteme: () => ({ rpc: (...a: unknown[]) => rpc.systeme(...a) }),
}));
vi.mock("@/lib/instrumentation/emettre", () => ({ emettreApres: () => undefined }));
vi.mock("@/lib/comptes/profil", () => ({ lireProfilVendeur: async () => profilConnecte }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(agent === null ? {} : { "user-agent": agent }),
}));
vi.mock("@/lib/limitation/empreinte", async () => {
  // L'EMPREINTE EST LA VRAIE : c'est elle qu'on éprouve. Seules les sources de
  // la requête (adresse, pays) sont substituées, faute de requête.
  const vraie = await vi.importActual<typeof import("@/lib/limitation/empreinte")>(
    "@/lib/limitation/empreinte",
  );
  return { ...vraie, adresseAppelant: async () => ip, paysAppelant: async () => "FR" };
});

process.env["HASH_SALT"] = "sel-de-test-pour-l-empreinte";

const { arbitrerQc } = await import("@/lib/page-publique/qc");
const { enregistrerVue } = await import("@/lib/page-publique/vue");
const { empreinte } = await import("@/lib/limitation/empreinte");

beforeEach(() => {
  rpc.anon.mockReset().mockResolvedValue({ data: "approuve", error: null });
  rpc.systeme.mockReset().mockResolvedValue({ data: true, error: null });
  profilConnecte = null;
  ip = IP_SENTINELLE;
  agent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'arbitrage QC du client", () => {
  test("CONTRE-TEST : une décision valide part, et le statut rendu est celui de la base", async () => {
    expect(await arbitrerQc(JETON, { decision: "approuve" })).toEqual({
      statut: "ok",
      qc: "approuve",
    });
    expect(rpc.anon).toHaveBeenCalledWith("arbitrer_qc", {
      p_jeton: JETON,
      p_decision: "approuve",
      p_commentaire: "",
    });
  });

  test("⚠️ UN JETON MAL FORMÉ EST REFUSÉ SANS TOUCHER LA BASE", async () => {
    /*
     * C'est une adresse PUBLIQUE, donc balayable en masse. Laisser partir chaque
     * chaîne de l'URL vers la base ferait payer un aller-retour à chaque essai
     * d'un balayage — et c'est le motif exact pour lequel `JetonPublic` existe.
     */
    for (const faux of ["", "court", "xK9mQ2pL7vR4nT8wY3zB1'--", "../../admin", "a".repeat(65)]) {
      expect(await arbitrerQc(faux, { decision: "approuve" }), faux).toEqual({ statut: "refuse" });
    }
    expect(rpc.anon).not.toHaveBeenCalled();
  });

  test("une décision inconnue est refusée avant la base — pas « supprimer », pas « admin »", async () => {
    for (const decision of ["supprimer", "admin", "APPROUVE", "", null, 1]) {
      expect(await arbitrerQc(JETON, { decision }), String(decision)).toEqual({
        statut: "demande-invalide",
      });
    }
    expect(await arbitrerQc(JETON, null)).toEqual({ statut: "demande-invalide" });
    expect(rpc.anon).not.toHaveBeenCalled();
  });

  test("un commentaire de plus de 1 000 caractères est refusé — la borne est EXACTE", async () => {
    // Un visiteur anonyme ne remplit pas la base de mégaoctets de texte.
    expect(await arbitrerQc(JETON, { decision: "refuse", commentaire: "x".repeat(1001) })).toEqual({
      statut: "demande-invalide",
    });
    expect(rpc.anon).not.toHaveBeenCalled();
    rpc.anon.mockResolvedValue({ data: "refuse", error: null });
    expect(await arbitrerQc(JETON, { decision: "refuse", commentaire: "x".repeat(1000) })).toEqual({
      statut: "ok",
      qc: "refuse",
    });
  });

  test("une erreur de la base rend « refuse » — le MÊME refus qu'un jeton inconnu", async () => {
    // Deux refus distincts (« ce jeton n'existe pas » / « la base a échoué »)
    // seraient un oracle : on pourrait tester des jetons et lire la différence.
    rpc.anon.mockResolvedValue({ data: null, error: { message: "jeton inconnu" } });
    expect(await arbitrerQc(JETON, { decision: "approuve" })).toEqual({ statut: "refuse" });
    rpc.anon.mockResolvedValue({ data: null, error: null });
    expect(await arbitrerQc(JETON, { decision: "approuve" })).toEqual({ statut: "refuse" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'enregistrement d'une vue", () => {
  test("CONTRE-TEST : une vraie visite est enregistrée", async () => {
    expect(await enregistrerVue(JETON)).toBe("enregistree");
    expect(rpc.systeme).toHaveBeenCalledTimes(1);
  });

  test("⚠️ L'ADRESSE IP DU CLIENT NE PART JAMAIS EN CLAIR VERS LA BASE", async () => {
    /*
     * CONTRÔLE PAR VALEUR, PAS PAR NOM. On ne vérifie pas qu'un champ s'appelle
     * `p_ip_hash` — une IP republiée sous `p_meta` ou `p_debug` survivrait à ce
     * contrôle-là. On cherche la VALEUR sentinelle dans TOUT ce qui part, et on
     * exige qu'elle n'y soit nulle part : le client du vendeur n'a pas de compte,
     * n'a rien consenti, et son adresse est une donnée personnelle.
     */
    await enregistrerVue(JETON);
    const tout = JSON.stringify(rpc.systeme.mock.calls);
    expect(tout, "l'IP du visiteur est partie en clair").not.toContain(IP_SENTINELLE);
    // Et ce qui part à sa place est bien son empreinte salée, pas autre chose.
    const args = rpc.systeme.mock.calls[0]?.[1] as { p_ip_hash: string };
    expect(args.p_ip_hash).toBe(empreinte(IP_SENTINELLE));
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{32}$/);
  });

  test("le user-agent brut ne part pas non plus — seulement sa classe, hachée", async () => {
    await enregistrerVue(JETON);
    expect(JSON.stringify(rpc.systeme.mock.calls)).not.toContain("iPhone OS 17_0");
  });

  test("une visite sans IP ou sans user-agent est ignorée sans toucher la base", async () => {
    // Un robot qui ne s'annonce pas ne doit pas faire croire au vendeur que son
    // client a ouvert le lien.
    ip = null;
    expect(await enregistrerVue(JETON)).toBe("ignoree");
    ip = IP_SENTINELLE;
    agent = null;
    expect(await enregistrerVue(JETON)).toBe("ignoree");
    agent = "   ";
    expect(await enregistrerVue(JETON)).toBe("ignoree");
    expect(rpc.systeme).not.toHaveBeenCalled();
  });

  test("un jeton mal formé est ignoré sans toucher la base", async () => {
    expect(await enregistrerVue("pas-un-jeton")).toBe("ignoree");
    expect(rpc.systeme).not.toHaveBeenCalled();
  });

  test("le profil du vendeur connecté est transmis — pour qu'il ne compte pas ses propres vues", async () => {
    // Un vendeur qui vérifie sa page vingt fois ne doit pas lire « ouvert 20 fois ».
    profilConnecte = { profilId: "00000000-0000-4000-8000-000000000001" };
    await enregistrerVue(JETON);
    const args = rpc.systeme.mock.calls[0]?.[1] as { p_profil: string };
    expect(args.p_profil).toBe("00000000-0000-4000-8000-000000000001");
  });

  test("une vue déjà comptée aujourd'hui n'est pas « enregistrée »", async () => {
    rpc.systeme.mockResolvedValue({ data: false, error: null });
    expect(await enregistrerVue(JETON)).toBe("deja-vue-aujourdhui");
  });

  test("une erreur de la base est ignorée — la page client ne tombe pas pour un compteur", async () => {
    rpc.systeme.mockResolvedValue({ data: null, error: { message: "délai dépassé" } });
    await expect(enregistrerVue(JETON)).resolves.toBe("ignoree");
  });
});
