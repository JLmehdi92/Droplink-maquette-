import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";

/**
 * LES REJETS DU FOURNISSEUR, ET L'ARRÊT QU'IL ANNONCE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX DÉFAUTS RÉELS, TROUVÉS LE 01/09/2026 EN LISANT LEUR TABLE DE CODES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. TOUT REJET ÉTAIT TRADUIT EN `refuse`. Or `refuse` déclenche
 *    `marquer_prise_en_charge(p_abandonne = true)` : le colis est abandonné
 *    DÉFINITIVEMENT. Et `-18019901` signifie « Tracking number is already
 *    registered » — c'est-à-dire que le colis EST suivi et que le quota EST
 *    déjà payé. On abandonnait un suivi qui fonctionnait, après l'avoir payé.
 *
 * 2. `TRACKING_STOPPED` N'ÉTAIT PAS DISTINGUÉ de `TRACKING_UPDATED`. L'arrêt
 *    n'était détecté qu'indirectement, par l'absence d'état. Accompagné du
 *    dernier état connu, il passait pour une mise à jour ordinaire — et la
 *    cadence continuait d'interroger un numéro que plus personne ne suit.
 *
 * ⚠️ ET UNE PRÉMISSE FAUSSE, corrigée avec eux. L'abandon immédiat était
 * justifié par « chaque tentative se paie ». Leur documentation dit le
 * contraire, verbatim : « **Successfully** registering 1 tracking number equals
 * 1 quota ». Un enregistrement REJETÉ ne consomme rien : réessayer est gratuit,
 * ce qui renverse tout le calcul.
 */

const CLE = "cle-de-test-17track-0123456789";

beforeEach(() => {
  process.env["TRACKING_API_KEY"] = CLE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["TRACKING_API_KEY"];
});

/** Simule leur réponse HTTP 200 portant un rejet au code donné. */
function repondreAvecRejet(code: number): void {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      code: 0,
      data: { accepted: [], rejected: [{ number: "RR123456789CN", error: { code, message: "" } }] },
    }),
  );
}

describe("Les rejets — ce qui est définitif et ce qui ne l'est pas", () => {
  test("CONTRE-TEST : une prise en charge ACCEPTÉE reste un succès", async () => {
    /*
     * Il vient en premier. Toute cette suite décrit des rejets : une
     * implémentation qui rendrait TOUJOURS « indisponible » les passerait
     * presque tous, et le produit n'enregistrerait plus jamais un colis.
     */
    vi.stubGlobal("fetch", async () =>
      Response.json({ code: 0, data: { accepted: [{ number: "RR123456789CN" }], rejected: [] } }),
    );
    const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
    expect(r.statut).toBe("vide");
  });

  test("« déjà enregistré » (-18019901) est un SUCCÈS, pas un refus", async () => {
    /*
     * LE DÉFAUT LE PLUS COÛTEUX DES DEUX. Le cas survient dès qu'une prise en
     * charge aboutit chez eux mais que notre écriture échoue ensuite, ou qu'un
     * même numéro revient par un autre chemin. Le traduire en `refuse`
     * abandonnait le colis POUR TOUJOURS — après avoir payé le quota — et le
     * vendeur ne voyait qu'une page qui ne bouge plus.
     */
    repondreAvecRejet(-18019901);
    const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
    expect(r.statut, "un colis déjà suivi et déjà payé était abandonné").toBe("vide");
  });

  test("un code DÉFINITIF reste un refus", async () => {
    // Sans eux, plus rien ne serait jamais définitif et un numéro malformé
    // serait réessayé jusqu'à la fin de la fenêtre, pour rien.
    for (const code of [-18010013, -18019910]) {
      repondreAvecRejet(code);
      const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
      expect(r.statut, `le code ${code} devrait être définitif`).toBe("refuse");
    }
  });

  test("les codes TEMPORAIRES ne font PLUS abandonner le colis", async () => {
    /*
     * Quota épuisé, limite quotidienne, IP non autorisée, clé invalide, compte
     * désactivé : aucun ne dit quoi que ce soit du COLIS. Les traduire en refus
     * abandonnait des suivis parfaitement valides pour une panne de compte —
     * et un rechargement de quota ne les aurait jamais ressuscités.
     */
    for (const code of [-18019908, -18019907, -18010001, -18010002, -18010004, -18010003]) {
      repondreAvecRejet(code);
      const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
      expect(r.statut, `le code ${code} ne doit pas abandonner le colis`).toBe("indisponible");
    }
  });

  test("un code INCONNU part en `indisponible`, jamais en refus", async () => {
    /*
     * L'ASYMÉTRIE EST LE CŒUR DE LA CORRECTION. Se tromper en `refuse` abandonne
     * un colis pour toujours et laisse le client d'un vendeur devant une page
     * morte : c'est irréversible. Se tromper en `indisponible` fait reprendre le
     * colis, et la fenêtre existante — 7 jours, 16 interrogations — l'abandonne
     * de toute façon : c'est borné. Le défaut par défaut doit être le borné.
     */
    for (const code of [-18099999, -1, 42]) {
      repondreAvecRejet(code);
      const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
      expect(r.statut, `un code inconnu (${code}) ne doit jamais abandonner`).toBe("indisponible");
    }
  });

  test("« transporteur indétectable » EST définitif — et je m'étais trompé", async () => {
    /*
     * ⚠️ J'AVAIS D'ABORD CLASSÉ CE CODE EN « TEMPORAIRE », en raisonnant que la
     * détection réussirait plus tard, une fois le numéro scanné. C'est une suite
     * existante — `suivi-cle-absente` — qui a rougi et m'a fait relire.
     *
     * Elle avait raison : leur détection lit le FORMAT du numéro, pas son
     * historique de scans. Un format inconnu aujourd'hui le restera dans sept
     * jours. Et le vendeur a besoin d'apprendre TOUT DE SUITE qu'il doit
     * préciser le transporteur, pas après une semaine de silence.
     *
     * Ce qui était faux dans l'ancien raisonnement, c'est seulement son
     * argument de COÛT — « payer seize fois » — puisqu'un enregistrement rejeté
     * ne consomme aucun quota. La conclusion, elle, tenait.
     */
    repondreAvecRejet(-18019903);
    const r = await dixSeptTrack.prendreEnCharge("RR123456789CN", null);
    expect(r.statut).toBe("refuse");
  });
});

describe("L'arrêt de suivi annoncé par le fournisseur", () => {
  /** Une notification complète, avec un dernier état parfaitement valide. */
  function notification(evenement: string): string {
    return JSON.stringify({
      event: evenement,
      data: {
        number: "RR123456789CN",
        track_info: {
          latest_status: { status: "Delivered" },
          latest_event: { time_utc: "2026-09-01T10:00:00Z", description: "Delivered" },
          milestone: [{ key_stage: "Delivered", time_utc: "2026-09-01T10:00:00Z" }],
        },
      },
    });
  }

  test("`TRACKING_STOPPED` est signalé — MÊME avec un état valide", () => {
    /*
     * LE CŒUR DU DÉFAUT. Rien n'oblige un arrêt à venir vide, et le cas normal
     * est justement l'inverse : ils cessent de suivre quinze jours APRÈS une
     * livraison. L'état est donc complet, et l'arrêt passait inaperçu.
     */
    const r = dixSeptTrack.lireNotification(notification("TRACKING_STOPPED"));
    expect(r.statut, "le dernier état doit être ingéré malgré l'arrêt").toBe("ok");
    expect(r.arrete, "l'arrêt n'a pas été signalé").toBe(true);
  });

  test("CONTRE-TEST : une mise à jour ordinaire ne signale AUCUN arrêt", () => {
    // Sans lui, une implémentation qui marquerait toujours `arrete` fermerait
    // le suivi de chaque colis à sa première notification.
    const r = dixSeptTrack.lireNotification(notification("TRACKING_UPDATED"));
    expect(r.statut).toBe("ok");
    expect(r.arrete).toBeUndefined();
  });

  test("la reconnaissance résiste à la CASSE et aux séparateurs", () => {
    /*
     * Parier sur `TRACKING_STOPPED` exactement, c'est accepter que le suivi
     * s'éteigne en silence le jour où ils écrivent autrement. C'est la même
     * précaution que pour les statuts, et elle a déjà servi une fois.
     */
    for (const forme of ["tracking_stopped", "Tracking_Stopped", "TrackingStopped", " TRACKING-STOPPED "]) {
      expect(dixSeptTrack.lireNotification(notification(forme)).arrete, forme).toBe(true);
    }
  });

  test("un événement inconnu ne ferme rien", () => {
    expect(dixSeptTrack.lireNotification(notification("TRACKING_RESUMED")).arrete).toBeUndefined();
    expect(dixSeptTrack.lireNotification(notification("")).arrete).toBeUndefined();
  });
});
