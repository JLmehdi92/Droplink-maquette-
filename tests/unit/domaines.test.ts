import { describe, expect, test } from "vitest";
import { DOMAINES_CONNUS, distance, suggererCorrection } from "@/lib/email/domaines";

describe("Distance entre domaines", () => {
  test("mesure ce qu'elle prétend mesurer", () => {
    expect(distance("gmail.com", "gmail.com", 2)).toBe(0);
    // TEST DISCRIMINANT entre Levenshtein et Damerau. Une transposition de deux
    // lettres voisines vaut UNE édition, pas deux. Si cette valeur repasse à 2,
    // c'est que l'algorithme est redevenu Levenshtein — et il faudrait alors
    // relâcher le seuil à 2 pour rattraper « gmial », donc accepter du même coup
    // deux substitutions arbitraires et se mettre à deviner.
    expect(distance("gmial.com", "gmail.com", 2)).toBe(1);
    expect(distance("hotmial.fr", "hotmail.fr", 2)).toBe(1);
    expect(distance("gmai.com", "gmail.com", 2)).toBe(1);
    expect(distance("gmaill.com", "gmail.com", 2)).toBe(1);
  });

  test("le plafond borne le calcul sans le fausser en deçà", () => {
    // Le raccourci ne doit pas rendre une valeur fausse pour les distances
    // qui comptent : celles sous le plafond.
    expect(distance("orange.fr", "gmail.com", 2)).toBeGreaterThan(2);
    expect(distance("a", "bbbbbbbbbb", 2)).toBeGreaterThan(2);
  });
});

describe("Suggestion de correction", () => {
  test("les fautes de frappe courantes sont rattrapées", () => {
    const cas: Array<[string, string]> = [
      ["yanis@gmial.com", "gmail.com"],
      ["yanis@gmai.com", "gmail.com"],
      ["yanis@gmail.co", "gmail.com"],
      ["yanis@hotmial.fr", "hotmail.fr"],
      ["yanis@outlok.com", "outlook.com"],
      ["yanis@yaho.fr", "yahoo.fr"],
      ["yanis@oranges.fr", "orange.fr"],
      ["yanis@icloud.co", "icloud.com"],
    ];
    for (const [saisie, attendu] of cas) {
      const s = suggererCorrection(saisie);
      expect(s?.domaine, `« ${saisie} » aurait dû suggérer ${attendu}`).toBe(attendu);
    }
  });

  test("les domaines chinois sont couverts", () => {
    // Le fournisseur en Chine n'a pas d'autre porte d'entrée que l'email : la
    // connexion Google lui est inaccessible. Une liste qui l'oublie ne couvre
    // pas celui qui en a le plus besoin.
    expect(suggererCorrection("chen@qq.co")?.domaine).toBe("qq.com");
    expect(suggererCorrection("chen@163.co")?.domaine).toBe("163.com");
    expect(suggererCorrection("chen@126.con")?.domaine).toBe("126.com");
    expect(suggererCorrection("chen@foxmai.com")?.domaine).toBe("foxmail.com");
  });

  test("l'adresse suggérée conserve la partie locale intacte", () => {
    // Toucher à la partie locale serait pire que de ne rien faire : c'est la
    // seule portion que nous ne pouvons pas deviner.
    const s = suggererCorrection("prenom.nom+etiquette@gmial.com");
    expect(s?.adresse).toBe("prenom.nom+etiquette@gmail.com");
  });

  test("un domaine CONNU ne reçoit JAMAIS de suggestion", () => {
    // Le cas le plus important de tous. `mail.com` est à une lettre de
    // `gmail.com` : sans cette règle, une adresse parfaitement valide se verrait
    // proposer une correction qui l'enverrait chez quelqu'un d'autre.
    for (const domaine of DOMAINES_CONNUS) {
      expect(
        suggererCorrection(`quelquun@${domaine}`),
        `« ${domaine} » est un domaine réel et a pourtant reçu une suggestion`,
      ).toBeNull();
    }
  });

  test("un domaine professionnel inconnu est laissé tranquille", () => {
    // Un domaine d'entreprise ne ressemble à rien de la liste : se taire.
    for (const adresse of [
      "contact@droplink.app",
      "chen@shenzhen-trading.cn",
      "a@b.io",
      "yanis@mondomaine-a-moi.fr",
    ]) {
      expect(suggererCorrection(adresse), `« ${adresse} » a reçu une suggestion`).toBeNull();
    }
  });

  test("le module se tait pendant la saisie et sur les entrées malformées", () => {
    for (const saisie of ["", "yanis", "yanis@", "@gmail.com", "yanis@gmail", "   "]) {
      expect(suggererCorrection(saisie), `« ${saisie} » a produit une suggestion`).toBeNull();
    }
  });

  test("contre-test positif : la sonde SAIT produire une suggestion", () => {
    // Sans lui, une implémentation qui rendrait toujours `null` passerait tous
    // les tests de « ne rien suggérer » à 100 % sans rien prouver.
    expect(suggererCorrection("yanis@gmial.com")).not.toBeNull();
  });

  test("la liste des domaines connus n'est pas vide", () => {
    // Un ensemble vide passe tout : sans domaines, « ne pas suggérer pour un
    // domaine connu » serait vrai par vacuité.
    expect(DOMAINES_CONNUS.length).toBeGreaterThan(30);
    expect(new Set(DOMAINES_CONNUS).size, "doublons dans la liste").toBe(DOMAINES_CONNUS.length);
  });

  test("la casse et les espaces n'empêchent pas la détection", () => {
    expect(suggererCorrection("  Yanis@GMIAL.COM  ")?.domaine).toBe("gmail.com");
  });
});
