import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * LES ÎLOTS CLIENTS DE LA PAGE PUBLIQUE SONT UN INVENTAIRE, PAS UN DÉCOMPTE.
 *
 * ⚠️ LE BRIEF S'EST TROMPÉ DEUX FOIS SUR CE CHIFFRE, ET LA SECONDE FOIS EN
 * CROYANT CORRIGER LA PREMIÈRE. Il a dit « deux îlots seulement », puis
 * « trois îlots, pas deux » le 31/08/2026. Il y en a QUATRE, relevé le
 * 02/09/2026 en comptant les fichiers.
 *
 * Le quatrième est la frontière d'erreur, `app/p/[token]/error.tsx` — et le
 * paragraphe qui précède IMMÉDIATEMENT ce décompte, dans le même document,
 * explique pourquoi elle DOIT porter `"use client"`. L'amendement a donc
 * corrigé le chiffre en oubliant l'îlot que sa propre voisine venait
 * d'introduire : L-025, un correctif qui hérite du champ de vision de la
 * correction plutôt que du problème.
 *
 * Et il avait écrit son propre épitaphe : *« un décompte qu'on ne vérifie pas
 * devient l'argument avec lequel on refusera le quatrième îlot — ou avec lequel
 * on l'acceptera en croyant qu'il est le troisième »*.
 *
 * POURQUOI CE CONTRÔLE PLUTÔT QU'UN CHIFFRE JUSTE. Un chiffre juste
 * aujourd'hui redevient faux au prochain îlot, et sans bruit — c'est ce qui
 * vient de se produire deux fois. Ce qui est tenu ici est donc une LISTE
 * NOMMÉE, et elle échoue DANS LES DEUX SENS : un îlot ajouté sans être déclaré,
 * et une déclaration qui ne désigne plus rien.
 *
 * ⚠️ CE N'EST PAS DE LA COMPTABILITÉ. Chaque îlot est du JavaScript expédié au
 * téléphone d'un client, sur la page dont le budget est le plus serré du
 * produit — LCP < 2 s en 4G, moins de 300 Ko hors médias. Le décompte était
 * l'argument qui servait à en refuser un de plus ; faux, il ne pouvait plus
 * servir à rien.
 */

/** Les îlots déclarés, chacun avec la raison qui l'autorise. */
const DECLARES: ReadonlyArray<{ readonly fichier: string; readonly raison: string }> = [
  {
    fichier: "src/components/publique/visionneur.tsx",
    raison:
      "Le plein écran. Écrit à la main : une bibliothèque de carrousel coûterait " +
      "40 à 90 Ko, soit la moitié de la marge du budget à elle seule.",
  },
  {
    fichier: "src/components/publique/balise-vue.tsx",
    raison:
      "Le comptage de consultation, émis APRÈS le rendu — compter au rendu " +
      "gonflerait la métrique de verdict par construction, WhatsApp et Discord " +
      "chargeant les liens qu'on leur colle.",
  },
  {
    fichier: "src/components/publique/arbitrage-qc.tsx",
    raison:
      "L'approbation ou le refus du client. Monté seulement si la commande " +
      "porte au moins un média : une commande sans photo n'expédie pas cet îlot.",
  },
  {
    fichier: "src/app/p/[token]/error.tsx",
    raison:
      "La frontière d'erreur. Elle NE PEUT PAS être un Server Component — " +
      "c'est une contrainte de React, pas un choix. C'est elle qui a imposé le " +
      "seul provider i18n client de la page, restreint à trois libellés.",
  },
];

/** Tous les fichiers de la page publique portant la directive, relevés sur le disque. */
function ilotsReels(): readonly string[] {
  const racines = [
    join("src", "components", "publique"),
    join("src", "app", "p"),
  ];
  const trouves: string[] = [];

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entree)) continue;
      const source = readFileSync(chemin, "utf8");
      /*
       * LA DIRECTIVE EST CHERCHÉE EN TÊTE DE FICHIER, pas n'importe où : une
       * mention dans un commentaire — et ces fichiers en sont pleins — ferait
       * compter comme îlot un composant serveur qui explique pourquoi il n'en
       * est pas un. C'est L-031, appliqué à la position plutôt qu'aux
       * commentaires.
       */
      if (/^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(source)) {
        trouves.push(relative(process.cwd(), chemin).split(sep).join("/"));
      }
    }
  };

  for (const racine of racines) parcourir(join(process.cwd(), racine));
  return trouves.sort();
}

describe("Les îlots clients de la page publique", () => {
  const reels = ilotsReels();

  test("la sonde parcourt réellement les fichiers de la page publique", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : sans cette borne, un chemin faux rendrait
    // la liste vide et « aucun îlot non déclaré » serait vrai en n'ayant rien lu.
    expect(reels.length, "aucun îlot trouvé : la sonde vise à côté").toBeGreaterThanOrEqual(3);
  });

  test("chaque îlot réel est déclaré, avec sa raison", () => {
    const declares = DECLARES.map((d) => d.fichier);
    const nonDeclares = reels.filter((f) => !declares.includes(f));
    expect(
      nonDeclares,
      "Îlots clients non déclarés. Chacun est du JavaScript expédié au téléphone " +
        "d'un client sur la page au budget le plus serré du produit : il se " +
        "déclare avec sa raison, ou il ne se pose pas.",
    ).toEqual([]);
  });

  test("aucune déclaration ne survit à l'îlot qu'elle décrivait", () => {
    // L'AUTRE SENS. Une déclaration orpheline fait croire l'inventaire complet
    // alors qu'il décrit un fichier disparu — et elle masquerait un
    // remplacement du même nom.
    const orphelines = DECLARES.map((d) => d.fichier).filter((f) => !reels.includes(f));
    expect(orphelines, "Déclarations d'îlots devenues sans objet").toEqual([]);
  });

  test("chaque raison dit quelque chose", () => {
    // Une déclaration sans raison est une case cochée : elle autorise l'îlot
    // suivant par imitation, sans que personne ait pesé son coût.
    for (const { fichier, raison } of DECLARES) {
      expect(raison.length, `la raison de « ${fichier} » est vide ou trop courte`).toBeGreaterThan(
        60,
      );
    }
  });
});
