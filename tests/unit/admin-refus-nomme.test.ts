import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/*
 * LES EN-TÊTES D'UNE REQUÊTE QUI N'EN PORTE AUCUN.
 *
 * C'est exactement la situation du piège : un bord qui ne pose pas
 * `cf-connecting-ip`. `headers()` n'existe pas hors d'un contexte de requête, et
 * le but n'est pas d'éprouver Next mais NOTRE branche — celle qui décide quoi
 * faire quand l'appelant n'a pas d'adresse exploitable.
 */
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

/**
 * LE REFUS QUI ENFERME L'ADMINISTRATEUR DEHORS DOIT SE NOMMER.
 *
 * ⚠️ PIÈGE DE DÉPLOIEMENT RENCONTRÉ LE 27/08/2026. Les six écrans admin
 * rendaient 404 à un compte QUI EST administrateur : `BORD_DE_CONFIANCE`
 * absente → mode strict → aucun `cf-connecting-ip` → aucune adresse d'appelant
 * → refus par sécurité → `notFound()`.
 *
 * Le refus est correct et ne change pas. Ce qui était mauvais, c'est son
 * SILENCE : un 404 identique à « vous n'êtes pas administrateur » et à « il n'y
 * a rien ici », sans une ligne nulle part. On chercherait la panne dans le
 * rôle, la session ou la base — partout sauf là où elle est.
 *
 * CE QUI EST ÉPROUVÉ ICI EST LA PARTIE SUBTILE : que le message parte, qu'il
 * porte de quoi agir, et qu'il ne parte QU'UNE FOIS. Le répéter à chaque
 * requête noierait les vraies lignes et offrirait à n'importe quel visiteur
 * anonyme un moyen de remplir nos journaux depuis une surface qui ne lui répond
 * même pas.
 *
 * Chaque test recharge le module : la marque « déjà signalé » vit dans le
 * module, et la partager entre les cas ferait passer le second pour le premier.
 */

let espion: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  espion = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  espion.mockRestore();
});

async function charger() {
  return import("@/lib/limitation/quota");
}

describe("Le refus admin sans adresse", () => {
  test("il est écrit, et il porte de quoi agir", async () => {
    const { signalerAdminSansAdresse } = await charger();
    signalerAdminSansAdresse();

    expect(espion, "aucun message : le refus reste muet").toHaveBeenCalledTimes(1);

    const message = String(espion.mock.calls[0]?.[0] ?? "");

    // UN MESSAGE QUI NE DIT PAS QUOI FAIRE NE VAUT PAS MIEUX QUE LE SILENCE.
    // Ces trois éléments sont exactement ce qui manquait pour diagnostiquer :
    // quelle surface refuse, quel réglage la gouverne, quel en-tête est attendu.
    for (const attendu of ["[admin]", "BORD_DE_CONFIANCE", "cf-connecting-ip"]) {
      expect(message, `le message ne porte pas « ${attendu} »`).toContain(attendu);
    }
  });

  test("il ne part QU'UNE FOIS, quel que soit le nombre de requêtes refusées", async () => {
    const { signalerAdminSansAdresse } = await charger();

    for (let i = 0; i < 50; i += 1) signalerAdminSansAdresse();

    expect(
      espion,
      "le message se répète : une surface anonyme peut remplir les journaux",
    ).toHaveBeenCalledTimes(1);
  });

  test("contre-test : la sonde verrait bien une seconde écriture", async () => {
    // Sans lui, « appelé une seule fois » serait aussi vrai d'un espion qui
    // n'observe rien du tout. On établit qu'une écriture supplémentaire, par un
    // autre chemin, EST comptée.
    const { signalerAdminSansAdresse } = await charger();
    signalerAdminSansAdresse();
    console.error("[test] une seconde écriture, par un chemin qui n'est pas la garde");

    expect(espion).toHaveBeenCalledTimes(2);
  });

  /**
   * LE TEST QUI COMPTE VRAIMENT.
   *
   * Les précédents éprouvent la fonction de signalement. Qu'elle existe et
   * qu'elle soit correcte ne prouve RIEN sur le produit tant que la garde ne
   * l'appelle pas (L-018) — et un contrôle textuel qui chercherait son nom dans
   * le fichier se satisferait d'un commentaire (L-031).
   *
   * On appelle donc la garde elle-même, sur une requête sans adresse, et on
   * exige les DEUX propriétés à la fois : elle refuse, ET elle le dit. Séparer
   * les deux laisserait passer précisément l'état d'origine — un refus correct
   * et muet.
   */
  test("la garde REFUSE et le DIT, sur une requête sans adresse", async () => {
    const { verifierQuotaAdmin } = await charger();

    const verdict = await verifierQuotaAdmin();

    expect(verdict.autorise, "la garde a laissé passer sans adresse").toBe(false);
    expect(espion, "la garde refuse en silence : le défaut d'origine est intact").toHaveBeenCalledTimes(
      1,
    );
    expect(String(espion.mock.calls[0]?.[0] ?? "")).toContain("BORD_DE_CONFIANCE");
  });

  test("une instance neuve le redit — l'information vaut par démarrage", async () => {
    // La marque est portée par le MODULE, donc par l'instance. Un redéploiement
    // sur une configuration toujours fautive doit le redire : c'est au démarrage
    // qu'on regarde les journaux.
    const premiere = await charger();
    premiere.signalerAdminSansAdresse();
    expect(espion).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const seconde = await charger();
    seconde.signalerAdminSansAdresse();
    expect(espion, "une instance neuve est restée muette").toHaveBeenCalledTimes(2);
  });
});
