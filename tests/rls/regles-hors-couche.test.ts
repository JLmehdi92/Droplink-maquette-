import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * TOUTE RÈGLE CSS ÉCRITE HORS D'UNE `@layer` L'EMPORTE SUR LES UTILITAIRES —
 * ET C'EST INVISIBLE À LA RELECTURE DU BALISAGE.
 *
 * ⚠️ TROIS FOIS LE MÊME DÉFAUT, TROIS ENDROITS DIFFÉRENTS, ET AUCUN N'A ÉTÉ
 * TROUVÉ EN LISANT DU CODE :
 *
 *  1. `.champ-editeur { font-size: 15px }` battait le `lg:text-[14px]` écrit
 *     juste à côté, dans le même fichier.
 *  2. `body { background: var(--color-surface) }` battait le
 *     `bg-surface-container-lowest` de la page client : le corps rendait le
 *     gris du tableau de bord sur une page qui doit être blanche.
 *  3. `@media (pointer: coarse) { button { min-height: 44px } }` battait
 *     `min-h-[50px]` sur TOUS les boutons du produit, sur les appareils
 *     tactiles — donc sur l'appareil qui est justement la cible. Mesuré dans
 *     Chrome : 44 px là où les deux planches en dessinent 50.
 *
 * Le mode de défaillance est toujours le même : la classe est écrite, elle est
 * bien générée, elle est bien appliquée — et elle perd. Rien n'échoue, rien
 * n'est journalisé, l'élément prend simplement une autre valeur.
 *
 * CE QUE CE TEST ÉPROUVE : l'INVENTAIRE des sélecteurs hors couche dans la
 * feuille RÉELLEMENT SERVIE, pas dans la source. Chaque entrée porte sa raison ;
 * ajouter une règle hors couche oblige à en écrire une, et c'est à ce
 * moment-là qu'on se demande si elle n'aurait pas sa place dans `@layer base`.
 *
 * IL ÉCHOUE DANS LES DEUX SENS : un sélecteur hors couche non déclaré, et un
 * sélecteur déclaré qui a disparu.
 */

const SORTIE_BUILD = join(process.cwd(), ".next", "static");

function feuilles(dossier: string): string[] {
  const trouvees: string[] = [];
  const parcourir = (courant: string): void => {
    let entrees: string[];
    try {
      entrees = readdirSync(courant);
    } catch {
      return;
    }
    for (const entree of entrees) {
      const chemin = join(courant, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".css")) trouvees.push(chemin);
    }
  };
  parcourir(dossier);
  return trouvees;
}

/**
 * Retire chaque bloc `@layer nom { … }` par comptage d'accolades.
 *
 * Une expression régulière ne suffit pas : les blocs contiennent des accolades
 * imbriquées (`@media`, `@supports`), et un motif non gourmand s'arrêterait à
 * la première fermeture rencontrée — donc laisserait passer pour « hors
 * couche » tout ce qui suit dans le même bloc.
 */
function retirerLesCouches(source: string): string {
  let sortie = "";
  let i = 0;
  while (i < source.length) {
    const debut = source.indexOf("@layer", i);
    if (debut < 0) {
      sortie += source.slice(i);
      break;
    }
    sortie += source.slice(i, debut);

    const ouvrante = source.indexOf("{", debut);
    const pointVirgule = source.indexOf(";", debut);
    // `@layer theme, base, components, utilities;` déclare un ORDRE, pas un bloc.
    if (ouvrante < 0 || (pointVirgule >= 0 && pointVirgule < ouvrante)) {
      i = pointVirgule + 1;
      continue;
    }

    let profondeur = 0;
    let k = ouvrante;
    for (; k < source.length; k++) {
      if (source[k] === "{") profondeur += 1;
      else if (source[k] === "}") {
        profondeur -= 1;
        if (profondeur === 0) break;
      }
    }
    i = k + 1;
  }
  return sortie;
}

/** Un pas de `@keyframes` (`0%`, `50%`, `to`) n'est pas un sélecteur d'élément. */
const ETAPE_ANIMATION = /^(?:\d+%|from|to)(?:\s*,\s*(?:\d+%|from|to))*$/;

/**
 * Les sélecteurs hors couche qui posent au moins une déclaration autre qu'une
 * propriété personnalisée. Une `--variable` ne concurrence aucun utilitaire.
 */
export function selecteursHorsCouche(css: string): readonly string[] {
  const horsCouche = retirerLesCouches(css);
  const trouves = new Set<string>();
  const motif = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(horsCouche)) !== null) {
    const selecteur = (m[1] ?? "").replace(/\s+/g, " ").trim();
    const corps = m[2] ?? "";
    // `@property --tw-…` est émis par Tailwind lui-même, pas par notre feuille.
    if (selecteur.startsWith("@property")) continue;
    if (ETAPE_ANIMATION.test(selecteur)) continue;

    const declarations = corps
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && !d.startsWith("--"));
    if (declarations.length === 0) continue;

    /*
     * LES CLASSES DE `next/font` PORTENT UN HACHAGE qui change à chaque
     * modification de police. Les nommer une par une rendrait cet inventaire
     * rouge à chaque build sans qu'aucune règle n'ait bougé. On les replie
     * donc sur un nom stable — elles restent DANS l'inventaire, avec leur
     * raison, elles n'en sortent pas.
     *
     * ⚠️ DEUX FORMATS, PARCE QUE NEXT 16 A CHANGÉ LE SIEN. Jusqu'à Next 15 :
     * `.__className_1a2b3c`. Depuis Next 16 :
     * `.inter_93f8105e-module__S0HThW__className`, où le nom de la famille est
     * en tête et deux hachages encadrent le suffixe. Le second motif reconnaît
     * cette forme et la replie sur le MÊME nom stable : l'inventaire ne dépend
     * pas de la façon dont Next fabrique ses noms.
     */
    const replie = selecteur
      .replace(/\.__(className|variable)_[0-9a-f]+/g, ".__$1_*")
      .replace(/\.[a-z_0-9]+-module__[A-Za-z0-9_]+__(className|variable)/g, ".__$1_*");

    /*
     * ⚠️ LES PARTIES D'UN SÉLECTEUR COMPOSÉ SONT TRIÉES, ET C'EST CE QUI REND
     * CET INVENTAIRE STABLE. Next 16 a émis `*,:before,:after` là où Next 15
     * écrivait `*,:after,:before`, et réordonné les quatre `.anim-*` : trois
     * lignes de l'inventaire sont devenues fausses sans qu'une seule règle CSS
     * ait changé de sens. Un contrôle qui dépend de l'ordre d'écriture d'un
     * compilateur mesure le compilateur, pas le produit.
     */
    trouves.add(
      replie.includes(",")
        ? replie
            .split(",")
            .map((p) => p.trim())
            .sort()
            .join(",")
        : replie,
    );
  }
  return [...trouves].sort();
}

/**
 * L'INVENTAIRE, AVEC SA RAISON POUR CHAQUE LIGNE.
 *
 * La raison est OBLIGATOIRE : sans elle, cette liste devient l'endroit où l'on
 * range ce qu'on ne veut pas expliquer, et le contrôle ne prouve plus rien.
 */
const TOLEREES: ReadonlyMap<string, string> = new Map([
  [
    "body",
    "le fond et la police du produit. Il bat volontairement les utilitaires — " +
      "et c'est pour cette raison que la page client pose SON fond en style en " +
      "ligne plutôt qu'en classe.",
  ],
  [".carte", "la carte du canevas : fond, filet, rayon. Aucun écran ne la surcharge."],
  [".defilement-discret", "masque la barre de défilement Windows sur les rangées de pilules."],
  [".defilement-discret::-webkit-scrollbar", "le même, côté WebKit."],
  [".degrade-marque", "le dégradé de marque, une seule action principale par écran."],
  [
    ".degrade-ds-marque",
    "le dégradé du design system, pour les écrans migrés. ⚠️ Il ne pose AUCUNE " +
      "couleur de texte, contrairement à son aîné qui force `#ffffff` : sur un " +
      "aplat d'accent le texte prend `surRemplissage`, jamais un blanc en dur. " +
      "Il vit hors couche comme elle, pour la même raison — une classe de " +
      "composant que rien ne surcharge.",
  ],
  [".champ", "le champ de saisie du canevas."],
  [".champ:focus", "son état de focus, piloté par l'accent du vendeur."],
  [".champ-app", "le champ de l'espace vendeur."],
  [".champ-app:focus", "le même, au focus."],
  [".champ-editeur", "le champ de l'éditeur — sa taille responsive vit ICI, et pas en classe."],
  [".champ-editeur:focus", "le même, au focus."],
  [".champ-liste", "la liste déroulante et son chevron, en CSS réel : une valeur " +
    "arbitraire Tailwind à guillemets ne produit AUCUNE règle, en silence."],
  [".bento-item", "la tuile de la variante bento du tableau de bord."],
  [".bento-item:hover", "la même, au survol."],
  [".anim-flot", "animation de la landing."],
  [".anim-derive", "animation de la landing."],
  [".anim-anneau", "animation de la landing."],
  [".anim-halo", "animation de la landing."],
  [
    ".anim-anneau,.anim-derive,.anim-flot,.anim-halo",
    "leur neutralisation sous `prefers-reduced-motion`.",
  ],
  [
    "@font-face",
    "les deux familles servies par `next/font/google` — jamais un CDN. Émis par " +
      "Next, pas par notre feuille.",
  ],
  [
    ".__className_*",
    "la classe générée par `next/font` pour chaque famille. Son nom porte un " +
      "hachage : l'inventaire la replie sur un nom stable.",
  ],
  [
    "*,:after,:before",
    "`prefers-reduced-motion` : il DOIT battre tout le reste, c'est un réglage " +
      "système et non une préférence de design.",
  ],
]);

describe("Les règles CSS écrites hors d'une couche", () => {
  const css = feuilles(SORTIE_BUILD)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const trouves = selecteursHorsCouche(css);

  /**
   * UN ENSEMBLE VIDE PASSE TOUT. Sans build, ou avec un découpage de feuilles
   * qui change, cette suite passerait à 100 % en n'ayant rien lu.
   */
  test("la sonde lit une feuille compilée et y trouve des règles hors couche", () => {
    expect(
      css.length,
      "aucune feuille compilée dans `.next`. Lancer `pnpm build` avant cette suite.",
    ).toBeGreaterThan(10_000);
    expect(trouves.length).toBeGreaterThanOrEqual(10);
  });

  test("chacune est déclarée avec sa raison", () => {
    const inconnues = trouves.filter((s) => !TOLEREES.has(s));
    expect(
      inconnues,
      "Une règle hors couche l'emporte sur tout utilitaire Tailwind, sur chaque " +
        "élément qu'elle touche, sans que rien n'échoue. Si c'est un socle, " +
        "l'écrire dans `@layer base` ; si c'est un composant, l'assumer ici avec " +
        "sa raison.",
    ).toEqual([]);
  });

  /**
   * L'AUTRE SENS. Une exception qui ne correspond plus à rien donne
   * l'impression que le sujet est traité alors qu'il ne l'est plus.
   */
  test("aucune déclaration n'est devenue inutile", () => {
    const mortes = [...TOLEREES.keys()].filter((s) => !trouves.includes(s));
    expect(mortes).toEqual([]);
  });

  /**
   * CONTRE-TEST POSITIF. Une sonde qui ne trouverait jamais rien passerait les
   * deux contrôles ci-dessus. On lui présente une feuille où la règle fautive
   * est HORS couche, puis la même où elle est DANS `@layer base`.
   */
  test("elle distingue une règle hors couche d'une règle couchée", () => {
    const fautive = "@layer base{a{color:red}}button{min-height:44px}";
    const rangee = "@layer base{a{color:red}button{min-height:44px}}";
    expect(selecteursHorsCouche(fautive)).toEqual(["button"]);
    expect(selecteursHorsCouche(rangee)).toEqual([]);
  });

  /**
   * ET ELLE NE SE LAISSE PAS BERNER PAR UNE ACCOLADE IMBRIQUÉE — c'est le seul
   * endroit où une expression régulière non gourmande se serait trompée, en
   * déclarant « hors couche » tout ce qui suit un `@media` interne.
   */
  test("elle traverse correctement un @media imbriqué dans une couche", () => {
    const css = "@layer base{@media (pointer:coarse){button{min-height:44px}}}p{color:red}";
    expect(selecteursHorsCouche(css)).toEqual(["p"]);
  });
});
