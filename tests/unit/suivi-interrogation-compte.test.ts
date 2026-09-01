import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";

/**
 * L'INTERROGATION AUSSI EXIGE UN ACCUSÉ POSITIF.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT, ET POURQUOI IL EST LE PLUS COÛTEUX DE TOUT LE SUIVI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `prendreEnCharge` passe par `appeler`, qui refuse depuis le 30/08 un 200 dont
 * le `code` de niveau COMPTE est non nul — quota épuisé, clé révoquée, IP hors
 * liste blanche, compte désactivé. `interroger`, elle, fait son PROPRE `fetch`
 * et n'a jamais lu ce champ : elle ne regardait que `data.accepted`.
 *
 * Or leur réponse d'erreur de compte est un HTTP **200** portant `code` non nul
 * et `data: null`. `accepted` valant alors `undefined`, l'interrogation rendait
 * « vide » — c'est-à-dire, dans notre vocabulaire, « le transporteur n'a rien
 * encore ». La chaîne complète :
 *
 *   `vide` → `compter_interrogation_vide` → `empty_count + 1` ET un appel imputé
 *   au vendeur → `decider()` abandonne à SEIZE vides (« trop-de-vides »),
 *   c'est-à-dire en DEUX JOURS à trois heures d'intervalle.
 *
 * Donc : une liste blanche d'IP oubliée dans leur console — le piège numéro un
 * du déploiement sur Cloudflare Workers, dont les adresses de sortie sont
 * dynamiques — abandonnait DÉFINITIVEMENT le suivi de tous les colis de tous
 * les vendeurs en quarante-huit heures, en gonflant au passage le seul compteur
 * de coût du produit. Rien nulle part n'aurait nommé la cause : « vide » est
 * une réponse parfaitement normale.
 *
 * C'est L-025 dans sa forme exacte : la garde de L-024 a été écrite depuis le
 * champ de vision de la CORRECTION — `/register` — et le chemin jumeau, appelé
 * bien plus souvent, est resté découvert.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ET LA DISTINCTION QUI COMPTE : TOUS LES REJETS NE SE VALENT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `-18019909` — « aucune information disponible pour l'instant » — est
 * exactement ce que le brief décrit : « un numéro fraîchement collé n'est
 * souvent pas encore scanné ». C'est un VRAI vide, il se paie, et il doit
 * continuer de compter. Le confondre avec une panne de compte serait le défaut
 * symétrique : le colis ne serait jamais abandonné, et on paierait pour
 * toujours.
 */

const CLE = "cle-de-test-17track-0123456789";
const NUMERO = "RR123456789CN";

beforeEach(() => {
  process.env["TRACKING_API_KEY"] = CLE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["TRACKING_API_KEY"];
});

/** Leur réponse : un HTTP 200 quel que soit le contenu. */
function repondre(corps: unknown): void {
  vi.stubGlobal("fetch", async () => Response.json(corps));
}

/** Un colis avec un état complet — le cas nominal. */
const COLIS_VIVANT = {
  number: NUMERO,
  track_info: {
    latest_status: { status: "InTransit" },
    latest_event: { time_utc: "2026-09-01T10:00:00Z", description: "Departed" },
    milestone: [{ key_stage: "Departure", time_utc: "2026-09-01T10:00:00Z" }],
  },
};

describe("CONTRE-TESTS — ce qui doit continuer de passer", () => {
  test("un état complet reste `ok`", async () => {
    /*
     * IL VIENT EN PREMIER. Tout ce fichier décrit des refus : une implémentation
     * qui rendrait TOUJOURS `indisponible` les passerait tous, et le produit
     * n'ingérerait plus jamais un seul point de passage.
     */
    repondre({ code: 0, data: { accepted: [COLIS_VIVANT], rejected: [] } });
    const r = await dixSeptTrack.interroger(NUMERO, null);
    expect(r.statut).toBe("ok");
  });

  test("un succès sans état reste `vide` — le numéro pas encore scanné", async () => {
    repondre({ code: 0, data: { accepted: [], rejected: [] } });
    const r = await dixSeptTrack.interroger(NUMERO, null);
    expect(r.statut).toBe("vide");
  });

  test("`code: 200` est accepté comme `code: 0` — les deux conventions circulent", async () => {
    repondre({ code: 200, data: { accepted: [COLIS_VIVANT], rejected: [] } });
    expect((await dixSeptTrack.interroger(NUMERO, null)).statut).toBe("ok");
  });

  test("un `code` absent ne bloque rien", async () => {
    repondre({ data: { accepted: [COLIS_VIVANT] } });
    expect((await dixSeptTrack.interroger(NUMERO, null)).statut).toBe("ok");
  });
});

describe("⚠️ UNE PANNE DE COMPTE N'EST PAS UN COLIS SANS NOUVELLE", () => {
  test("chaque code de compte rend `indisponible`, JAMAIS `vide`", async () => {
    /*
     * Le tableau vient de leur documentation. `-18010001` est celui qui compte
     * le plus : c'est la liste blanche d'IP, incompatible avec des adresses de
     * sortie dynamiques, et c'est le premier appel en production qui la
     * révélerait.
     */
    const CODES = [
      -18010001, // IP non autorisée
      -18010002, // clé invalide
      -18010004, // compte désactivé
      -18019907, // limite quotidienne
      -18019908, // quota épuisé
    ];

    for (const code of CODES) {
      repondre({ code, data: null });
      const r = await dixSeptTrack.interroger(NUMERO, null);
      expect(
        r.statut,
        `le code ${code} est rendu « vide » : chaque passage de cadence l'imputerait ` +
          `comme un appel payé et rapprocherait le colis de l'abandon définitif`,
      ).toBe("indisponible");
      expect("motif" in r ? r.motif : null).toBe("code-" + String(code));
    }
  });

  test("un code INCONNU part en `indisponible`, jamais en `vide` ni en refus", async () => {
    // L'asymétrie est la même que sur la prise en charge : se tromper en
    // `indisponible` fait reprendre le colis, et la fenêtre de sept jours
    // l'abandonne de toute façon. Se tromper en `vide` fait payer et abandonner.
    for (const code of [-18099999, -1, 42]) {
      repondre({ code, data: null });
      expect((await dixSeptTrack.interroger(NUMERO, null)).statut).toBe("indisponible");
    }
  });
});

describe("Les rejets de l'interrogation", () => {
  function rejeter(code: number): void {
    repondre({
      code: 0,
      data: { accepted: [], rejected: [{ number: NUMERO, error: { code, message: "" } }] },
    });
  }

  test("« aucune information pour l'instant » (-18019909) EST un vide, et se paie", async () => {
    /*
     * C'est le cas du brief : le vendeur imprime son étiquette, colle le numéro,
     * et dépose le colis le lendemain. Le rendre `indisponible` serait le défaut
     * symétrique — `empty_count` n'avancerait plus, la fenêtre d'abandon ne se
     * refermerait jamais, et un numéro erroné serait interrogé indéfiniment.
     */
    rejeter(-18019909);
    expect((await dixSeptTrack.interroger(NUMERO, null)).statut).toBe("vide");
  });

  test("« pas encore enregistré » (-18019902) n'est PAS un vide", async () => {
    /*
     * Il dit que notre prise en charge n'a pas pris chez eux alors que
     * `registered_at` affirme le contraire. Le compter comme un vide le ferait
     * abandonner en deux jours ; le nommer le rend lisible dans le journal, et
     * la fenêtre de sept jours borne quand même le coût.
     */
    rejeter(-18019902);
    const r = await dixSeptTrack.interroger(NUMERO, null);
    expect(r.statut).toBe("indisponible");
    expect("motif" in r ? r.motif : null).toBe("code--18019902");
  });

  test("un code DÉFINITIF reste un refus", async () => {
    for (const code of [-18010013, -18019903, -18019910]) {
      rejeter(code);
      expect((await dixSeptTrack.interroger(NUMERO, null)).statut, String(code)).toBe("refuse");
    }
  });
});
