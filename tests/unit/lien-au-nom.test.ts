import { describe, expect, test } from "vitest";
import { lireLienAuNom, PARAM_NOM } from "@/lib/routes/lien-au-nom";
import { LANGUES } from "@/i18n/config";

/**
 * LA DÉCISION DE ROUTAGE DU LIEN AU NOM DU VENDEUR.
 *
 * Elle s'exécute au bord, sur CHAQUE requête que le matcher laisse passer, et
 * AVANT la négociation de langue. Elle a donc deux façons de nuire, opposées :
 *
 *   - trop large, elle détourne une page du produit vers la page client, qui
 *     rend 404 sans rien dire de la cause ;
 *   - trop étroite, un lien brandé déjà envoyé dans un message privé cesse de
 *     répondre — chez un client qui n'a pas de compte, n'a rien demandé, et ne
 *     sera jamais prévenu.
 *
 * Les deux sens sont éprouvés ici.
 */

/** Un jeton de la forme exacte que produit `generer_jeton_public()` : 21 en base 62. */
const JETON = "xK9mQ2pL7vR4nT8wY3zB1";

describe("Lien au nom du vendeur — la décision de routage", () => {
  test("un lien brandé est RÉÉCRIT, nom et jeton intacts", () => {
    expect(lireLienAuNom(`/atelier-nord/${JETON}`)).toEqual({
      nom: "atelier-nord",
      jeton: JETON,
    });
  });

  test("la casse du NOM est abaissée, celle du JETON est INTOUCHÉE", () => {
    /*
     * ⚠️ LE CONTRÔLE DISCRIMINANT DE CE FICHIER.
     *
     * Le jeton est en base 62 : `xK9` et `xk9` sont deux jetons différents.
     * Abaisser la casse du chemin ENTIER — ce que fait naturellement quiconque
     * écrit `chemin.toLowerCase()` — rendrait 404 sur un lien parfaitement
     * valide, et sur le lien le plus envoyé du produit.
     *
     * Vérifier seulement que le nom ressort en minuscules ne sépare pas les
     * deux mondes : il y ressort dans les deux. C'est le JETON qui les sépare.
     *
     * ⚠️ ET LA MAJUSCULE EST SERVIE, PAS REDIRIGÉE. Le premier jet rendait un
     * 308 vers la forme minuscule : mesuré au navigateur, il rendait 500 —
     * Next 16 exige une `Location` absolue dans un middleware, et la seule base
     * absolue au bord est l'adresse interne du conteneur (défaut du 08/09/2026).
     */
    expect(lireLienAuNom(`/Atelier-Nord/${JETON}`)).toEqual({
      nom: "atelier-nord",
      jeton: JETON,
    });
  });

  describe("la collision avec le segment de langue", () => {
    /*
     * ⚠️ C'EST LA CONTRAINTE N° 4 DU CAHIER DES CHARGES, ET ELLE EST TRAITÉE
     * NOMMÉMENT PLUTÔT QUE LAISSÉE AU HASARD DES LONGUEURS.
     *
     * Aucune route du produit ne ressemble aujourd'hui à `/fr/<21 caractères>`.
     * Mais c'est une propriété de l'inventaire du moment, pas une garantie :
     * `/fr/<identifiant>` est exactement la forme qu'aurait une route ajoutée
     * demain. S'en remettre à « ça ne ressemble à rien d'existant » serait une
     * protection qui tient à une ABSENCE.
     *
     * La suite éprouve TOUTES les langues déclarées, pas les deux auxquelles
     * son auteur a pensé : ajouter une langue ajoute un cas ici.
     */
    test.each(LANGUES)("« /%s/<jeton> » appartient à next-intl, jamais à un vendeur", (langue) => {
      expect(lireLienAuNom(`/${langue}/${JETON}`)).toBeNull();
    });

    test.each(["/FR", "/Fr", "/EN", "/Zh-CN", "/ZH-cn"])(
      "« %s/<jeton> » ne contourne pas l'exclusion par la casse",
      (prefixe) => {
        // Sans ce contrôle, `/FR/<jeton>` serait vu comme le nom de boutique
        // « fr » : la page client serait servie pour un chemin qui appartient à
        // next-intl, et la garde elle-même aurait fabriqué la collision que la
        // contrainte n° 4 demande d'éviter.
        expect(lireLienAuNom(`${prefixe}/${JETON}`)).toBeNull();
      },
    );
  });

  describe("ce qui n'a PAS la forme d'un jeton n'est pas un lien brandé", () => {
    const PAS_DES_JETONS: ReadonlyArray<readonly [string, string]> = [
      ["commandes", "un mot du produit, trop court"],
      ["mot-de-passe-oublie", "un mot du produit — les tirets sont exclus du jeton"],
      ["a".repeat(15), "15 caractères : sous la borne basse de 16"],
      ["a".repeat(65), "65 caractères : au-dessus de la borne haute de 64"],
      ["xK9mQ2pL7-R4nT8wY3zB1", "un tiret : aucun jeton n'en porte"],
      ["xK9mQ2pL7_R4nT8wY3zB1", "un souligné : hors de la base 62"],
      ["xK9mQ2pL7.R4nT8wY3zB1", "un point : hors de la base 62"],
    ];

    test.each(PAS_DES_JETONS)("« /boutique/%s » — %s", (second) => {
      expect(lireLienAuNom(`/boutique/${second}`)).toBeNull();
    });

    test("les bornes EXACTES du jeton sont servies, pas seulement approchées", () => {
      // 15 et 65 refusés ci-dessus, 16 et 64 acceptés ici. Les quatre ensemble
      // fixent l'intervalle ; deux d'entre eux ne fixeraient qu'un bord, et un
      // motif `{15,65}` passerait tout aussi bien.
      expect(lireLienAuNom("/boutique/abcdefghijklmnop")?.jeton).toBe("abcdefghijklmnop");
      expect(lireLienAuNom(`/boutique/${"a".repeat(64)}`)?.jeton).toBe("a".repeat(64));
    });
  });

  describe("ce qui n'a PAS la forme d'un nom de lien n'est pas un lien brandé", () => {
    const PAS_DES_NOMS: ReadonlyArray<readonly [string, string]> = [
      ["ab", "deux caractères : le plancher est à trois (migration 183)"],
      ["a", "un caractère"],
      ["-atelier", "un tiret en tête"],
      ["atelier-", "un tiret en queue"],
      ["atelier--nord", "deux tirets : une usurpation d'« atelier-nord » invisible dans un message"],
      ["atelier_nord", "un souligné : hors de la forme acceptée en base"],
      ["atelier.nord", "un point"],
      ["atelier nord", "une espace"],
      ["crème", "un accent : une URL se recopie à la main et se dicte au téléphone"],
      ["a".repeat(41), "41 caractères : le plafond est à 40"],
    ];

    test.each(PAS_DES_NOMS)("« /%s/<jeton> » — %s", (premier) => {
      expect(lireLienAuNom(`/${premier}/${JETON}`)).toBeNull();
    });

    test("les bornes EXACTES du nom sont servies", () => {
      // 2 et 41 refusés ci-dessus, 3 et 40 acceptés ici.
      expect(lireLienAuNom(`/abc/${JETON}`)?.nom).toBe("abc");
      expect(lireLienAuNom(`/${"a".repeat(40)}/${JETON}`)?.nom).toBe("a".repeat(40));
    });
  });

  describe("le NOMBRE de segments", () => {
    test.each([
      ["/", "la racine"],
      [`/${JETON}`, "un seul segment"],
      [`/atelier-nord/${JETON}/media`, "trois segments"],
      [`/fr/atelier-nord/${JETON}`, "trois segments sous une langue"],
      [`//${JETON}`, "un premier segment vide"],
      ["/atelier-nord/", "un second segment vide"],
    ])("« %s » n'est pas un lien brandé — %s", (chemin) => {
      expect(lireLienAuNom(chemin)).toBeNull();
    });
  });

  test("le paramètre de transport porte un nom stable", () => {
    // Le middleware l'écrit, la page le lit. S'ils divergeaient, la page
    // cesserait simplement de vérifier — sans une seule erreur, et en servant
    // toutes les pages sous tous les noms.
    expect(PARAM_NOM).toBe("nom");
  });
});
