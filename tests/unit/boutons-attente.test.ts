import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LES ACTIONS PRINCIPALES DOIVENT MONTRER QU'ELLES TRAVAILLENT.
 *
 * ⚠️ MESURE DU 09/09/2026 : 43 boutons sur 47 de l'espace authentifié ne
 * donnaient AUCUN retour au clic. C'est ce que Wassim a décrit par « c'est
 * sec », et il a validé le remède le même jour : l'anneau de `BoutonAction`,
 * même couleur, même dessin, pas d'animation de position.
 *
 * Ce contrôle garde l'EMPLOI du composant sur les actions principales — un
 * inventaire déclaré, avec la raison de chaque entrée, qui échoue dans les deux
 * sens : une entrée qui perd son bouton, et une entrée qui ne désigne plus rien.
 *
 * ⚠️ CE QU'IL NE PROUVE PAS, ET IL FAUT LE DIRE : que l'anneau soit VISIBLE.
 * Cela s'établit au navigateur, et ça a été fait le 10/09/2026 en cliquant le
 * bouton flottant de `/fr/commandes` et en échantillonnant le DOM — zéro anneau
 * animé avant le clic, un anneau animé et `aria-busy="true"` à 40 ms et à
 * 120 ms, plus rien une fois l'éditeur ouvert. Les portes n'ont pas de
 * navigateur ; ce contrôle garde donc le MOYEN, et le lien moyen → effet a été
 * établi une fois, à la main.
 */

/** Les fichiers qui doivent porter une action principale avec son attente. */
const ACTIONS: ReadonlyArray<{
  readonly fichier: string;
  readonly raison: string;
}> = [
  {
    fichier: "src/components/marque/formulaire-marque.tsx",
    raison:
      "« Enregistrer » de Ma marque — le premier posé, et celui que Wassim a " +
      "validé le 09/09 après avoir refusé la version animée.",
  },
  {
    fichier: "src/app/[locale]/(app)/commandes/page.tsx",
    raison:
      "Les deux boutons de création de l'écran le plus utilisé : celui de la " +
      "barre d'outils et le bouton FLOTTANT du téléphone.",
  },
  {
    fichier: "src/components/commandes/tableau-commandes.tsx",
    raison:
      "L'archivage groupé — action TOUT-OU-RIEN, donc la plus longue de " +
      "l'écran — et la création depuis le compte vide.",
  },
  {
    fichier: "src/components/commandes/carte-revocation.tsx",
    raison:
      "« Révoquer et régénérer ». Elle coupe définitivement un lien déjà " +
      "envoyé : c'est l'action du produit où recliquer par doute coûte le plus.",
  },
  {
    fichier: "src/components/admin/dialogue-suspension.tsx",
    raison:
      "La confirmation de suspension. Un administrateur qui ne voit rien " +
      "recommence — et c'est ce défaut exact qui a été mesuré ici le 29/08.",
  },
];

/** Le code sans ses commentaires — L-031 : une garde ne lit pas sa description. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function lire(chemin: string): string {
  return codeSeul(readFileSync(join(process.cwd(), chemin), "utf8"));
}

describe("les actions principales montrent leur attente", () => {
  test("CONTRE-TEST : les fichiers declares sont bien lus", () => {
    expect(ACTIONS.length, "inventaire vide : le contrôle ne garderait rien").toBeGreaterThanOrEqual(5);
    for (const action of ACTIONS) {
      expect(
        lire(action.fichier).length,
        `${action.fichier} est vide ou illisible : le contrôle n'inspecte rien`,
      ).toBeGreaterThan(500);
    }
  });

  test("chaque action declaree emploie BoutonAction", () => {
    const muets = ACTIONS.filter((action) => {
      const code = lire(action.fichier);
      return !(/<BoutonAction\b/.test(code) && /from "@\/components\/bouton-action"/.test(code));
    }).map((action) => `${action.fichier} — ${action.raison.slice(0, 70)}`);

    expect(
      muets,
      "Ces actions principales n'emploient plus `BoutonAction` : elles sont " +
        "redevenues muettes au clic. Mesuré le 09/09/2026, 43 boutons sur 47 " +
        "ne donnaient aucun retour, et c'est ce que Wassim a appelé « c'est sec ».",
    ).toEqual([]);
  });

  /**
   * ⚠️ L'ANNEAU EST DANS LE DOCUMENT MÊME AU REPOS, et c'est voulu : les quatre
   * libellés sont empilés dans la même cellule de grille pour que la largeur du
   * bouton ne saute pas d'un état à l'autre. La conséquence, elle, ne l'était
   * pas — mesuré le 10/09/2026 sur `/fr/commandes`, TROIS `animate-spin`
   * tournaient avant le moindre clic, sur l'écran qu'un fournisseur laisse
   * ouvert sa journée, au téléphone.
   */
  test("l anneau ne tourne QUE quand il est visible", () => {
    const code = lire("src/components/bouton-action.tsx");
    expect(
      /<Anneau\s+anime=\{courant\}/.test(code),
      "L'anneau n'est plus conditionné à l'état courant : il tournerait en " +
        "permanence dans les trois cellules invisibles de la grille.",
    ).toBe(true);
    expect(
      /className=\{anime \? "animate-spin"/.test(code),
      "`animate-spin` n'est plus conditionnel : la boîte doit rester pour " +
        "réserver la largeur, seule l'animation doit s'arrêter.",
    ).toBe(true);
  });

  /**
   * ⚠️ LE BOUTON FLOTTANT EST LE SEUL DONT LE MOT NE CHANGE PAS, ET C'EST
   * MESURÉ. Avec « Création… » en libellé d'attente, il passait de 132,7 à
   * 144,8 px de large AU REPOS : la grille réserve la largeur du libellé le plus
   * long, et le plus long devenait celui qu'on ne voit presque jamais. La
   * planche `CommandesMobile` dessine ce bouton ; douze pixels y sont un écart.
   */
  test("le bouton flottant garde son mot pendant l attente, donc sa largeur", () => {
    const code = lire("src/app/[locale]/(app)/commandes/page.tsx");
    const flottant = /className="fixed[\s\S]*?<\/form>/.exec(code)?.[0] ?? "";
    expect(
      flottant.length,
      "le bouton flottant est introuvable : ce contrôle n'inspecte rien",
    ).toBeGreaterThan(200);
    expect(
      /enCours: t\("nouvelleCourt"\)/.test(flottant),
      "Le bouton flottant emploie un libellé d'attente différent de son " +
        "libellé de repos : sa largeur au repos suivra le plus long des deux, " +
        "et il cessera de correspondre à la planche `CommandesMobile`.",
    ).toBe(true);
  });
});
