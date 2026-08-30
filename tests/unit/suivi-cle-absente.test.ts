import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dixSeptTrack } from "@/lib/tracking/provider/dix-sept-track";
import { MOTIF_CLE_ABSENTE } from "@/lib/tracking/provider/port";

/**
 * UNE CLÉ ABSENTE NE DOIT PAS SE FAIRE PASSER POUR UNE PANNE RÉSEAU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TEST EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `cle()` lève une erreur soigneusement rédigée quand `TRACKING_API_KEY` manque.
 * Elle est évaluée EN CONSTRUISANT LES EN-TÊTES, donc AVANT le `fetch` — et les
 * deux `catch` de l'adaptateur rendaient `motif: "reseau"` pour toute erreur qui
 * n'était pas une expiration de délai. Le meilleur message du fichier était donc
 * jeté et remplacé par un diagnostic FAUX.
 *
 * Ensuite, `prendreEnCharge` se tait sur `indisponible` — délibérément, et c'est
 * juste pour une panne : la tâche de fond rattrape. Mais une clé absente
 * échouera à l'identique pour toujours. Les deux confondues, le produit
 * n'inscrivait AUCUN colis chez le fournisseur, pour aucun vendeur, et rien
 * nulle part ne nommait la cause.
 *
 * ⚠️ CONSTATÉ PAR EXÉCUTION, pas déduit : un numéro de suivi collé dans
 * l'éditeur d'une vraie session a bien créé le colis en base — `registered_at`
 * nulle, zéro interrogation — pendant que l'interrupteur `lire_suivi_actif`
 * valait `true` et que la clé était absente. Le journal du serveur n'a rien dit.
 *
 * Le chemin JUMEAU était déjà gardé : `suivi-signature` vérifie que la
 * vérification de notification LÈVE sans clé, et son commentaire dit pourquoi —
 * « rendre `false` en silence : le suivi cesserait de fonctionner sans que
 * personne ne sache pourquoi ». C'est la même phrase, appliquée à l'autre bout.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN APPEL RÉSEAU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le cas de la clé absente n'atteint jamais `fetch`. Les contre-tests, eux, en
 * ont besoin pour prouver que la distinction est RÉELLE et non un renommage : on
 * pose donc un `fetch` de substitution qui lève, et on vérifie que le motif
 * redevient `reseau` ou `delai`. Sans eux, une fonction qui rendrait
 * `cle-absente` pour TOUTE erreur passerait ce fichier à 100 %.
 */

const NUMERO = "LP00499123456FR";

let ancienne: string | undefined;

beforeEach(() => {
  ancienne = process.env["TRACKING_API_KEY"];
});

afterEach(() => {
  if (ancienne === undefined) delete process.env["TRACKING_API_KEY"];
  else process.env["TRACKING_API_KEY"] = ancienne;
  vi.unstubAllGlobals();
});

describe("Sans clé, le motif nomme la configuration", () => {
  test("la prise en charge rend `cle-absente`, jamais `reseau`", async () => {
    delete process.env["TRACKING_API_KEY"];
    // Si l'adaptateur atteignait le réseau, ce substitut le dirait : il rend une
    // réussite, que le test refuse. Le chemin correct ne l'appelle jamais.
    const faux = vi.fn(() => Promise.reject(new Error("le fetch ne doit pas être atteint")));
    vi.stubGlobal("fetch", faux);

    const r = await dixSeptTrack.prendreEnCharge(NUMERO, null);

    expect(r.statut).toBe("indisponible");
    expect(
      "motif" in r ? r.motif : null,
      "une clé absente est rapportée comme une panne réseau : le diagnostic est faux, " +
        "et il fait croire à un incident transitoire là où rien ne se réparera tout seul",
    ).toBe(MOTIF_CLE_ABSENTE);
    expect(faux, "l'adaptateur a appelé le réseau sans clé").not.toHaveBeenCalled();
  });

  test("l'interrogation aussi — les DEUX chemins passent par la clé", async () => {
    // Le second `catch` du fichier est une copie du premier. Corriger l'un et
    // oublier l'autre est exactement ce qui arrive quand une garde est écrite
    // depuis le champ de vision de la correction.
    delete process.env["TRACKING_API_KEY"];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("le fetch ne doit pas être atteint"))),
    );

    const r = await dixSeptTrack.interroger(NUMERO, null);

    expect(r.statut).toBe("indisponible");
    expect("motif" in r ? r.motif : null).toBe(MOTIF_CLE_ABSENTE);
  });
});

describe("CONTRE-TESTS : avec une clé, les autres échecs gardent leur nom", () => {
  test("une panne réseau reste `reseau`", async () => {
    process.env["TRACKING_API_KEY"] = "cle-de-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );

    const r = await dixSeptTrack.prendreEnCharge(NUMERO, null);
    expect("motif" in r ? r.motif : null, "tout échec est devenu `cle-absente`").toBe("reseau");
  });

  test("une expiration de délai reste `delai`", async () => {
    process.env["TRACKING_API_KEY"] = "cle-de-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const e = new Error("aborted");
        e.name = "AbortError";
        return Promise.reject(e);
      }),
    );

    const r = await dixSeptTrack.prendreEnCharge(NUMERO, null);
    expect("motif" in r ? r.motif : null).toBe("delai");
  });
});
