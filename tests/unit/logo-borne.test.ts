import { describe, expect, test } from "vitest";
import { COTE_LOGO, COTE_VIGNETTE, dimensionsBornees } from "@/lib/medias/vignette";
import { limites } from "@/lib/storage/limites";

/**
 * LE LOGO EST BORNÉ, ET LA BORNE VIENT D'UNE MESURE.
 *
 * ⚠️ DÉFAUT MESURÉ LE 27/08/2026 sur un vrai compte : le logo n'était réduit
 * NULLE PART — ni au navigateur, ni au serveur. Déposé en 1254 × 1254 pour
 * 1 682,9 Ko, affiché en 40 px, rechargé par chaque client de chaque commande.
 * Soit 5,6 fois le budget de la page publique ENTIÈRE.
 *
 * CE QUI EST ÉPROUVABLE ICI, ET CE QUI NE L'EST PAS — il faut le dire plutôt
 * que de laisser croire à une couverture qu'on n'a pas. La réduction elle-même
 * tient au canevas du navigateur, qui n'existe pas dans un environnement Node :
 * elle a été mesurée À LA MAIN, dans Chrome, sur le fichier réel (256 px en
 * WebP → 4,3 Ko, facteur 391). Ce qui EST éprouvable, c'est la partie décidable
 * — le calcul des dimensions — et la cohérence de la borne serveur avec cette
 * mesure. C'est exactement pour cela que le calcul a été sorti de la fonction
 * qui touche au canevas.
 */

describe("Les dimensions bornées", () => {
  test("une image carrée trop grande descend au côté, pile", () => {
    expect(dimensionsBornees(1254, 1254, COTE_LOGO)).toEqual({
      largeur: 256,
      hauteur: 256,
    });
  });

  /**
   * LE RATIO EST CONSERVÉ, et c'est la raison d'être de cette fonction. Un logo
   * est très souvent un MOT : le recadrer au carré comme on recadre une vignette
   * en couperait les deux extrémités, et le vendeur enverrait à ses clients une
   * marque amputée sans jamais le voir sur son propre écran de réglages.
   */
  test("un logo en bandeau garde ses proportions", () => {
    expect(dimensionsBornees(1200, 300, COTE_LOGO)).toEqual({ largeur: 256, hauteur: 64 });
    expect(dimensionsBornees(300, 1200, COTE_LOGO)).toEqual({ largeur: 64, hauteur: 256 });
  });

  test("un ratio extrême ne s'effondre jamais à zéro", () => {
    // Un côté arrondi à 0 produirait un canevas de largeur nulle, donc un
    // `toBlob` vide, donc un logo invisible chez le client — sans erreur nulle
    // part. Le plancher à 1 pixel est ce qui l'empêche.
    const r = dimensionsBornees(4000, 3, COTE_LOGO);
    expect(r.largeur).toBe(256);
    expect(r.hauteur).toBeGreaterThanOrEqual(1);
  });

  test("une image DÉJÀ petite n'est jamais agrandie", () => {
    // L'agrandir ajouterait des octets sans ajouter un seul détail — et le
    // vendeur paierait une image plus lourde pour une image plus floue.
    expect(dimensionsBornees(64, 48, COTE_LOGO)).toEqual({ largeur: 64, hauteur: 48 });
  });

  test("des dimensions absurdes ne font pas lever le dépôt", () => {
    expect(dimensionsBornees(0, 0, COTE_LOGO)).toEqual({ largeur: 1, hauteur: 1 });
  });
});

describe("La borne serveur", () => {
  /**
   * LE PLAFOND EST CONFRONTÉ À LA MESURE, pas à lui-même. Un test qui se
   * contenterait de relire la constante passerait quelle que soit sa valeur —
   * y compris les 2 Mo d'origine, qui autorisaient à eux seuls de dépasser le
   * budget de page de 6,7 fois.
   */
  const LOGO_REDUIT_MESURE_OCTETS = Math.round(4.3 * 1024);
  const BUDGET_PAGE_PUBLIQUE_OCTETS = 300 * 1024;

  test("il laisse passer le logo réel réduit, avec de la marge", () => {
    const plafond = limites().logoOctets;
    expect(plafond).toBeGreaterThan(LOGO_REDUIT_MESURE_OCTETS);
    // Au moins le double : une borne collée à la mesure refuserait le premier
    // logo un peu plus bruité que celui qu'on a eu sous la main.
    expect(plafond / LOGO_REDUIT_MESURE_OCTETS).toBeGreaterThanOrEqual(2);
  });

  test("il reste une FRACTION du budget de la page publique", () => {
    // C'est la propriété qui manquait. Le logo est une image parmi d'autres sur
    // une page budgétée à 300 Ko hors médias : lui accorder plus du dixième du
    // budget entier n'a aucun sens, et lui en accorder 6,7 fois en avait encore
    // moins.
    expect(limites().logoOctets).toBeLessThanOrEqual(BUDGET_PAGE_PUBLIQUE_OCTETS / 10);
  });

  test("il est du même ordre que la vignette, qui partage la même page", () => {
    const l = limites();
    expect(l.logoOctets).toBeLessThanOrEqual(l.vignetteOctets * 2);
  });

  test("le côté du logo reste cohérent avec celui de la vignette", () => {
    // Deux constantes indépendantes qui dérivent l'une de l'autre finissent par
    // se contredire. Le logo est le plus grand des deux — 40 px affichés contre
    // 200 px de vignette carrée — mais il n'a aucune raison d'être démesuré.
    expect(COTE_LOGO).toBeGreaterThan(COTE_VIGNETTE / 2);
    expect(COTE_LOGO).toBeLessThanOrEqual(COTE_VIGNETTE * 2);
  });
});
