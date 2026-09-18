import { describe, expect, test } from "vitest";
import { CODES_PROPOSES, lireTransporteur, transporteursProposes } from "@/lib/tracking/transporteurs";

/**
 * LA LISTE DU CHAMP « TRANSPORTEUR » DE L'ÉDITEUR.
 *
 * Elle ne sert qu'au jour où le fournisseur ne reconnaît pas un numéro : un
 * code faux y enverrait la prise en charge chez le mauvais transporteur, et
 * le suivi resterait vide sans que rien ne le dise. D'où ces exigences, et
 * chacune rougit dans son sens.
 */
describe("Les transporteurs proposés", () => {
  test("chaque code proposé existe dans le catalogue officiel", () => {
    // Un code qui n'y serait plus disparaîtrait en silence de la liste.
    // L'exiger ici le fait rougir au lieu de s'effacer.
    expect(CODES_PROPOSES.length, "aucun code proposé : un ensemble vide passe tout").toBeGreaterThan(10);
    const absents = CODES_PROPOSES.filter((c) => lireTransporteur(c) === null);
    expect(absents, "codes absents du catalogue").toEqual([]);
    expect(new Set(CODES_PROPOSES).size, "un code est proposé deux fois").toBe(CODES_PROPOSES.length);
  });

  test("la liste rend les noms DU CATALOGUE, triés, et rien d'autre", () => {
    const liste = transporteursProposes(null);
    expect(liste.length).toBe(CODES_PROPOSES.length);
    for (const t of liste) expect(t.nom).toBe(lireTransporteur(Number(t.code))?.nom);
    const noms = liste.map((t) => t.nom);
    expect(noms).toEqual([...noms].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })));
  });

  test("le transporteur ACTUEL figure dans la liste, même hors de la sélection", () => {
    // Sans lui, la liste afficherait « détection automatique » pour une
    // commande qui porte un transporteur : l'écran affirmerait ce que la base
    // n'a pas.
    const hors = "1021"; // Afghan Post : dans le catalogue, pas dans la sélection
    expect(CODES_PROPOSES.includes(Number(hors)), "le cas n'éprouve rien").toBe(false);
    const liste = transporteursProposes(hors);
    expect(liste.find((t) => t.code === hors)?.nom).toBe("Afghan Post");

    // Un code inconnu du catalogue reste nommé par son code plutôt que perdu.
    expect(transporteursProposes("999999999").find((t) => t.code === "999999999")?.nom).toBe("999999999");
  });

  test("un ancien texte libre n'est PAS proposé : la base le lit comme la détection automatique", () => {
    // L'ancien champ acceptait « DHL ». La migration 164 le traite comme
    // rien ; la liste doit montrer la même chose, pas un choix fantôme.
    const liste = transporteursProposes("DHL");
    expect(liste.some((t) => t.code === "DHL")).toBe(false);
    expect(liste.length).toBe(CODES_PROPOSES.length);
  });
});
