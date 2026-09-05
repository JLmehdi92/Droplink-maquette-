import { describe, expect, test } from "vitest";
import { encoder } from "@/lib/medias/vignette";

/**
 * LE FORMAT DE SORTIE SE CONSTATE, IL NE SE SUPPOSE PAS.
 *
 * ⚠️ DÉFAUT TROUVÉ CHEZ UN VRAI CLIENT, LE 05/09/2026. Les quatre encodages du
 * module demandaient `image/webp` et gardaient le résultat SANS REGARDER CE
 * QU'IL ÉTAIT.
 *
 * `toBlob` ne rend pas `null` quand un format n'est pas encodable : la
 * spécification HTML impose à l'agent de se rabattre sur `image/png`. Le blob
 * arrive donc, la fonction le rend, tout paraît normal — et une vignette PNG de
 * 200 × 200 pèse 60 à 110 Ko contre un plafond DUR de 20 Ko. Le serveur la
 * refuse, la commande garde `cle_vignette` nulle, et la page du client
 * n'affiche RIEN.
 *
 * ⚠️ POURQUOI CE DÉFAUT A PU VIVRE : tout ce module tient au canevas, qui
 * n'existe pas sous Node. Aucune suite ne pouvait le voir. `encoder` ne prend
 * donc qu'une TOILE — n'importe quel objet qui sait `toBlob` — et s'éprouve
 * avec un encodeur de substitution qui imite un navigateur donné.
 */

type Rappel = (blob: Blob | null) => void;

/**
 * Une toile de substitution.
 *
 * `formatsSus` énumère ce que ce navigateur imaginaire sait encoder. Tout le
 * reste retombe sur `image/png`, EXACTEMENT comme l'impose la spécification —
 * et c'est ce repli-là, silencieux, qui a produit le défaut.
 */
function toileQuiSait(formatsSus: readonly string[]) {
  const demandes: string[] = [];
  return {
    demandes,
    toBlob(rappel: Rappel, type?: string) {
      const demande = type ?? "image/png";
      demandes.push(demande);
      const rendu = formatsSus.includes(demande) ? demande : "image/png";
      rappel(new Blob(["x"], { type: rendu }));
    },
  };
}

describe("L'encodage d'une dérivée constate ce qu'il a produit", () => {
  test("un navigateur qui sait le WebP rend du WebP, sans second essai", async () => {
    // CONTRE-TEST, ET IL VIENT EN PREMIER : sans lui, « ça rend du JPEG »
    // serait vrai d'un encodeur qui aurait cessé de tenter le WebP, c'est-à-dire
    // qui alourdirait toutes les dérivées de tous les vendeurs.
    const toile = toileQuiSait(["image/webp"]);
    const blob = await encoder(toile, 0.82, "image/jpeg");

    expect(blob?.type).toBe("image/webp");
    expect(toile.demandes, "un seul appel : le WebP a suffi").toEqual(["image/webp"]);
  });

  test("un navigateur SANS WebP se replie sur le JPEG, pas sur le PNG", async () => {
    const toile = toileQuiSait(["image/jpeg", "image/png"]);
    const blob = await encoder(toile, 0.82, "image/jpeg");

    // C'EST LE CŒUR DU DÉFAUT. Avant, le PNG rendu par le repli implicite était
    // conservé tel quel — 60 à 110 Ko pour une tuile plafonnée à 20.
    expect(blob?.type, "le PNG implicite doit être remplacé, pas gardé").toBe("image/jpeg");
    expect(toile.demandes).toEqual(["image/webp", "image/jpeg"]);
  });

  test("le logo se replie sur le PNG, parce qu'il a une couche alpha", async () => {
    // JPEG n'a pas d'alpha : un logo transparent réencodé en JPEG sort sur fond
    // noir. Le repli n'est donc PAS le même selon ce qu'on encode, et cette
    // distinction doit être éprouvée — sinon un correctif « replie tout en
    // JPEG » passerait le test précédent et abîmerait tous les logos.
    const toile = toileQuiSait(["image/jpeg", "image/png"]);
    const blob = await encoder(toile, 0.9, "image/png");

    expect(blob?.type).toBe("image/png");
    expect(toile.demandes).toEqual(["image/webp", "image/png"]);
  });

  test("un encodeur qui ne rend rien du tout laisse l'appelant décider", async () => {
    // `null` est un cas distinct de « mauvais format » : l'appelant l'emploie
    // pour abandonner la dérivée sans bloquer le média, et le confondre avec un
    // repli ferait déposer un blob vide.
    const toile = {
      toBlob(rappel: Rappel) {
        rappel(null);
      },
    };
    expect(await encoder(toile, 0.82, "image/jpeg")).toBeNull();
  });
});
