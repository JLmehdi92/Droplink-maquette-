import { describe, expect, test, vi } from "vitest";
import { estQuotaAtteint, malgreLeQuota } from "../aide/utilisateurs";

/**
 * LA BORNE DU QUOTA D'AUTHENTIFICATION — éprouvée, pas déclarée.
 *
 * Cette borne protège le HARNAIS, pas le produit. Elle mérite quand même d'être
 * exercée, pour deux raisons.
 *
 * D'ABORD PARCE QU'ELLE PEUT MASQUER UN DÉFAUT RÉEL. Une attente posée sur
 * n'importe quelle erreur transformerait un refus légitime — un mot de passe
 * faux, une garde qui refuse — en lenteur puis en échec tardif, attribué au
 * quota. C'est le contrôle le plus important ici : ce qui n'est PAS un quota ne
 * patiente pas.
 *
 * ENSUITE PARCE QU'UNE BORNE QU'ON N'A JAMAIS VUE AGIR NE PROUVE RIEN. Deux
 * exécutions consécutives de la suite viennent de passer sans l'atteindre : la
 * seule façon d'établir qu'elle fonctionne est de la déclencher exprès.
 */

describe("Ce qui est reconnu comme un quota", () => {
  test("un 429 et un message de limite le sont", () => {
    expect(estQuotaAtteint({ status: 429, message: "peu importe" })).toBe(true);
    expect(estQuotaAtteint({ message: "Request rate limit reached" })).toBe(true);
  });

  test("contre-test : une erreur ordinaire ne l'est pas", () => {
    // Sans lui, une fonction qui rendrait toujours `true` passerait le test
    // précédent — et ferait patienter sur chaque échec, quel qu'il soit.
    expect(estQuotaAtteint({ status: 400, message: "Invalid login credentials" })).toBe(false);
    expect(estQuotaAtteint(null)).toBe(false);
  });
});

describe("Ce qui n'est pas un quota ne patiente pas", () => {
  test("une erreur ordinaire remonte IMMÉDIATEMENT, sans réessai", async () => {
    const etape = vi.fn(async () => ({
      erreur: { status: 400, message: "Invalid login credentials" },
      valeur: null,
    }));

    await expect(malgreLeQuota("connexion", etape, [1, 1])).rejects.toThrow(/Invalid login/);
    // UN SEUL APPEL. Réessayer ici reviendrait à relancer une assertion jusqu'au
    // vert, ce que la discipline du projet interdit — et un refus légitime
    // finirait par être imputé au quota.
    expect(etape, "une erreur ordinaire a été réessayée").toHaveBeenCalledTimes(1);
  });
});

describe("Un quota est attendu, puis nommé", () => {
  test("il patiente et rend la valeur dès que l'appel passe", async () => {
    let appels = 0;
    const etape = async () => {
      appels += 1;
      return appels < 3
        ? { erreur: { status: 429, message: "Request rate limit reached" }, valeur: "" }
        : { erreur: null, valeur: "session" };
    };

    expect(await malgreLeQuota("connexion", etape, [1, 1])).toBe("session");
    expect(appels).toBe(3);
  });

  test("épuisé, il échoue en DISANT que ce n'est pas le produit", async () => {
    // Le message compte autant que l'échec. Avant cette borne, le quota
    // produisait « Cannot read properties of undefined » dans des fichiers sans
    // rapport : un rouge qui ressemblait à une régression. Un rouge attribué au
    // mauvais endroit est pire qu'un rouge.
    const etape = async () => ({
      erreur: { status: 429, message: "Request rate limit reached" },
      valeur: null,
    });

    await expect(malgreLeQuota("connexion", etape, [1])).rejects.toThrow(
      /N'EST PAS LE PRODUIT/,
    );
  });

  test("le nombre de tentatives suit les attentes déclarées", async () => {
    // La borne est BORNÉE : sans ce contrôle, une boucle qui attendrait
    // indéfiniment passerait tous les tests ci-dessus.
    const etape = vi.fn(async () => ({
      erreur: { status: 429, message: "Request rate limit reached" },
      valeur: null,
    }));

    await expect(malgreLeQuota("connexion", etape, [1, 1, 1])).rejects.toThrow();
    expect(etape).toHaveBeenCalledTimes(4);
  });
});
