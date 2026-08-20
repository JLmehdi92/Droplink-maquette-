import { describe, expect, test } from "vitest";
import { EVENEMENTS, EVENEMENTS_DENOMINATEURS } from "@/lib/instrumentation/evenements";

/**
 * Le catalogue d'événements est inventorié, pas échantillonné : un contrôle ne
 * doit pas dépendre de ce que son auteur a pensé à inspecter.
 *
 * `emettre.ts` importe `server-only` et n'est donc pas chargeable dans un test
 * unitaire hors contexte Next — c'est exactement ce qu'on veut de ce paquet. Son
 * comportement de transport sera couvert au lot où un événement est réellement
 * posé ; ici on garde les invariants du catalogue, qui sont la moitié du risque
 * de double comptage.
 */

describe("Catalogue d'événements", () => {
  const entrees = Object.entries(EVENEMENTS);

  test("la sonde inspecte réellement des événements", () => {
    expect(entrees.length, "catalogue vide : rien à vérifier").toBeGreaterThan(0);
  });

  test("aucune valeur d'événement n'est dupliquée", () => {
    // Deux clés distinctes portant la même valeur produisent un double comptage
    // silencieux : les deux appels alimentent le même compteur, et l'écart entre
    // deux faits distincts — celui qui porte l'information — disparaît.
    const valeurs = entrees.map(([, v]) => v);
    const doublons = valeurs.filter((v, i) => valeurs.indexOf(v) !== i);
    expect(doublons, `Valeurs d'événement dupliquées : ${[...new Set(doublons)].join(", ")}`).toEqual(
      [],
    );
  });

  test("chaque nom d'événement suit la convention snake_case minuscule", () => {
    // Une casse hétérogène produit deux événements distincts dans PostHog pour
    // ce que tout le monde lira comme un seul.
    const horsConvention = entrees
      .filter(([, v]) => !/^[a-z][a-z0-9_]*$/.test(v))
      .map(([k, v]) => `${k} = « ${v} »`);
    expect(horsConvention, horsConvention.join(" | ")).toEqual([]);
  });

  test("les deux événements de création restent DISTINCTS", () => {
    // C'est l'écart entre l'ouverture de l'éditeur et la première sauvegarde de
    // contenu réel qui mesure l'abandon. Les confondre effacerait précisément le
    // signal recherché.
    expect(EVENEMENTS.EDITEUR_OUVERT).not.toBe(EVENEMENTS.COMMANDE_CREEE);
  });

  test("les événements de rendu et de vue restent DISTINCTS", () => {
    // Les messageries chargent les liens qu'on leur colle. Confondre le rendu et
    // la vue gonflerait par construction la métrique de verdict.
    expect(EVENEMENTS.PAGE_PUBLIQUE_RENDUE).not.toBe(EVENEMENTS.VUE_ENREGISTREE);
  });

  test("chaque dénominateur déclaré existe bien dans le catalogue", () => {
    // Sans ce contrôle, un renommage laisserait une liste de dénominateurs qui
    // désigne des événements que plus personne n'émet — et le taux calculé
    // dessus resterait crédible.
    const connus = new Set(entrees.map(([, v]) => v));
    const inconnus = EVENEMENTS_DENOMINATEURS.filter((d) => !connus.has(d));
    expect(inconnus, `Dénominateurs absents du catalogue : ${inconnus.join(", ")}`).toEqual([]);
    expect(EVENEMENTS_DENOMINATEURS.length).toBeGreaterThan(0);
  });
});
