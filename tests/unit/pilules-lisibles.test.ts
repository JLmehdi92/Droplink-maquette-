import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * AUCUNE PILULE NE PEINT SON TEXTE DE LA COULEUR DE SON FOND.
 *
 * ⚠️ CE GARDE EXISTE PARCE QUE LE DÉFAUT ÉTAIT LÀ NEUF FOIS, sur cinq écrans
 * d'administration, et qu'aucune porte ne pouvait le voir. `bg-ds-erreur
 * text-ds-erreur` est une classe VALIDE, servie, et le jeton existe : les deux
 * gardes de couleurs vérifient qu'une classe pointe sur une variable définie,
 * jamais que le résultat se LIT. La pilule « Suspendu » du journal d'audit
 * rendait donc un aplat rouge sans une lettre dedans.
 *
 * Il est resté invisible longtemps pour une raison de jeu de mesure : le jeu
 * n'a ni compte suspendu, ni boutique au-dessus de son plafond, ni alerte —
 * exactement les trois états qui déclenchent ces pilules. Il a fallu un journal
 * peuplé de suspensions pour qu'un aplat rouge muet apparaisse sur une capture.
 *
 * ⚠️ IL COMPARE DES VALEURS, PAS DES NOMS (L-020). Un contrôle qui interdirait
 * la chaîne `bg-ds-erreur text-ds-erreur` serait muet sur
 * `bg-ds-erreur text-[#EF4B57]`, sur un futur alias, et sur toute paire de
 * tokens qui résoudrait au même hexadécimal sans se ressembler. Les deux noms
 * sont donc RÉSOLUS dans `globals.css` avant d'être compares.
 *
 * ⚠️ ET IL PROUVE D'ABORD QU'IL INSPECTE QUELQUE CHOSE. Un ensemble vide passe
 * tout : si le balayage ne trouvait plus une seule paire fond + texte, il
 * annoncerait « aucune pilule illisible » sur un produit entier.
 */

const RACINE = join(process.cwd(), "src");
const CSS = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** `--color-ds-erreur: #EF4B57` → `ds-erreur` ↦ `#ef4b57`. */
function jetonsDeCouleur(): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const ligne of CSS.split("\n")) {
    const m = /^\s*--color-([a-z0-9-]+)\s*:\s*([^;]+);/.exec(ligne);
    if (m === null) continue;
    const nom = m[1];
    const valeur = m[2];
    if (nom === undefined || valeur === undefined) continue;
    table.set(nom, valeur.trim().toLowerCase());
  }
  return table;
}

/**
 * LE CODE, COMMENTAIRES RETIRÉS — L-031, ET IL A MORDU ICI MÊME.
 *
 * Le balayage cherche des LITTÉRAUX de chaîne. Une apostrophe dans un
 * commentaire français — « l'élément », « qu'une image » — ouvre un faux
 * littéral `'…'` qui avale tout jusqu'à l'apostrophe suivante, et le découpage
 * se décale sur des dizaines de lignes. Le garde dénonçait alors des boutons
 * parfaitement corrects, en citant la moitié de leur classe.
 *
 * Les commentaires de bloc partent en entier ; les lignes qui COMMENCENT par
 * `//` ou `*` partent aussi. On ne touche pas aux `//` de fin de ligne : une URL
 * `https://` en contient, et les retirer couperait la chaîne qui la porte.
 */
function sansCommentaires(source: string): string {
  const sansBlocs = source
    .split("/*")
    .map((p, i) => (i === 0 ? p : p.slice(p.indexOf("*/") + 2)))
    .join("");
  return sansBlocs
    .split("\n")
    .filter((l) => {
      const nu = l.trimStart();
      return !nu.startsWith("//") && !nu.startsWith("*");
    })
    .join("\n");
}

/*
 * ⚠️ AUCUN ANTISLASH DANS CE MOTIF, ET C'EST LA MÊME LEÇON QUE `fumee.mjs`.
 * Écrit avec la séquence de frontière de mot — celle que ce commentaire ne peut
 * pas citer sans la subir —, il rendait FAUX sur une chaîne qui contient
 * pourtant `text-ds-texte-sur-marque` — le garde dénonçait alors les onze
 * boutons corrects et taisait le seul fautif, c'est-à-dire l'exact inverse de
 * son rôle. La séquence de frontière de mot ne survit pas à la chaîne d'outils,
 * et rien ne le dit : le motif cassé a l'air juste partout où on le regarde.
 *
 * La frontière est donc écrite en CLASSE DE CARACTÈRES. Moins lisible,
 * impossible à casser en silence.
 */
const COULEUR_SUR_MARQUE = new RegExp(
  "(^|[^A-Za-z0-9_-])text-(ds-texte-sur-marque|white)([^A-Za-z0-9_-]|$)",
);

function fichiers(dossier: string): string[] {
  const sortie: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiers(chemin));
    } else if (chemin.endsWith(".tsx")) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/**
 * Les paires `bg-…` + `text-…` d'UN MÊME littéral de chaîne.
 *
 * Le littéral est la bonne unité : les deux branches d'un ternaire sont deux
 * littéraux distincts, donc deux paires distinctes, et un fond posé dans une
 * branche ne se compare pas au texte de l'autre.
 */
interface Paire {
  readonly fichier: string;
  readonly fond: string;
  readonly texte: string;
}

function pairesDe(chemin: string, source: string): Paire[] {
  const paires: Paire[] = [];
  for (const litteral of source.match(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g) ?? []) {
    const classes = litteral.slice(1, -1).split(/\s+/);
    const fonds = classes
      .filter((c) => c.startsWith("bg-") && !c.includes("["))
      .map((c) => c.slice(3));
    const textes = classes
      .filter((c) => c.startsWith("text-") && !c.includes("["))
      .map((c) => c.slice(5));
    for (const fond of fonds) {
      for (const texte of textes) {
        paires.push({ fichier: chemin.slice(process.cwd().length + 1), fond, texte });
      }
    }
  }
  return paires;
}

/**
 * LES SURFACES DE MARQUE DÉCLARENT TOUJOURS LEUR COULEUR DE TEXTE.
 *
 * ⚠️ CE GARDE EXISTE POUR UN DÉFAUT QUE LE PRÉCÉDENT NE POUVAIT PAS VOIR.
 * `.degrade-ds-marque` ne pose qu'une IMAGE de fond : il n'y a aucun jeton de
 * couleur à comparer, donc aucune paire à résoudre. L'appel principal de la
 * landing héritait de l'encre — du noir sur un violet→corail, sur le bouton le
 * plus important de la seule page que tout le monde voit — et les onze autres
 * emplois du dégradé portaient tous `text-ds-texte-sur-marque`.
 *
 * L'exception est le texte EN dégradé (`bg-clip-text`), où l'image de fond est
 * le texte lui-même : y poser une couleur la rendrait opaque.
 */
const SUR_MARQUE_ADMISES: ReadonlyMap<string, string> = new Map([
  [
    "degrade-ds-marque h-[74px]",
    "L’en-tête de la maquette de téléphone de la landing : le dégradé y est un " +
      "APLAT décoratif, et les deux textes qu’il porte déclarent `text-white` sur " +
      "leur propre nœud — le conteneur, lui, n’a aucun texte direct.",
  ],
]);

describe("Les surfaces peintes du dégradé de marque", () => {
  test("chacune déclare la couleur de son texte", () => {
    const defauts: string[] = [];
    let vues = 0;

    for (const fichier of fichiers(RACINE)) {
      const source = sansCommentaires(readFileSync(fichier, "utf8"));
      for (const litteral of source.match(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g) ?? []) {
        const nu = litteral.slice(1, -1);
        if (!nu.includes("degrade-ds-marque")) continue;
        vues += 1;
        /* Le texte EN dégradé : le fond EST le texte, découpé dessus. */
        if (nu.includes("bg-clip-text")) continue;
        if (COULEUR_SUR_MARQUE.test(nu)) continue;
        /* Une concaténation : la couleur peut vivre dans le fragment suivant. */
        const suite = source.slice(source.indexOf(litteral) + litteral.length, source.indexOf(litteral) + litteral.length + 220);
        if (COULEUR_SUR_MARQUE.test(suite)) continue;
        defauts.push(`${fichier.slice(process.cwd().length + 1)} : ${nu.slice(0, 60)}…`);
      }
    }

    const restants = defauts.filter(
      (d) => ![...SUR_MARQUE_ADMISES.keys()].some((cle) => d.includes(cle)),
    );

    /* UNE EXCEPTION QUI NE DESIGNE PLUS RIEN EST UNE PORTE OUVERTE : sans ce
       refus, la liste grossirait jusqu a tout couvrir. */
    const perimees = [...SUR_MARQUE_ADMISES.keys()].filter(
      (cle) => !defauts.some((d) => d.includes(cle)),
    );
    expect(perimees, `Exceptions perimees : ${perimees.join(", ")}`).toEqual([]);

    /* CONTRE-TEST : le balayage voit-il encore des surfaces de marque ? */
    expect(
      vues,
      "aucune surface `degrade-ds-marque` trouvée : le balayage ne mesure plus rien",
    ).toBeGreaterThan(8);

    expect(
      restants,
      "Le dégradé de marque ne pose qu'une IMAGE de fond : sans couleur de texte " +
        "déclarée, l'élément hérite de l'encre — du noir sur un violet→corail. " +
        "Ajouter `text-ds-texte-sur-marque` :\n" +
        defauts.join("\n"),
    ).toEqual([]);
  });
});

describe("Les pilules et tuiles colorées", () => {
  test("aucune ne peint son texte de la couleur exacte de son fond", () => {
    const jetons = jetonsDeCouleur();
    expect(jetons.size, "aucun token de couleur lu dans globals.css").toBeGreaterThan(50);

    const toutes = fichiers(RACINE).flatMap((f) =>
      pairesDe(f, sansCommentaires(readFileSync(f, "utf8"))),
    );

    /* CONTRE-TEST : le balayage voit-il encore des paires ? Sans lui, une
       expression cassée annoncerait « aucune illisible » sur tout le produit. */
    const resolues = toutes.filter(
      (p) => jetons.has(p.fond) && jetons.has(p.texte),
    );
    expect(
      resolues.length,
      "le balayage ne trouve plus une seule paire fond + texte résolue : un ensemble vide passe tout",
    ).toBeGreaterThan(30);

    const illisibles = resolues
      .filter((p) => jetons.get(p.fond) === jetons.get(p.texte))
      .map((p) => `${p.fichier} : bg-${p.fond} + text-${p.texte} → ${jetons.get(p.fond)}`);

    expect(
      illisibles,
      "Un fond et un texte de la MÊME valeur ne rendent rien de lisible. " +
        "Employer la variante de fond du jeton — `bg-ds-erreur-fond text-ds-erreur` — " +
        "ou une paire dont le contraste a été mesuré :\n" +
        illisibles.join("\n"),
    ).toEqual([]);
  });
});
