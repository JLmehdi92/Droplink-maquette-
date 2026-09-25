// @vitest-environment happy-dom
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DragEndEvent } from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * `CarteMedias.onEnregistre` NE PART QU'APRÈS LE OUI DE LA BASE.
 *
 * L'aperçu de la fiche commande est la VRAIE page client, rechargée sur ce signal
 * (26/09/2026). Il relit la base : un signal parti sur un PARI — le réordonnancement
 * est optimiste — rechargerait l'ancien ordre, puis plus rien ne le rechargerait. Et
 * un signal parti sur un ÉCHEC rechargerait pour rien. C'est la contrainte n° 8 : ce
 * que l'écran affirme, la base l'a enregistré.
 *
 * Ce fichier le vérifie À L'EXÉCUTION (revue ECC du 26/09/2026 : aucune porte ne
 * montait le composant). Les actions serveur sont remplacées par des doubles dont on
 * tient la promesse : on regarde le signal AVANT et APRÈS leur réponse.
 *
 * ⚠️ LE GLISSER-DÉPOSER N'EST PAS SIMULÉ AU POINTEUR : happy-dom n'a pas de géométrie,
 * et les capteurs de dnd-kit en dépendent. On appelle donc le `onDragEnd` que le
 * composant confie à `DndContext` — la fonction même qui réordonne et qui appelle la base.
 */

vi.mock("next-intl", () => ({ useTranslations: () => (cle: string) => cle }));

const actions = vi.hoisted(() => ({
  retirerMedia: vi.fn(),
  definirCouverture: vi.fn(),
  ordonnerMedias: vi.fn(),
  demanderDepot: vi.fn(),
  demanderDepotCouverture: vi.fn(),
  demanderDepotVignette: vi.fn(),
  validerDepot: vi.fn(),
}));
vi.mock("@/lib/commandes/actions-medias", () => actions);
vi.mock("@/lib/medias/vignette", () => ({
  apercuDepuisVideo: vi.fn(),
  couvertureDepuisImage: vi.fn(),
  vignetteDepuisImage: vi.fn(),
}));

const glisser = vi.hoisted(() => ({ fin: undefined as ((e: DragEndEvent) => unknown) | undefined }));
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement: creer } = await import("react");
  return {
    ...reel,
    DndContext: (props: Parameters<typeof reel.DndContext>[0]) => {
      glisser.fin = props.onDragEnd as (e: DragEndEvent) => unknown;
      return creer(reel.DndContext, props);
    },
  };
});

import { CarteMedias, type MediaAffiche } from "@/components/commandes/carte-medias";

const MEDIAS: readonly MediaAffiche[] = [
  { id: "m1", type: "photo", urlVignette: "/v/1.jpg", estCouverture: true, dureeS: null },
  { id: "m2", type: "photo", urlVignette: "/v/2.jpg", estCouverture: false, dureeS: null },
];

/** Une promesse qu'on résout quand on veut : le temps de la base, tenu en main. */
function enAttente<T>(): { promesse: Promise<T>; repondre: (v: T) => void } {
  let repondre: (v: T) => void = () => undefined;
  const promesse = new Promise<T>((r) => {
    repondre = r;
  });
  return { promesse, repondre };
}

let conteneur: HTMLDivElement;
let racine: Root;
const onEnregistre = vi.fn();

function monter(): void {
  act(() => {
    racine.render(
      createElement(CarteMedias, {
        orderId: "00000000-0000-0000-0000-000000000001",
        initiaux: MEDIAS,
        plafondMedias: 20,
        plafondVideos: 3,
        typesAcceptes: ["image/jpeg"],
        onEnregistre,
      }),
    );
  });
}

const bouton = (titre: string): HTMLButtonElement | undefined =>
  [...conteneur.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.title === titre);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  glisser.fin = undefined;
  conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
});

afterEach(() => {
  act(() => racine.unmount());
  conteneur.remove();
});

describe("CarteMedias signale une écriture seulement quand la base l'a confirmée", () => {
  test("la sonde tient bien les boutons et le glisser-déposer du composant", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : sans eux, chaque « 0 appel » ci-dessous serait vrai
    // d'un composant qu'on n'aurait jamais actionné.
    monter();
    expect(bouton("supprimer")).toBeDefined();
    expect(bouton("definirCouverture")).toBeDefined();
    expect(glisser.fin).toBeTypeOf("function");
  });

  test("suppression : rien avant la réponse, un signal sur « ok »", async () => {
    const base = enAttente<{ statut: "ok" }>();
    actions.retirerMedia.mockReturnValue(base.promesse);
    monter();
    act(() => bouton("supprimer")?.click());
    expect(actions.retirerMedia).toHaveBeenCalledTimes(1);
    expect(onEnregistre).not.toHaveBeenCalled();
    await act(async () => base.repondre({ statut: "ok" }));
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  test("suppression refusée par la base : aucun signal", async () => {
    actions.retirerMedia.mockResolvedValue({ statut: "echec", motif: "ecriture" });
    monter();
    await act(async () => bouton("supprimer")?.click());
    expect(actions.retirerMedia).toHaveBeenCalledTimes(1);
    expect(onEnregistre).not.toHaveBeenCalled();
  });

  test("couverture : un signal sur « ok », aucun sur un refus", async () => {
    actions.definirCouverture.mockResolvedValueOnce({ statut: "echec", motif: "ecriture" });
    monter();
    await act(async () => bouton("definirCouverture")?.click());
    expect(onEnregistre).not.toHaveBeenCalled();
    actions.definirCouverture.mockResolvedValueOnce({ statut: "ok" });
    await act(async () => bouton("definirCouverture")?.click());
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  test("réordonnancement : RIEN sur le pari optimiste, un signal quand la base dit oui", async () => {
    const base = enAttente<{ statut: "ok"; nombre: number }>();
    actions.ordonnerMedias.mockReturnValue(base.promesse);
    monter();
    let fin: unknown;
    act(() => {
      fin = glisser.fin?.({ active: { id: "m1" }, over: { id: "m2" } } as unknown as DragEndEvent);
    });
    // Le nouvel ordre est déjà à l'écran — et la base n'a encore rien dit.
    expect(actions.ordonnerMedias).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001", ["m2", "m1"]);
    expect(onEnregistre).not.toHaveBeenCalled();
    await act(async () => {
      base.repondre({ statut: "ok", nombre: 2 });
      await fin;
    });
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  test("réordonnancement refusé : retour à l'ordre confirmé, et aucun signal", async () => {
    actions.ordonnerMedias.mockResolvedValue({ statut: "echec", motif: "ecriture" });
    monter();
    await act(async () => {
      await glisser.fin?.({ active: { id: "m1" }, over: { id: "m2" } } as unknown as DragEndEvent);
    });
    expect(actions.ordonnerMedias).toHaveBeenCalledTimes(1);
    expect(onEnregistre).not.toHaveBeenCalled();
  });
});
