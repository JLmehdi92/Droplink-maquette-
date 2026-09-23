import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ReponsePort } from "@/lib/tracking/provider/port";

/**
 * L'INGESTION DU SUIVI — le point où ce que dit le fournisseur devient l'état
 * d'un colis, pour la feature n° 2 (« c'est où mon colis »).
 *
 * Aucun test ne l'appelait le 23/09/2026 : son exception de couverture disait
 * « atteinte par la fumée », ce qui n'avait jamais été mesuré. Ce fichier éprouve
 * ce qui part vers la base, ce qui n'y part PAS, et surtout les pannes qui en
 * déclenchent d'autres :
 *
 * - une écriture qui échoue doit RENDRE la marque de déduplication, sinon le
 *   fournisseur qui rejoue la notification se voit répondre « déjà vue » et
 *   l'étape du colis est perdue POUR TOUJOURS ;
 * - une déduplication indisponible ne doit rien écrire, sinon un rejeu
 *   compterait deux fois.
 */

const appels: { nom: string; args: Record<string, unknown> }[] = [];
let reponses: Record<string, { data: unknown; error: { message: string } | null }> = {};

vi.mock("@/lib/supabase/system", () => ({
  creerClientSysteme: () => ({
    rpc: async (nom: string, args: Record<string, unknown>) => {
      appels.push({ nom, args });
      return reponses[nom] ?? { data: null, error: null };
    },
  }),
}));
const emettre = vi.fn(async () => undefined);
vi.mock("@/lib/instrumentation/emettre", () => ({ emettre }));

const { ingererEtat } = await import("@/lib/tracking/ingestion");

const NUMERO = "LX123456789CN";

function etat(points: number, statutBrut: string | null = "InTransit"): ReponsePort {
  const debut = Date.UTC(2026, 8, 1);
  return {
    statut: "ok",
    brut: { fournisseur: "brut" },
    etat: {
      statutBrut,
      jalons: [],
      transporteur: 3011,
      estimationDu: null,
      estimationAu: null,
      points: Array.from({ length: points }, (_, i) => ({
        instant: new Date(debut + i * 6 * 3600_000).toISOString(),
        description: "Passage " + String(i),
        lieu: "Lieu " + String(i),
        etape: null,
      })),
    },
  };
}

const noms = (): string[] => appels.map((a) => a.nom);

beforeEach(() => {
  appels.length = 0;
  reponses = {
    notification_deja_vue: { data: false, error: null },
    appliquer_etat_colis: { data: [{ colis: 1, premier_scan: false }], error: null },
    compter_interrogation_vide: { data: 1, error: null },
    arreter_suivi: { data: 1, error: null },
  };
  emettre.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Un état rapporté par le fournisseur", () => {
  test("CONTRE-TEST : l'étape est traduite et écrite, pour le numéro nettoyé", async () => {
    const r = await ingererEtat("  " + NUMERO + " ", etat(3, "Delivered"));
    expect(r).toEqual({ statut: "applique", colis: 1, inconnu: false });
    const ecrit = appels.find((a) => a.nom === "appliquer_etat_colis")?.args;
    expect(ecrit?.["p_numero"]).toBe(NUMERO);
    expect(ecrit?.["p_etape"]).toBe("livre");
    expect(ecrit?.["p_transporteur"]).toBe("3011");
    expect((ecrit?.["p_points"] as unknown[]).length).toBe(3);
  });

  test("⚠️ LA DATE DE DÉPART EST CELLE DU PREMIER POINT, MÊME AU-DELÀ DU PLAFOND D'AFFICHAGE", async () => {
    // 40 points : l'affichage n'en garde que 30, les plus récents. Le départ
    // réel est le plus ancien — le perdre donnait au client dix jours d'écart.
    await ingererEtat(NUMERO, etat(40));
    const ecrit = appels.find((a) => a.nom === "appliquer_etat_colis")?.args;
    expect((ecrit?.["p_points"] as unknown[]).length).toBe(30);
    expect(ecrit?.["p_premier_mouvement"]).toBe(new Date(Date.UTC(2026, 8, 1)).toISOString());
  });

  test("⚠️ LE NUMÉRO DE SUIVI NE PART JAMAIS ENTIER VERS L'ANALYTICS", async () => {
    // C'est une donnée du client d'un vendeur : quatre caractères suffisent à
    // relier deux événements sans identifier personne. Contrôle PAR VALEUR.
    reponses["appliquer_etat_colis"] = { data: [{ colis: 2, premier_scan: true }], error: null };
    await ingererEtat(NUMERO, etat(2));
    expect(emettre).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(emettre.mock.calls)).not.toContain(NUMERO);
    expect(JSON.stringify(emettre.mock.calls)).not.toContain(NUMERO.slice(0, 5));
  });

  test("le premier scan n'est émis que sur la TRANSITION rendue par la base", async () => {
    await ingererEtat(NUMERO, etat(2));
    expect(emettre).toHaveBeenCalledTimes(1);
  });

  test("un numéro qu'aucun colis ne porte n'émet rien — un compteur de coût ne part pas en undefined", async () => {
    reponses["appliquer_etat_colis"] = { data: [], error: null };
    expect(await ingererEtat(NUMERO, etat(2))).toEqual({ statut: "applique", colis: 0, inconnu: false });
    expect(emettre).not.toHaveBeenCalled();
  });

  test("un statut inconnu ne fait pas bouger l'étape, et il est signalé", async () => {
    const r = await ingererEtat(NUMERO, etat(1, "StatutJamaisVu"));
    expect(r).toMatchObject({ statut: "applique", inconnu: true });
    expect(console.warn).toHaveBeenCalled();
  });

  test("un numéro vide ne touche pas la base", async () => {
    expect(await ingererEtat("   ", etat(1))).toEqual({ statut: "ignore", motif: "numero-vide" });
    expect(appels).toHaveLength(0);
  });

  test("une réponse en échec du fournisseur n'écrit rien", async () => {
    const r = await ingererEtat(NUMERO, { statut: "indisponible", motif: "delai" });
    expect(r).toEqual({ statut: "ignore", motif: "indisponible" });
    expect(noms()).not.toContain("appliquer_etat_colis");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Une notification poussée (déduplication)", () => {
  test("⚠️ UN REJEU N'EST APPLIQUÉ QU'UNE FOIS", async () => {
    reponses["notification_deja_vue"] = { data: true, error: null };
    expect(await ingererEtat(NUMERO, etat(2), "empreinte-1")).toEqual({ statut: "ignore", motif: "rejeu" });
    expect(noms()).not.toContain("appliquer_etat_colis");
  });

  test("une déduplication en panne n'écrit rien — sinon un rejeu compterait double", async () => {
    reponses["notification_deja_vue"] = { data: null, error: { message: "panne" } };
    const r = await ingererEtat(NUMERO, etat(2), "empreinte-1");
    expect(r).toEqual({ statut: "ignore", motif: "deduplication-indisponible" });
    expect(noms()).toEqual(["notification_deja_vue"]);
  });

  test("⚠️ UNE ÉCRITURE EN ÉCHEC REND LA MARQUE — sinon le rejeu du fournisseur serait « déjà vu »", async () => {
    /*
     * LA CASCADE QUE CE TEST EXISTE POUR ATTRAPER. La marque est posée avant
     * l'écriture ; si l'écriture échoue et que la marque reste, le fournisseur
     * rejoue la notification, s'entend répondre « déjà vue », et cesse. L'étape
     * du colis est perdue définitivement, et la page du client reste figée.
     */
    reponses["appliquer_etat_colis"] = { data: null, error: { message: "délai" } };
    const r = await ingererEtat(NUMERO, etat(2), "empreinte-1");
    expect(r).toEqual({ statut: "ignore", motif: "ecriture" });
    expect(appels.find((a) => a.nom === "liberer_notification_vue")?.args).toEqual({ p_cle: "empreinte-1" });
  });

  test("même chose sur une interrogation vide en échec", async () => {
    reponses["compter_interrogation_vide"] = { data: null, error: { message: "délai" } };
    await ingererEtat(NUMERO, { statut: "vide", brut: null }, "empreinte-2");
    expect(appels.find((a) => a.nom === "liberer_notification_vue")?.args).toEqual({ p_cle: "empreinte-2" });
  });

  test("la cadence (sans empreinte) ne déduplique pas : un colis immobile se réinterroge normalement", async () => {
    await ingererEtat(NUMERO, etat(2));
    expect(noms()).not.toContain("notification_deja_vue");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("L'arrêt du suivi", () => {
  test("seul le fournisseur l'annonce : l'arrêt est écrit quand il le dit", async () => {
    await ingererEtat(NUMERO, { ...etat(1), arrete: true });
    expect(appels.find((a) => a.nom === "arreter_suivi")?.args).toMatchObject({ p_numero: NUMERO });
  });

  test("⚠️ UNE INTERROGATION VIDE N'ARRÊTE RIEN À ELLE SEULE", async () => {
    // « Je n'ai rien vu » n'est pas « il n'y a plus rien à voir » : fermer le
    // suivi sur un silence abandonnerait un colis encore en route.
    const r = await ingererEtat(NUMERO, { statut: "vide", brut: null });
    expect(r).toEqual({ statut: "vide", colis: 1 });
    expect(noms()).not.toContain("arreter_suivi");
  });
});
