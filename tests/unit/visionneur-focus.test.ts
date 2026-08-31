// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Visionneur, type EntreeVisionneur } from "@/components/publique/visionneur";

/**
 * LE PIÈGE DE FOCUS DU VISIONNEUR PLEIN ÉCRAN.
 *
 * ⚠️ CORRECTION FAITE LE 31/08/2026 ET LAISSÉE SANS TEST, faute de DOM dans le
 * projet `unit`. C'est exactement la situation que L-006 décrit : « un test qui
 * n'a jamais échoué ne prouve rien » — mais un correctif sans aucun test ne
 * prouve rien non plus, et celui-ci est d'autant plus fragile qu'il porte sur
 * une propriété qu'AUCUNE relecture ne distingue de son absence. `aria-modal`
 * et un piège de tabulation se ressemblent assez pour qu'on croie l'un acquis
 * en posant l'autre ; à l'écran, la différence ne se voit qu'au clavier.
 *
 * ── POURQUOI PAS UN PROJET VITEST DE PLUS ──────────────────────────────────
 *
 * L'environnement est choisi PAR FICHIER (la première ligne). Un quatrième
 * projet aurait demandé une entrée dans `scripts/suite.mjs`, un plancher, une
 * ligne de plus dans `gates` et un script dans `package.json` — quatre endroits
 * où une suite peut se retrouver hors des portes sans que personne le voie. Le
 * projet `unit` reste ce qu'il dit être : pur, sans réseau ni base.
 *
 * ── CE QUE CE TEST N'ÉTABLIT PAS, ET QU'IL FAUT DIRE ───────────────────────
 *
 * `happy-dom` n'a pas de moteur de rendu : `offsetParent` y vaut toujours
 * `null`, alors que dans un vrai navigateur il vaut `null` pour ce qui est
 * masqué. Le filtre de visibilité du composant est donc NEUTRALISÉ ici (voir
 * plus bas). Ce fichier prouve LA BOUCLE DE TABULATION et LA RESTITUTION DU
 * FOCUS ; il ne prouve rien du tri entre éléments visibles et masqués, qui
 * demanderait un vrai navigateur.
 */

const MEDIAS: readonly EntreeVisionneur[] = [
  { id: "m1", type: "photo", urlVignette: "/v/1.jpg", largeur: 800, hauteur: 600 },
  { id: "m2", type: "photo", urlVignette: "/v/2.jpg", largeur: 800, hauteur: 600 },
  { id: "m3", type: "photo", urlVignette: "/v/3.jpg", largeur: 800, hauteur: 600 },
];

const LIBELLES = {
  ouvrir: "Ouvrir",
  fermer: "Fermer",
  precedent: "Précédent",
  suivant: "Suivant",
  chargement: "Chargement",
  indisponible: "Indisponible",
  position: "{n} sur {total}",
  balayez: "Balayez",
};

let conteneur: HTMLDivElement;
let racine: Root;
let offsetParentOrigine: PropertyDescriptor | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

  /*
   * ⚠️ `offsetParent` EST NEUTRALISÉ, ET C'EST UNE CONCESSION À L'OUTIL, PAS AU
   * PRODUIT.
   *
   * Le composant filtre ses éléments focalisables sur `e.offsetParent !== null`
   * — le seul moyen fiable, dans un vrai navigateur, d'écarter ce qui est
   * masqué. `happy-dom` ne calculant aucune disposition, il rend toujours
   * `null` : sans cette neutralisation la liste serait VIDE, le piège se
   * désarmerait tout seul, et le test échouerait pour une raison qui n'existe
   * que dans le simulateur. On simule donc « tout est disposé », ce qui est
   * vrai du dialogue ouvert.
   */
  offsetParentOrigine = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
  });

  // La demande d'URL pleine ne doit pas partir : ce fichier est dans le projet
  // `unit`, qui est SANS RÉSEAU. On rend un échec, que le composant sait
  // afficher — le piège de focus ne dépend pas de l'image.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
  );

  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
  vi.unstubAllGlobals();
  if (offsetParentOrigine !== undefined) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParentOrigine);
  }
});

function monter(): void {
  act(() => {
    racine.render(
      createElement(Visionneur, {
        jeton: "jeton-de-test",
        medias: MEDIAS,
        filigrane: null,
        libelles: LIBELLES,
      }),
    );
  });
}

/** Le dialogue plein écran, ou `null` s'il est fermé. */
function dialogue(): HTMLElement | null {
  return conteneur.querySelector<HTMLElement>('[role="dialog"]');
}

/** Les éléments focalisables DU DIALOGUE, dans l'ordre du document. */
function focalisablesDuDialogue(): HTMLElement[] {
  const boite = dialogue();
  if (boite === null) return [];
  return [
    ...boite.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
    ),
  ];
}

function frapper(touche: string, options: KeyboardEventInit = {}): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: touche, ...options, bubbles: true }));
  });
}

/** Ouvre le plein écran en cliquant la première vignette. */
function ouvrir(): HTMLElement {
  const declencheur = conteneur.querySelector<HTMLElement>("button");
  expect(declencheur, "aucune vignette cliquable : la sonde vise à côté").not.toBeNull();
  const bouton = declencheur as HTMLElement;
  bouton.focus();
  act(() => bouton.click());
  return bouton;
}

describe("Le visionneur — la sonde inspecte quelque chose", () => {
  test("le dialogue s'ouvre et contient des éléments focalisables", () => {
    // ⚠️ UN ENSEMBLE VIDE PASSE TOUT. Si le dialogue ne s'ouvrait pas, ou
    // n'offrait aucun élément focalisable, chaque test ci-dessous passerait
    // sans rien éprouver — la boucle de tabulation serait vide.
    monter();
    ouvrir();
    expect(dialogue(), "le plein écran ne s'est pas ouvert").not.toBeNull();
    expect(
      focalisablesDuDialogue().length,
      "aucun élément focalisable dans le dialogue : il n'y a pas de boucle à fermer",
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("Le visionneur — la tabulation reste dans le dialogue", () => {
  test("Tab depuis le DERNIER élément revient au premier", () => {
    monter();
    ouvrir();

    const liste = focalisablesDuDialogue();
    const premier = liste[0] as HTMLElement;
    const dernier = liste[liste.length - 1] as HTMLElement;
    dernier.focus();
    expect(document.activeElement).toBe(dernier);

    frapper("Tab");

    expect(
      document.activeElement,
      "la tabulation est sortie du visionneur : le focus part derrière la " +
        "couche opaque, et le visiteur pilote une page qu'il ne voit plus",
    ).toBe(premier);
  });

  test("Maj+Tab depuis le PREMIER élément va au dernier", () => {
    monter();
    ouvrir();

    const liste = focalisablesDuDialogue();
    const premier = liste[0] as HTMLElement;
    const dernier = liste[liste.length - 1] as HTMLElement;
    premier.focus();

    frapper("Tab", { shiftKey: true });

    expect(document.activeElement).toBe(dernier);
  });

  test("Maj+Tab depuis un élément HORS du dialogue y ramène", () => {
    /*
     * Le cas qu'on oublie : le focus a déjà fui — par un clic, par un lecteur
     * d'écran, par un `autofocus` d'ailleurs. Un piège qui ne traite que ses
     * propres bornes laisse alors le visiteur dehors définitivement.
     */
    monter();
    ouvrir();

    const dehors = document.createElement("button");
    document.body.appendChild(dehors);
    dehors.focus();
    expect(document.activeElement).toBe(dehors);

    frapper("Tab", { shiftKey: true });

    const liste = focalisablesDuDialogue();
    expect(liste).toContain(document.activeElement as HTMLElement);
    dehors.remove();
  });

  test("contre-test : DIALOGUE FERMÉ, la tabulation n'est plus contrainte", () => {
    /*
     * ⚠️ SANS CE TEST, UNE IMPLÉMENTATION QUI PIÈGE LE FOCUS EN PERMANENCE
     * passerait tous les précédents — et rendrait la page publique
     * inutilisable au clavier en dehors du plein écran. Une suite où tout est
     * contraint passe à 100 % sans rien prouver.
     */
    monter();
    expect(dialogue(), "le dialogue devrait être fermé au montage").toBeNull();

    const dehors = document.createElement("button");
    document.body.appendChild(dehors);
    dehors.focus();

    frapper("Tab");

    expect(
      document.activeElement,
      "le focus a été déplacé alors qu'aucun dialogue n'est ouvert",
    ).toBe(dehors);
    dehors.remove();
  });
});

describe("Le visionneur — le focus est RENDU à sa vignette", () => {
  test("Échap ferme et rend le focus au déclencheur", () => {
    /*
     * Il retombait sur `<body>`. Sur une galerie de vingt médias, il fallait
     * alors tout retraverser pour ouvrir la suivante — le genre de coût qu'on
     * ne mesure jamais parce qu'on ne le paie pas soi-même.
     */
    monter();
    const declencheur = ouvrir();
    expect(dialogue()).not.toBeNull();

    frapper("Escape");

    expect(dialogue(), "Échap n'a pas fermé le plein écran").toBeNull();
    expect(
      document.activeElement,
      "le focus n'est pas revenu à la vignette d'où l'on venait",
    ).toBe(declencheur);
  });
});
