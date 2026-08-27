import { describe, expect, test } from "vitest";
import {
  ParametresListe,
  analyserParametres,
  borneHauteExclusive,
  decoderCurseur,
  encoderCurseur,
  motifRecherche,
} from "@/lib/commandes/liste";
import { lienListe, listeFiltree } from "@/lib/commandes/url";

/**
 * La surface qu'un visiteur peut écrire lui-même : les paramètres d'URL de la
 * liste. Éprouvée au caractère près, sans base — c'est de l'analyse pure.
 */

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("Curseur de pagination", () => {
  test("un aller-retour rend exactement ce qui a été encodé", () => {
    const date = "2026-08-20T14:32:11.123456+00:00";
    const decode = decoderCurseur(encoderCurseur(date, UUID));
    expect(decode).toEqual({ valeur: date, id: UUID });
  });

  test("un identifiant qui n'est pas un UUID est refusé", () => {
    expect(decoderCurseur(encoderCurseur("2026-08-20T00:00:00Z", "pas-un-uuid"))).toBeNull();
  });

  /**
   * LE CŒUR DU CONTRÔLE. Le curseur retourne dans une expression `or=` en
   * syntaxe PostgREST, dont la grammaire emploie la virgule, le point et les
   * parenthèses. `Date.parse` — qui semblait suffire — ACCEPTE
   * « Dec 31, 2025 (UTC) », qui porte les trois.
   */
  test.each([
    ["Dec 31, 2025 (UTC)", "date en toutes lettres, avec virgule et parenthèses"],
    ["Jan 1, 2026", "virgule seule"],
    ["2026-08-20T00:00:00Z,id.eq.autre", "terme de filtre accolé"],
    ["2026-08-20T00:00:00Z)", "parenthèse fermante"],
    ["", "valeur vide"],
  ])("une valeur de tri « %s » est refusée (%s)", (valeur) => {
    expect(decoderCurseur(Buffer.from(valeur + "|" + UUID).toString("base64url"))).toBeNull();
  });

  test("contre-test positif : les formes réellement produites par Postgres passent", () => {
    // Sans lui, un décodeur qui refuserait TOUT passerait les cas ci-dessus
    // sans rien prouver.
    for (const valeur of [
      "2026-08-20T14:32:11.123456+00:00",
      "2026-08-20T14:32:11+00:00",
      "2026-08-20 14:32:11.123456+00",
      "2026-08-20T14:32:11Z",
    ]) {
      expect(
        decoderCurseur(Buffer.from(valeur + "|" + UUID).toString("base64url")),
        "forme refusée alors qu'elle vient de la base : " + valeur,
      ).not.toBeNull();
    }
  });

  test("un curseur illisible ramène à la première page plutôt que de lever", () => {
    expect(decoderCurseur("pas du base64 !!")).toBeNull();
    expect(decoderCurseur("")).toBeNull();
  });
});

describe("Motif de recherche", () => {
  test("les accents sont repliés comme le fait la colonne générée", () => {
    expect(motifRecherche("Crème")).toBe("creme");
    expect(motifRecherche("ÉTÉ")).toBe("ete");
  });

  test("les jokers saisis par l'utilisateur sont neutralisés", () => {
    // Sans échappement, chercher « 100% coton » ramènerait tout ce qui commence
    // par « 100 ». Et `*` compte : PostgREST le traduit en `%`, ce qui n'est
    // écrit nulle part dans le code appelant.
    expect(motifRecherche("100% coton")).toBe("100\\% coton");
    expect(motifRecherche("a_b")).toBe("a\\_b");
    expect(motifRecherche("a*b")).toBe("a\\*b");
    expect(motifRecherche("a\\b")).toBe("a\\\\b");
  });
});

describe("Paramètres d'URL", () => {
  test("les valeurs valides sont conservées", () => {
    const p = analyserParametres({
      q: "creme",
      statut: "en_transit",
      qc: "refuse",
      tri: "anciennes",
      archivees: "1",
    });
    expect(p).toMatchObject({
      q: "creme",
      statut: "en_transit",
      qc: "refuse",
      tri: "anciennes",
      archivees: true,
    });
  });

  test("une valeur inventée retombe au défaut sans faire tomber l'écran", () => {
    const p = analyserParametres({ statut: "explose", qc: "42", tri: "n'importe quoi" });
    expect(p.statut).toBeNull();
    expect(p.qc).toBeNull();
    expect(p.tri).toBe("recentes");
  });

  test("une saisie démesurée est refusée plutôt que transmise à la base", () => {
    expect(ParametresListe.parse({ q: "x".repeat(5000) }).q).toBe("");
  });

  test("un paramètre répété ne devient pas un tableau dans la requête", () => {
    // `?statut=livre&statut=expedie` arrive sous forme de tableau. Le transmettre
    // tel quel construirait un filtre que personne n'a écrit.
    expect(analyserParametres({ statut: ["livre", "expedie"] }).statut).toBe("livre");
  });
});

describe("Construction des liens", () => {
  const base = "/fr/commandes";
  const defaut = analyserParametres({});

  test("les valeurs par défaut n'apparaissent pas dans l'URL", () => {
    expect(lienListe(base, defaut, {})).toBe(base);
  });

  test("changer un filtre ABANDONNE le curseur", () => {
    // Le garder ferait démarrer la liste au milieu d'un jeu qui n'existe plus :
    // l'écran paraîtrait vide alors qu'il ne l'est pas.
    const avecCurseur = { ...defaut, curseur: encoderCurseur("2026-08-20T00:00:00Z", UUID) };
    expect(lienListe(base, avecCurseur, { statut: "livre" })).not.toContain("curseur");
  });

  test("demander la page suivante conserve les filtres", () => {
    const filtre = analyserParametres({ statut: "livre", q: "creme" });
    const lien = lienListe(base, filtre, { curseur: "abc" });
    expect(lien).toContain("statut=livre");
    expect(lien).toContain("q=creme");
    expect(lien).toContain("curseur=abc");
  });

  test("les deux états vides se distinguent bien", () => {
    expect(listeFiltree(defaut)).toBe(false);
    expect(listeFiltree(analyserParametres({ q: "x" }))).toBe(true);
    expect(listeFiltree(analyserParametres({ statut: "livre" }))).toBe(true);
    expect(listeFiltree(analyserParametres({ archivees: "1" }))).toBe(true);
    // La période est un filtre comme les autres : l'oublier ici ferait proposer
    // « créez votre première commande » à qui a simplement borné ses dates.
    expect(listeFiltree(analyserParametres({ du: "2026-08-01" }))).toBe(true);
    expect(listeFiltree(analyserParametres({ au: "2026-08-31" }))).toBe(true);
  });
});

/**
 * LE FILTRE DE PÉRIODE, ET SON PIÈGE.
 *
 * Le brief le nomme : `au=2026-08-16` vaut MINUIT. Comparé tel quel, il exclut
 * toute la journée du 16 — donc un vendeur qui demande « jusqu'à aujourd'hui »
 * ne voit rien de ce qu'il a créé aujourd'hui, c'est-à-dire précisément ce qu'il
 * cherchait. Le défaut est silencieux : la liste n'est pas vide, elle est
 * INCOMPLÈTE, et elle le reste jusqu'à ce que quelqu'un compte.
 */
describe("La période", () => {
  test("la borne haute couvre TOUTE la journée demandée", () => {
    // La borne rendue est le LENDEMAIN à minuit, et la comparaison est stricte.
    // Une commande créée le 16 à 23:59:59.999 doit donc passer.
    expect(borneHauteExclusive("2026-08-16")).toBe("2026-08-17T00:00:00.000Z");
    expect(new Date("2026-08-16T23:59:59.999Z") < new Date(borneHauteExclusive("2026-08-16"))).toBe(
      true,
    );
    // Et le 17 à minuit pile ne passe PAS : la borne reste une borne.
    expect(new Date("2026-08-17T00:00:00.000Z") < new Date(borneHauteExclusive("2026-08-16"))).toBe(
      false,
    );
  });

  test("elle franchit les fins de mois et les années bissextiles", () => {
    // Une arithmétique écrite « +1 jour » sur la chaîne casserait ici sans que
    // rien ne le dise : le mois suivant, l'année suivante, le 29 février.
    expect(borneHauteExclusive("2026-08-31")).toBe("2026-09-01T00:00:00.000Z");
    expect(borneHauteExclusive("2026-12-31")).toBe("2027-01-01T00:00:00.000Z");
    expect(borneHauteExclusive("2024-02-28")).toBe("2024-02-29T00:00:00.000Z");
  });

  test("une date qui n'existe pas est refusée, pas propagée", () => {
    // `2026-02-31` a la FORME d'une date. La laisser passer ferait comparer une
    // valeur que Postgres refuse, donc échouer la lecture de l'écran le plus
    // utilisé du produit — sur une saisie que n'importe qui peut écrire dans la
    // barre d'adresse.
    for (const saisie of ["2026-02-31", "2026-13-01", "16/08/2026", "hier", "2026-08-1", ""]) {
      expect(analyserParametres({ au: saisie }).au, `« ${saisie} » a été acceptée`).toBeNull();
    }
    expect(analyserParametres({ au: "2026-02-28" }).au).toBe("2026-02-28");
  });

  test("elle voyage dans l'URL et survit à la page suivante", () => {
    const avec = analyserParametres({ du: "2026-08-01", au: "2026-08-31" });
    const lien = lienListe("/fr/commandes", avec, { curseur: "abc" });
    expect(lien).toContain("du=2026-08-01");
    expect(lien).toContain("au=2026-08-31");
  });
});
