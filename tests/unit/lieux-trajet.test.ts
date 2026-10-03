import { describe, expect, test } from "vitest";
import { lieuxDuTrajet, textesDuTrajet, type PassageLu } from "@/lib/tracking/lieux-trajet";
import { etapeDuJalon } from "@/lib/tracking/normalize";

/**
 * LE LIEU DE CHAQUE ARRÊT DU TRAJET DE /p (décision de Mehdi du 03/10/2026, D2) : le
 * passage retenu par étape, sans rien interpréter.
 */
const p = (instant: string, lieu: string | null, etape: string | null): PassageLu => ({ instant, lieu, etape });

const PASSAGES: PassageLu[] = [
  // ordre volontairement mélangé : la fonction ne doit pas dépendre de l'ordre de lecture
  p("2026-09-30T08:40:00Z", "Wissous", "Arrival"),
  p("2026-09-28T10:00:00Z", "Lyon", "PickedUp"),
  p("2026-09-29T09:00:00Z", "Lyon CTC", "Departure"),
  p("2026-09-28T12:00:00Z", "Lyon 2", "PickedUp"),
  p("2026-09-27T09:00:00Z", "   ", "InfoReceived"),
];

describe("etapeDuJalon — la table JALONS, seule source", () => {
  test("traduit les stages bruts 17TRACK, sans casse ni séparateurs", () => {
    expect(etapeDuJalon("PickedUp")).toBe("expedie");
    expect(etapeDuJalon("out_for_delivery")).toBe("en_transit");
    expect(etapeDuJalon("Delivered")).toBe("livre");
  });
  test("rien pour un stage inconnu, vide, ou sans étape (retour)", () => {
    expect(etapeDuJalon("Teleported")).toBeNull();
    expect(etapeDuJalon("")).toBeNull();
    expect(etapeDuJalon(null)).toBeNull();
    expect(etapeDuJalon("Returning")).toBeNull();
  });
});

describe("lieuxDuTrajet", () => {
  test("étape terminée : le lieu du PLUS ANCIEN passage de l'étape", () => {
    const l = lieuxDuTrajet(PASSAGES, "en_transit");
    expect(l.expedie).toEqual({ lieu: "Lyon", instant: "2026-09-28T10:00:00Z" });
  });

  test("étape en cours : le lieu et l'instant du PLUS RÉCENT passage de l'étape", () => {
    const l = lieuxDuTrajet(PASSAGES, "en_transit");
    expect(l.en_transit).toEqual({ lieu: "Wissous", instant: "2026-09-30T08:40:00Z" });
  });

  test("un lieu vide n'est pas un lieu ; une étape à venir n'en a jamais", () => {
    const l = lieuxDuTrajet(PASSAGES, "en_transit");
    expect(l.preparation.lieu).toBeNull();
    expect(l.livre).toEqual({ lieu: null, instant: null });
  });

  test("passage absent des 30 lus : aucun lieu (la date reste celle du héros)", () => {
    const l = lieuxDuTrajet([p("2026-09-30T08:40:00Z", "Wissous", "Arrival")], "en_transit");
    expect(l.expedie).toEqual({ lieu: null, instant: null });
  });

  test("le lieu est rendu TEL QUEL, sans traduction ni raccourci", () => {
    const l = lieuxDuTrajet([p("2026-09-30T08:40:00Z", "SHENZHEN, GUANGDONG 深圳", "Departure")], "en_transit");
    expect(l.en_transit.lieu).toBe("SHENZHEN, GUANGDONG 深圳");
  });

  test("livré : la livraison est terminée, son lieu est celui du premier passage « livré »", () => {
    const l = lieuxDuTrajet([p("2026-10-01T09:00:00Z", "Paris", "Delivered"), p("2026-10-01T10:00:00Z", "Paris 11", "Delivered")], "livre");
    expect(l.livre.lieu).toBe("Paris");
  });
});

/*
 * LE LIEU ET LA DATE D'UN ARRÊT VIENNENT DU MÊME PASSAGE (relecture du 03/10/2026, M1) :
 * « Expédié · Lyon · 27 sept. » assemblait le lieu du premier « PickedUp » (le 28) et la date
 * du premier mouvement tous stages confondus (un « InfoReceived » du 27) — un fait que la
 * base n'a jamais enregistré (contrainte n° 8).
 */
describe("textesDuTrajet — un arrêt, un passage", () => {
  const jour = (instant: string): string => instant.slice(5, 10);
  const REPLI = { preparation: "09-26", expedie: "09-27", en_transit: null, livre: null } as const;

  test("étape terminée avec un lieu : la date est celle du MÊME passage, pas le repli", () => {
    const t = textesDuTrajet(lieuxDuTrajet(PASSAGES, "en_transit"), REPLI, "en_transit", jour);
    expect(t.expedie).toBe("Lyon · 09-28");
  });
  test("étape en cours : lieu et date du plus récent passage", () => {
    const t = textesDuTrajet(lieuxDuTrajet(PASSAGES, "en_transit"), REPLI, "en_transit", jour);
    expect(t.en_transit).toBe("Wissous · 09-30");
  });
  test("aucun lieu retenu : la date de repli seule, ou rien", () => {
    const t = textesDuTrajet(lieuxDuTrajet(PASSAGES, "en_transit"), REPLI, "en_transit", jour);
    expect(t.preparation).toBe("09-26");
    expect(t.livre).toBeNull();
    const vide = textesDuTrajet(lieuxDuTrajet([], "expedie"), REPLI, "expedie", jour);
    expect(vide.expedie).toBe("09-27");
  });
});
