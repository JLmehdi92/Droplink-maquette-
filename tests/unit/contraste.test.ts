import { describe, expect, test } from "vitest";
import {
  ACCENT_DEFAUT,
  RATIO_INTERFACE,
  RATIO_TEXTE,
  analyserHex,
  luminance,
  ratioContraste,
  resoudreAccent,
} from "@/lib/design/contraste";

/**
 * Le jeu de couleurs est un INVENTAIRE de cas extrêmes, pas une sélection de cas
 * commodes. Six couleurs difficiles plus une valeur invalide, comme exigé : si
 * la fonction ne tient que sur le bleu par défaut, elle ne tient pas.
 */
const COULEURS_EXTREMES: ReadonlyArray<readonly [string, string]> = [
  ["#ff0000", "rouge saturé — le cas cité en exemple"],
  ["#ffff00", "jaune vif — le pire cas, luminance quasi maximale"],
  ["#ffffff", "blanc — contraste nul contre un fond blanc"],
  ["#000000", "noir — déjà conforme, ne doit PAS être éclairci inutilement"],
  ["#f5f5f5", "très clair — presque le fond de page"],
  ["#00ff00", "vert pur — luminance élevée, teinte à préserver"],
];

describe("Analyse et mesure", () => {
  test("analyserHex accepte le format court et le format long", () => {
    expect(analyserHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(analyserHex("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(analyserHex("  #0058be  ")).toEqual({ r: 0, g: 88, b: 190 });
  });

  test("analyserHex rend null sur une valeur invalide plutôt que de lever", () => {
    // Une valeur qui a la FORME d'une couleur franchirait une validation de
    // présence (L-026). On teste donc des formes plausibles, pas seulement du
    // vide.
    for (const invalide of ["", "bleu", "#12345", "#gggggg", "0058be", "#00 58be", "rgb(0,0,0)"]) {
      expect(analyserHex(invalide), `« ${invalide} » aurait dû être rejeté`).toBeNull();
    }
  });

  test("le ratio de contraste retrouve les repères connus", () => {
    const blanc = { r: 255, g: 255, b: 255 };
    const noir = { r: 0, g: 0, b: 0 };
    expect(ratioContraste(blanc, noir)).toBeCloseTo(21, 1);
    expect(ratioContraste(blanc, blanc)).toBeCloseTo(1, 5);
    expect(luminance(blanc)).toBeCloseTo(1, 5);
    expect(luminance(noir)).toBeCloseTo(0, 5);
  });

  test("le ratio est symétrique", () => {
    const a = { r: 12, g: 200, b: 77 };
    const b = { r: 240, g: 33, b: 9 };
    expect(ratioContraste(a, b)).toBeCloseTo(ratioContraste(b, a), 10);
  });
});

describe("Résolution de l'accent — conformité obtenue automatiquement", () => {
  test.each(COULEURS_EXTREMES)("%s (%s) atteint les deux cibles", (couleur) => {
    const r = resoudreAccent(couleur, "#ffffff");
    const blanc = analyserHex("#ffffff");
    if (blanc === null) throw new Error("fond de référence illisible");

    const ratioTexte = ratioContraste(analyserHex(r.texte) as never, blanc);
    const ratioInterface = ratioContraste(analyserHex(r.interface) as never, blanc);

    expect(ratioTexte, `texte ${r.texte} sur blanc`).toBeGreaterThanOrEqual(RATIO_TEXTE);
    expect(ratioInterface, `interface ${r.interface} sur blanc`).toBeGreaterThanOrEqual(
      RATIO_INTERFACE,
    );
  });

  test.each(COULEURS_EXTREMES)("%s : l'écriture sur le bouton est lisible", (couleur) => {
    const r = resoudreAccent(couleur, "#ffffff");
    const ratio = ratioContraste(
      analyserHex(r.remplissage) as never,
      analyserHex(r.surRemplissage) as never,
    );
    expect(ratio, `${r.surRemplissage} sur ${r.remplissage}`).toBeGreaterThanOrEqual(RATIO_TEXTE);
  });

  /**
   * L'APLAT DOIT SE DÉTACHER DU FOND, pas seulement porter une écriture lisible.
   *
   * ⚠️ DÉFAUT RÉEL, MESURÉ LE 31/08/2026. Le test juste au-dessus mesurait le
   * remplissage contre `surRemplissage`, et JAMAIS contre le fond de page. Il
   * passait donc à 18,8:1 sur `#ffffff` — la couleur qui figure dans cet
   * inventaire avec, en toutes lettres, le commentaire « contraste nul contre un
   * fond blanc ». Le garde nommait le défaut et regardait ailleurs (L-025).
   *
   * CE QUE ÇA DONNAIT À L'ÉCRAN : `arbitrage-qc.tsx` peint « Approuver » avec cet
   * aplat, sans bordure. Un accent clair rendait donc l'action principale
   * invisible sur la page du CLIENT, à côté d'un « Refuser » encadré et lisible.
   */
  test.each(COULEURS_EXTREMES)("%s : l'aplat se détache du fond de page", (couleur) => {
    const r = resoudreAccent(couleur, "#ffffff");
    const blanc = analyserHex("#ffffff");
    if (blanc === null) throw new Error("fond de référence illisible");

    const ratio = ratioContraste(analyserHex(r.remplissage) as never, blanc);
    expect(
      ratio,
      `l'aplat ${r.remplissage} issu de ${couleur} ne se détache pas du fond blanc`,
    ).toBeGreaterThanOrEqual(RATIO_INTERFACE);
  });

  /**
   * LE BANDEAU D'ÉTAT ÉCRIT SUR UNE TEINTE, PAS SUR LE FOND.
   *
   * `texte` est garanti à 4,5:1 contre le fond de page — et une teinte à 10 %
   * est plus sombre que ce fond. Sans une mesure contre la teinte elle-même, le
   * titre du bandeau passerait sous le seuil sur les accents ajustés au plus
   * juste, et le test du dessus resterait vert.
   */
  test.each(COULEURS_EXTREMES)("%s : le titre du bandeau se lit sur sa teinte", (couleur) => {
    const r = resoudreAccent(couleur, "#ffffff");
    const ratio = ratioContraste(analyserHex(r.surTeinte) as never, analyserHex(r.teinte) as never);
    expect(ratio, `${r.surTeinte} sur ${r.teinte}`).toBeGreaterThanOrEqual(RATIO_TEXTE);
  });

  /**
   * LA PASTILLE « EN COURS » ÉCRIT SUR LA TEINTE DOUCE, À 12 %, plus sombre
   * encore que celle du bandeau : la même mesure, contre elle.
   */
  test.each(COULEURS_EXTREMES)("%s : la pastille se lit sur sa teinte douce", (couleur) => {
    const r = resoudreAccent(couleur, "#ffffff");
    const ratio = ratioContraste(analyserHex(r.surDoux) as never, analyserHex(r.doux) as never);
    expect(ratio, `${r.surDoux} sur ${r.doux}`).toBeGreaterThanOrEqual(RATIO_TEXTE);
  });

  test("la teinte douce est plus soutenue que la teinte : 12 % contre 10 %", () => {
    const r = resoudreAccent("#5B4BF5", "#ffffff");
    expect(r.doux).toBe("#ebe9fe");
    expect(r.teinte).toBe("#efedfe");
  });

  test("une valeur invalide retombe sur le défaut sans lever", () => {
    // La page publique d'un vendeur ne doit jamais cesser de s'afficher parce
    // qu'une couleur est mal formée.
    const r = resoudreAccent("pas-une-couleur");
    // `brut` est NORMALISÉ en minuscules ; le défaut s'écrit comme le design
    // system l'écrit, en capitales, et c'est aussi ce que la base stocke.
    expect(r.brut).toBe(ACCENT_DEFAUT.toLowerCase());
    expect(r.ajuste).toBe(true);
  });

  test("contre-test positif : une couleur DÉJÀ conforme n'est pas modifiée", () => {
    // Sans ce test, une implémentation qui rendrait tout noir passerait à 100 %
    // — elle serait conforme partout et fausse partout.
    const r = resoudreAccent("#000000", "#ffffff");
    expect(r.texte).toBe("#000000");
    expect(r.interface).toBe("#000000");
    expect(r.ajuste).toBe(false);
  });

  test("la TEINTE est préservée : un rouge reste un rouge", () => {
    // Une correction qui dérive vers une autre teinte serait rejetée comme un
    // bogue par n'importe quel vendeur, et à raison.
    const r = resoudreAccent("#ff0000", "#ffffff");
    const ajuste = analyserHex(r.texte);
    if (ajuste === null) throw new Error("couleur ajustée illisible");
    expect(ajuste.r, "le canal rouge doit rester dominant").toBeGreaterThan(ajuste.g);
    expect(ajuste.r, "le canal rouge doit rester dominant").toBeGreaterThan(ajuste.b);
  });

  test("l'ajustement reste minimal : on n'assombrit pas plus que nécessaire", () => {
    // Un ajustement qui irait jusqu'au noir serait conforme mais détruirait la
    // marque du vendeur. On vérifie qu'on s'arrête près de la cible.
    const r = resoudreAccent("#ff0000", "#ffffff");
    const blanc = analyserHex("#ffffff");
    const ratio = ratioContraste(analyserHex(r.texte) as never, blanc as never);
    expect(ratio).toBeGreaterThanOrEqual(RATIO_TEXTE);
    expect(ratio, "assombri bien au-delà de la cible, la marque est perdue").toBeLessThan(
      RATIO_TEXTE + 1.5,
    );
  });

  test("sur fond sombre, l'accent est ÉCLAIRCI et non assombri", () => {
    // Falsification hors du cas motivant : toute la logique a été écrite en
    // pensant à un fond blanc. Un fond sombre inverse la direction.
    const r = resoudreAccent("#0058be", "#0f172a");
    const fond = analyserHex("#0f172a");
    const ratio = ratioContraste(analyserHex(r.texte) as never, fond as never);
    expect(ratio).toBeGreaterThanOrEqual(RATIO_TEXTE);
    expect(
      luminance(analyserHex(r.texte) as never),
      "sur fond sombre la couleur doit devenir plus claire que l'originale",
    ).toBeGreaterThan(luminance(analyserHex("#0058be") as never));
  });
});
