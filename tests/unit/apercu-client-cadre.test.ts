// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * L'APERÇU DE LA FICHE COMMANDE — CE QU'IL FAIT DE SON CADRE, EXÉCUTÉ.
 *
 * Les autres gardes lisent du code (`apercu-page-client`) ou le HTML servi (fumée, qui
 * n'exécute pas de JavaScript). Aucune ne montait le composant : trois propriétés
 * vérifiées au seul navigateur piloté, hors du dépôt, pouvaient donc disparaître avec
 * toutes les portes au vert (revue ECC du 26/09/2026).
 *
 *  1. AUCUN CADRE TANT QUE LA ZONE N'A PAS DE LARGEUR. C'est le défaut mesuré au
 *     téléphone le 26/09 : panneau caché, et pourtant deux demandes de l'aperçu par
 *     fiche ouverte — Chrome ne diffère pas un cadre caché. Une zone non affichée
 *     mesure 0 ; elle ne doit produire aucun `<iframe>`.
 *  2. LA LARGEUR DE LA PAGE EST CELLE DE L'APPAREIL (390 / 1180), jamais la colonne.
 *  3. LE DOUBLE TAMPON : une nouvelle version se charge DESSOUS, invisible, et ne
 *     remplace l'ancienne qu'à son chargement — un seul cadre ensuite.
 *
 * ⚠️ CE QUE CE FICHIER N'ÉTABLIT PAS. happy-dom ne charge pas les pages des cadres
 * (désactivé : aucune requête ne part) et n'a pas de moteur de rendu ; la largeur est
 * donc SIMULÉE par `clientWidth` et `ResizeObserver`, pilotés ici. La reprise de la
 * hauteur de défilement et l'effet réel d'`inert` restent prouvés au navigateur.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (cle: string) => cle }));

import { ApercuClient } from "@/components/commandes/apercu-client";

const JETON = "xK9mQ2pL7vR4nT8wY3zB1";

/** La largeur que renverra `clientWidth`, et les observateurs à réveiller. */
let largeur = 0;
const observateurs: Array<() => void> = [];
let clientWidthOrigine: PropertyDescriptor | undefined;
let conteneur: HTMLDivElement;
let racine: Root;

class ObservateurPilote {
  constructor(private readonly rappel: () => void) {}
  observe(): void {
    observateurs.push(this.rappel);
  }
  disconnect(): void {}
  unobserve(): void {}
}

function redimensionner(nouvelle: number): void {
  largeur = nouvelle;
  act(() => {
    for (const rappel of observateurs) rappel();
  });
}

const cadres = (): HTMLIFrameElement[] => [...conteneur.querySelectorAll("iframe")];

function monter(version: number): void {
  act(() => {
    racine.render(createElement(ApercuClient, { jeton: JETON, versPageClient: "/fr/commandes/x/page-client", version }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  largeur = 0;
  observateurs.length = 0;
  vi.stubGlobal("ResizeObserver", ObservateurPilote);
  clientWidthOrigine = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => largeur });
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  if (clientWidthOrigine) Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthOrigine);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Le cadre de l'aperçu", () => {
  test("une zone NON AFFICHÉE (largeur 0) ne produit aucun cadre — le cas du téléphone", () => {
    monter(0);
    expect(cadres()).toHaveLength(0);
    // Et le panneau est bien là : sans ce contre-test, un composant qui ne rendrait
    // rien du tout passerait l'assertion précédente.
    expect(conteneur.textContent).toContain("apercuTitre");
  });

  test("une zone affichée produit UN cadre, vers l'aperçu du jeton, à la largeur du téléphone", () => {
    monter(0);
    redimensionner(520);
    const [cadre] = cadres();
    expect(cadres()).toHaveLength(1);
    expect(cadre?.getAttribute("src")).toBe(`/p/${JETON}/apercu`);
    expect(cadre?.style.width).toBe("390px");
    expect(cadre?.style.transform).toMatch(/^scale\(0\.72/);
    expect(cadre?.className).not.toContain("invisible");
  });

  test("la zone qui se masque retire le cadre, celle qui réapparaît le recrée", () => {
    monter(0);
    redimensionner(520);
    redimensionner(0);
    expect(cadres()).toHaveLength(0);
    redimensionner(520);
    expect(cadres()).toHaveLength(1);
  });

  test("Desktop sert la page à 1180 px, réduite à la largeur de la zone", () => {
    monter(0);
    redimensionner(520);
    const desktop = [...conteneur.querySelectorAll("button")].find((b) => b.textContent?.includes("apercuDesktop"));
    act(() => desktop?.click());
    const [cadre] = cadres();
    expect(desktop?.getAttribute("aria-pressed")).toBe("true");
    expect(cadre?.style.width).toBe("1180px");
    expect(cadre?.getAttribute("title")).toBe("apercuCadreDesktop");
    // (520 - 2 px de filet) / 1180
    expect(cadre?.style.transform).toBe(`scale(${518 / 1180})`);
  });

  test("une nouvelle version se charge DESSOUS, puis remplace l'ancienne à son chargement", () => {
    monter(0);
    redimensionner(520);
    const ancien = cadres()[0];
    monter(1);
    // Rien avant l'attente : deux enregistrements coup sur coup ne rechargent qu'une fois.
    expect(cadres()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(cadres()).toHaveLength(2);
    const nouveau = cadres().find((c) => c !== ancien);
    expect(nouveau?.className).toContain("invisible");
    expect(ancien?.className).not.toContain("invisible");
    act(() => {
      nouveau?.dispatchEvent(new Event("load"));
    });
    expect(cadres()).toEqual([nouveau]);
    expect(nouveau?.className).not.toContain("invisible");
  });

  test("RÉVOQUER le lien ne blanchit pas l'aperçu : le nouveau jeton se charge dessous", () => {
    /*
     * ⚠️ DÉFAUT TROUVÉ PAR LA REVUE ECC DU 26/09/2026. La clé du cadre affiché lisait le
     * jeton COURANT : à la révocation, React remontait le cadre déjà chargé, à vide.
     * L'ancien doit rester affiché, intact, jusqu'au chargement du nouveau.
     */
    monter(0);
    redimensionner(520);
    const ancien = cadres()[0];
    act(() => {
      racine.render(
        createElement(ApercuClient, { jeton: "NouveauJeton00000001", versPageClient: "/x", version: 0 }),
      );
    });
    expect(cadres()).toEqual([ancien]);
    expect(ancien?.getAttribute("src")).toBe(`/p/${JETON}/apercu`);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    const nouveau = cadres().find((c) => c !== ancien);
    expect(cadres()).toHaveLength(2);
    expect(nouveau?.getAttribute("src")).toBe("/p/NouveauJeton00000001/apercu");
    expect(nouveau?.className).toContain("invisible");
    act(() => {
      nouveau?.dispatchEvent(new Event("load"));
    });
    expect(cadres()).toEqual([nouveau]);
  });

  test("le cadre est hors de la tabulation : Tab ne traverse pas la page encadrée", () => {
    monter(0);
    redimensionner(520);
    expect(cadres()[0]?.getAttribute("tabindex")).toBe("-1");
  });

  test("le chargement de l'ANCIEN cadre ne déclenche aucun échange", () => {
    monter(0);
    redimensionner(520);
    const ancien = cadres()[0];
    monter(1);
    act(() => {
      vi.advanceTimersByTime(350);
    });
    act(() => {
      ancien?.dispatchEvent(new Event("load"));
    });
    expect(cadres()).toHaveLength(2);
  });
});
