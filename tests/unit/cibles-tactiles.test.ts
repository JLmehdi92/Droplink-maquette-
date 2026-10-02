import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * LES CIBLES TACTILES DES PIEDS DE PAGE — UN INVENTAIRE, PAS UNE SÉLECTION.
 *
 * ⚠️ LE BRIEF §8 EXIGE 44 POINTS, ET LE PRODUIT EN SERVAIT 15. Mesuré au
 * navigateur le 09/09/2026 sur les quatre surfaces publiques, à 390 px réels :
 * les trois liens légaux de la landing faisaient 15 px de haut, ceux de la
 * coque publique 16, et le « Propulsé par DropLink » de la page client 16.
 * Toutes les LARGEURS dépassaient déjà 44 — seule la hauteur manquait.
 *
 * ⚠️ IL Y A TROIS PIEDS DE PAGE DISTINCTS, ET C'EST LE PIÈGE QUI A FAILLI ME
 * FAIRE N'EN CORRIGER QU'UN. `app/[locale]/page.tsx` (la landing),
 * `components/public/coque-site.tsx` (conditions, confidentialité, signalement,
 * blog, connexion, inscription…) et `components/publique/page-client.tsx` (la page
 * client, sortie de `app/p/[token]/page.tsx` le 26/09/2026 pour servir aussi l'aperçu).
 * Ils ne partagent pas leur dessin — c'est délibéré, la planche fait foi pour
 * chacun — donc rien dans le code ne relie une correction aux deux autres.
 * D'où un contrôle qui BALAIE `src/` au lieu de viser des fichiers nommés :
 * un quatrième pied ajouté demain tombera dedans sans que personne y pense.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS, ET IL FAUT LE DIRE. Il lit des CLASSES,
 * pas une géométrie — c'est L-020, un contrôle qui cherche un mot ne prouve
 * rien. La hauteur réellement rendue a été mesurée au navigateur piloté, avec
 * la position du texte avant/après pour établir que RIEN ne bougeait
 * visuellement, et les portes n'ont pas de navigateur pour la refaire. Ce
 * contrôle garde donc le MOYEN (la classe qui produit les 44 px), et il est
 * honnête sur le fait que le lien moyen → effet a été établi une fois, à la
 * main. Ce qu'il attrape vraiment : un pied ajouté sans la règle, ou la règle
 * retirée d'un pied existant.
 */

/** 44 points, exprimés dans l'échelle Tailwind : `min-h-11` = 2,75rem = 44 px. */
const CLASSE_MINIMALE = "min-h-11";

/**
 * ⚠️ LA MARGE NÉGATIVE FAIT PARTIE DE LA RÈGLE, PAS DE LA DÉCORATION. La cible
 * passe de 15-16 px à 44, mais le pied ne doit PAS grandir : sans la marge qui
 * annule le surplus dans le flux, la hauteur du pied changerait et la planche
 * du canevas cesserait d'être exacte. Mesuré : hauteur des quatre pieds
 * inchangée, texte déplacé de 0,0 px sur les 14 cibles.
 */
const CLASSE_COMPENSATION = /-my-(?:\d+(?:\.\d+)?|\[[^\]]+\])/;

/** Ce qui compte comme cible tactile dans un pied. */
// `LienEcran` est un `<a>` : le 02/10/2026 un lien de pied écrit avec lui échappait au motif.
const OUVERTURE_CIBLE = /<(?:Link|LienEcran|a|button)\b/g;

function fichiersSource(racine: string): string[] {
  const trouves: string[] = [];
  const descendre = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (/\.tsx$/.test(entree)) trouves.push(chemin);
    }
  };
  descendre(racine);
  return trouves;
}

/**
 * Le code sans ses commentaires.
 *
 * ⚠️ L-031 : un motif appliqué au fichier brut se satisferait du commentaire
 * qui DÉCRIT la règle. Le commentaire ci-dessus contient « min-h-11 » ; sans
 * ce nettoyage, il suffirait à faire passer un pied qui ne la porte pas.
 */
function codeSeul(source: string): string {
  // ⚠️ LES SAUTS DE LIGNE SONT PRÉSERVÉS, et ce n'est pas cosmétique : c'est
  // ce qui permet de citer un NUMÉRO DE LIGNE exact dans un échec. Écraser un
  // bloc de commentaire sur un seul espace décalait tout ce qui suit.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Chaque `<footer …>…</footer>` avec sa position, balises imbriquées comprises. */
function piedsDe(code: string): Array<{ readonly texte: string; readonly decalage: number }> {
  const pieds: Array<{ texte: string; decalage: number }> = [];
  let depuis = 0;
  for (;;) {
    const debut = code.indexOf("<footer", depuis);
    if (debut === -1) break;
    const fin = code.indexOf("</footer>", debut);
    if (fin === -1) break;
    pieds.push({ texte: code.slice(debut, fin), decalage: debut });
    depuis = fin + 1;
  }
  return pieds;
}

/**
 * La valeur de `className` d'une cible, la constante du fichier résolue.
 *
 * La coque publique écrit `className={lienPied}` et déclare `lienPied` plus
 * haut : lire l'attribut sans le résoudre rendrait le nom de la variable, et
 * le contrôle croirait la classe absente.
 */
function classesDe(balise: string, code: string): string {
  /*
   * ⚠️ LE PREMIER ATTRIBUT, QUELLE QUE SOIT SA FORME. La balise court jusqu'à
   * la cible suivante : pour le dernier lien d'une colonne, elle emporte le
   * `<div className="…">` de la colonne d'après. Chercher d'abord un littéral,
   * PUIS une référence, rendait les classes de ce `div` à un lien écrit
   * `className={lienPied}` — et le déclarait fautif (18/09/2026, pied de la
   * landing). C'est l'attribut qui vient en PREMIER qui appartient à la cible.
   */
  const premier = /className=(?:"([^"]*)"|\{([A-Za-z_$][\w$]*)\})/.exec(balise);
  if (premier?.[1] !== undefined) return premier[1];
  const reference = premier?.[2];
  if (reference === undefined) return "";
  // Recherche littérale plutôt qu'une expression construite : le nom peut
  // contenir un `$`, qui devrait alors être échappé — et une expression bâtie
  // par concaténation est précisément ce qui se casse en silence.
  const marque = "const " + reference;
  const debut = code.indexOf(marque);
  if (debut === -1) return "";
  const suite = code.slice(debut + marque.length);
  const egal = suite.indexOf("=");
  const pointVirgule = suite.indexOf(";");
  if (egal === -1 || pointVirgule === -1 || egal > pointVirgule) return "";
  return suite.slice(egal + 1, pointVirgule);
}

const RACINE = join(process.cwd(), "src");

/** Chaque cible tactile de chaque pied, avec de quoi la nommer dans l'échec. */
const CIBLES = fichiersSource(RACINE).flatMap((chemin) => {
  const code = codeSeul(readFileSync(chemin, "utf8"));
  return piedsDe(code).flatMap((pied) => {
    const debuts = [...pied.texte.matchAll(OUVERTURE_CIBLE)].map((m) => m.index);
    return debuts.map((debut, i) => {
      const suivant = debuts[i + 1] ?? pied.texte.length;
      const balise = pied.texte.slice(debut, suivant);
      const ligne = code.slice(0, pied.decalage + debut).split("\n").length;
      const relatif = relative(process.cwd(), chemin).split(sep).join("/");
      return {
        fichier: relatif,
        // ⚠️ LE REPÈRE EST `fichier:ligne`, PAS UN LIBELLÉ. Le texte du lien ne
        // suffit pas : la landing engendre ses trois liens par un `.map()`, donc
        // sa balise n'ouvre pas sur du texte mais sur un `<span>`, et le `href`
        // y est la variable `{href}`. Les deux premiers essais ont produit
        // « — «  » » puis « — « href » », qui n'aidaient ni l'un ni l'autre.
        // Une ligne, elle, se clique et mène à l'endroit exact.
        libelle:
          `${relatif}:${ligne}` +
          (((/>\s*\{?([^<>{}\n]{2,40})/.exec(balise)?.[1] ?? "").trim() &&
            ` — ${(/>\s*\{?([^<>{}\n]{2,40})/.exec(balise)?.[1] ?? "").trim()}`) ||
            ""),
        classes: classesDe(balise, code),
        balise,
      };
    });
  });
});

describe("les cibles tactiles des pieds de page", () => {
  /**
   * ⚠️ UN ENSEMBLE VIDE PASSE TOUT. Si le balayage cessait de trouver les
   * pieds — un `<footer>` remplacé par un composant, une extension de fichier
   * qui change — les contrôles suivants resteraient verts en n'inspectant
   * rien. Ce compte est donc vérifié AVANT eux, et il est délibérément
   * exprimé en minimum plutôt qu'en égalité : un pied de plus est une bonne
   * nouvelle, zéro pied est une panne du contrôle.
   */
  test("le balayage trouve REELLEMENT les pieds de page et leurs cibles", () => {
    const fichiers = [...new Set(CIBLES.map((c) => c.fichier))];
    expect(fichiers.length, "aucun <footer> trouvé dans src/ : le balayage est cassé").toBeGreaterThanOrEqual(3);
    // ⚠️ CINQ CIBLES DANS LE CODE POUR SEPT LIENS RENDUS, et l'écart n'est pas
    // une erreur : la landing engendre ses trois liens légaux par un `.map()`,
    // donc son pied ne porte qu'UNE balise. J'avais d'abord écrit 7 en
    // comptant les liens SERVIS — le contrôle est parti rouge et il avait
    // raison. C'est ce qu'un contre-test est censé faire.
    expect(CIBLES.length, "aucune cible tactile trouvée dans les pieds").toBeGreaterThanOrEqual(5);
  });
});

/**
 * LES LIENS EN FLUX DE TEXTE, EXEMPTÉS NOMMÉMENT.
 *
 * ⚠️ CETTE LISTE EXISTE PARCE QUE LE BALAYAGE NE SAIT PAS LIRE UNE PHRASE. Il
 * attrape tout `<a>` d'un `<footer>` ; or WCAG 2.5.8 exempte le lien EN FLUX DE
 * TEXTE, et la règle 5 du design system le redit : « les liens en ligne dans la
 * prose restent à leur hauteur de texte, les agrandir casserait l'interligne du
 * paragraphe ». Donner 44 px au lien « conditions d'utilisation » au milieu
 * d'une phrase de consentement disloquerait ce paragraphe.
 *
 * ⚠️ ELLE EST APPARUE LE 11/09/2026, ET PAS PAR CONFORT. La migration de
 * `/connexion` sur le design system a mis la phrase légale dans un vrai
 * `<footer>` — elle vivait dans un `<p>` libre, donc hors du balayage. Le
 * contrôle est parti rouge sur deux liens qui n'ont jamais changé de nature :
 * ce n'est pas le lien qui est devenu fautif, c'est le balayage qui a cessé de
 * l'ignorer par accident. Une exemption ACCIDENTELLE n'en est pas une.
 *
 * ⚠️ CHAQUE ENTRÉE PORTE SON COMPTE, et c'est ce qui la fait échouer dans les
 * DEUX SENS : un repère qui ne désigne plus rien, et un repère qui en désigne
 * soudain un de plus — un troisième lien glissé dans la même phrase serait
 * exempté en silence sans cette vérification.
 *
 * ⚠️ VIDE DEPUIS LE 13/09/2026, ET LE MÉCANISME RESTE. Le portage de la
 * connexion sur le kit `auth` a retiré la phrase de consentement de son pied :
 * le kit ne la pose qu'à l'inscription, où l'on accepte quelque chose, et elle
 * n'y vit pas dans un `<footer>`. Son unique entrée ne désignait plus rien. Le
 * prochain lien de prose glissé dans un pied s'inscrira ici, avec sa raison.
 */
const EN_FLUX: ReadonlyArray<{
  readonly fichier: string;
  readonly repere: string;
  readonly nombre: number;
  readonly raison: string;
}> = [
];

/**
 * LES CIBLES DONT LA FEUILLE DE LA REFONTE PORTE LES 44 PX (02/10/2026).
 *
 * Les pieds des blocs de « Paramètres » (`.bloc-r__pied`) sont des `<footer>` : la
 * maquette y dessine des boutons de 34 px au bureau, portés à 44 au toucher par
 * sa feuille, pas par une classe. L'exemption n'est valable que si la règle
 * existe ENCORE dans la feuille — sans elle, la cible retombe sous le plancher.
 */
// Les feuilles de la refonte que les cibles des pieds peuvent invoquer : l'espace vendeur et la page client.
const FEUILLE_REFONTE = ["app", "client"]
  .map((f) => readFileSync(join(process.cwd(), "src", "styles", "refonte", f + ".css"), "utf8"))
  .join("\n");
const PORTEES_PAR_LA_FEUILLE: ReadonlyArray<{ readonly classe: string; readonly regle: string; readonly raison: string }> = [
  {
    classe: "cv-pied__lien",
    regle: ".cv-pied a { display: inline-flex; align-items: center; min-height: 44px;",
    raison: "Les trois liens du pied de la page client (v3) : 44 px au téléphone par `client.css` ; le bureau les rend à leur hauteur de texte.",
  },
  {
    classe: "bouton-app",
    regle: ".recherche, .bouton-app, .alertes__bouton { height: 44px; }",
    raison:
      "Toute `.bouton-app` vaut 44 px au toucher, par la règle `@media (pointer: coarse)` de la feuille d'app — " +
      "pieds de « Paramètres » et de « Passer au Pro » compris.",
  },
  {
    classe: "bouton-outil",
    regle: ".bouton-outil, .bouton-app--plein, .bouton-app--second, .bouton-texte, .vues-liste button, .puce, .adm-danger, .adm-confirmer, .adm-pastille-contest, .adm-lien { min-height: 44px; }",
    raison:
      "Toute `.bouton-outil` vaut 44 px au toucher (règle `pointer: coarse` de la feuille) : « Voir la " +
      "suite » des listes d'administration et « Annuler » de ses dialogues compris.",
  },
  {
    classe: "lien-r",
    regle: "@media (pointer: coarse) { .lien-r { display: inline-flex; align-items: center; min-height: 44px; } }",
    raison: "Les deux liens autonomes de « Paramètres » (portail de résiliation, « Ma marque »).",
  },
  {
    classe: "notif-pied__lien",
    regle: ".notif-pied__lien { display: inline-flex; align-items: center; min-height: 44px;",
    raison: "Le lien « Comment fonctionne DropLink » du pied de la page de notification (refonte, 02/10/2026).",
  },
];

describe("les cibles portées par la feuille de la refonte", () => {
  test("chaque règle déclarée existe encore dans la feuille", () => {
    const absentes = PORTEES_PAR_LA_FEUILLE.filter((p) => !FEUILLE_REFONTE.includes(p.regle)).map((p) => p.regle);
    expect(absentes, "règle disparue : les cibles qu'elle portait retombent sous 44 px").toEqual([]);
  });
});

/** Les cibles d'un pied qui ne sont PAS exemptées comme liens de prose, ni portées par la feuille. */
const CIBLES_AUTONOMES_DES_PIEDS = CIBLES.filter(
  (c) =>
    !EN_FLUX.some((e) => c.fichier === e.fichier && c.balise.includes(e.repere)) &&
    !PORTEES_PAR_LA_FEUILLE.some((p) => c.classes.includes(p.classe) && FEUILLE_REFONTE.includes(p.regle)),
);

describe("les liens en flux de texte sont exemptés, et seulement eux", () => {
  test("chaque exemption désigne exactement le nombre de liens déclaré", () => {
    const ecarts = EN_FLUX.map((e) => {
      const trouves = CIBLES.filter(
        (c) => c.fichier === e.fichier && c.balise.includes(e.repere),
      ).length;
      return trouves === e.nombre
        ? null
        : `${e.fichier} — « ${e.repere} » désigne ${trouves} lien(s), ${e.nombre} déclaré(s)`;
    }).filter((x): x is string => x !== null);

    expect(
      ecarts,
      "Une exemption qui ne désigne plus le bon nombre de liens n'exempte plus " +
        "ce qu'on croyait, et exempte peut-être ce qu'on n'a jamais voulu.",
    ).toEqual([]);
  });
});

/**
 * LES PIEDS OÙ 44 PX EST LA HAUTEUR DESSINÉE, PAS UN AGRANDISSEMENT.
 *
 * La compensation (`-my-…`) existe pour qu'une cible portée à 44 px ne fasse pas
 * grandir un pied dessiné plus serré. Le pied de la refonte (maquette du
 * 01/10/2026, `.pied nav a { min-height: 44px }`) DESSINE ses liens à 44 px : il
 * n'y a rien à compenser, et une marge négative ferait chevaucher les liens. Le
 * plancher `min-h-11` reste exigé sur chacun (test précédent).
 */
const PIEDS_DESSINES_A_44: ReadonlyArray<{ readonly fichier: string; readonly raison: string }> = [
  {
    fichier: "src/components/public/pied-public.tsx",
    raison: "Le pied des pages publiques de la refonte : liens dessinés à 44 px par la maquette.",
  },
];

describe("les pieds dessinés à 44 px existent encore", () => {
  test("chaque déclaration désigne un pied balayé", () => {
    const morts = PIEDS_DESSINES_A_44.filter((p) => !CIBLES.some((c) => c.fichier === p.fichier)).map((p) => p.fichier);
    expect(morts).toEqual([]);
  });
});

describe("les cibles tactiles des pieds de page (suite)", () => {
  test("chaque cible d'un pied atteint les 44 points du brief §8", () => {
    const fautives = CIBLES_AUTONOMES_DES_PIEDS.filter(
      (c) => !c.classes.includes(CLASSE_MINIMALE),
    ).map((c) => c.libelle);
    expect(
      fautives,
      `Ces cibles n'imposent pas ${CLASSE_MINIMALE} (44 px). Le brief §8 exige 44 points ` +
        `en tactile ; mesuré le 09/09/2026, le produit en servait 15.`,
    ).toEqual([]);
  });

  test("chaque cible agrandie compense sa hauteur pour ne pas gonfler le pied", () => {
    const sansCompensation = CIBLES.filter(
      (c) =>
        c.classes.includes(CLASSE_MINIMALE) &&
        !CLASSE_COMPENSATION.test(c.classes) &&
        !PIEDS_DESSINES_A_44.some((p) => p.fichier === c.fichier),
    ).map((c) => c.libelle);
    expect(
      sansCompensation,
      "Ces cibles font 44 px SANS marge négative : le pied grandirait, et la planche " +
        "du canevas cesserait de décrire le rendu réel.",
    ).toEqual([]);
  });
});

/**
 * LES CIBLES AUTONOMES HORS DES PIEDS — UN INVENTAIRE DÉCLARÉ.
 *
 * ⚠️ POURQUOI UNE LISTE ICI, ALORS QUE LES PIEDS SONT BALAYÉS. Un balayage
 * suppose un critère mécanique, et il n'en existe aucun pour distinguer une
 * cible AUTONOME d'un lien EN FLUX DE TEXTE — la distinction qui décide si les
 * 44 points s'appliquent. WCAG 2.5.8 exempte nommément le second cas, et pour
 * une bonne raison : donner 44 px de haut au lien « conditions d'utilisation »
 * au milieu d'une phrase de consentement disloquerait le paragraphe.
 *
 * ⚠️ ET J'AI ESSAYÉ DE MÉCANISER LE CRITÈRE, IL S'EST TROMPÉ. La première
 * version demandait « le parent porte-t-il du texte hors du lien ? » en
 * comptant les ÉLÉMENTS frères : les trois liens du pied se déclaraient alors
 * inline les uns par les autres, et « Mot de passe oublié ? » l'était par le
 * `<label>` posé à côté. Le critère exemptait 22 cibles sur 25, dont celles
 * qu'on venait de corriger. Corrigé en ne comptant que les nœuds TEXTE
 * directs, il donne le bon classement — mais il vit dans une sonde de
 * navigateur, et les portes n'en ont pas.
 *
 * D'où une liste, avec la raison de chaque entrée, qui échoue DANS LES DEUX
 * SENS : une cible déclarée qui perd son plancher, et une déclaration qui ne
 * désigne plus rien.
 */
const AUTONOMES: ReadonlyArray<{
  readonly fichier: string;
  readonly repere: string;
  readonly raison: string;
}> = [
  {
    fichier: "src/components/public/entete-publique.tsx",
    repere: 'className="logo min-h-11"',
    raison:
      "Le logo de l'en-tête des pages publiques (landing comprise), refonte du " +
      "02/10/2026 : la classe `logo` pose 44 px, `min-h-11` les tient si l'image " +
      "ne se charge pas.",
  },
  {
    fichier: "src/components/acces/page-acces.tsx",
    repere: 'className="logo acces__logo min-h-11"',
    raison:
      "Le logo de la connexion et de l'inscription, porté sur la refonte le " +
      "02/10/2026 (il vivait dans chacune des deux pages). La classe `logo` de la " +
      "maquette pose déjà 44 px ; `min-h-11` les tient même si l'image ne se " +
      "charge pas et que le lien retombe à la hauteur de son texte.",
  },
  {
    fichier: "src/app/[locale]/mot-de-passe-oublie/page.tsx",
    repere: 'className="lien-texte lien-retour min-h-11"',
    raison:
      "« Revenir à la connexion » : SEUL dans son paragraphe, donc autonome et non un " +
      "lien en flux de texte (refonte du 02/10/2026, `.lien-retour` de la maquette).",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: 'className="art-retour min-h-11"',
    raison:
      "« Tous les articles », le retour en tête de l'article (refonte du 02/10/2026, " +
      "`.art-retour` de la maquette, qui pose déjà 44 px ; le plancher les tient).",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: 'className="bouton bouton--marque bouton--large min-h-11"',
    raison:
      "« Créer mon compte », l'appel de fin d'article (refonte du 02/10/2026) : le " +
      "plancher posé pour qu'une retouche de hauteur du bouton ne passe pas sous 44.",
  },
  {
    fichier: "src/components/page-legale.tsx",
    repere: 'className="lien-texte min-h-11"',
    raison:
      "« Signaler un contenu », l'encart des pages légales (refonte du 02/10/2026, " +
      "`.leg-encart` de la maquette qui le pose à 36 px) : 44 par son plancher.",
  },
  {
    fichier: "src/app/[locale]/nouveau-mot-de-passe/page.tsx",
    repere: 'className="lien-texte lien-retour min-h-11"',
    raison: "« Revenir à la connexion » sous le nouveau mot de passe (refonte du 02/10/2026, maquette).",
  },
  {
    fichier: "src/app/[locale]/tarifs/page.tsx",
    repere: 'className="bouton bouton--second bouton--large min-h-11"',
    raison: "« Créer un compte gratuit », la carte du plan gratuit (refonte du 02/10/2026).",
  },
  {
    fichier: "src/app/[locale]/tarifs/page.tsx",
    repere: 'className="bouton bouton--marque bouton--large min-h-11"',
    raison: "« Commencer avec Pro », la seule action en dégradé de Tarifs (refonte du 02/10/2026).",
  },
  {
    fichier: "src/app/[locale]/docs/page.tsx",
    repere: 'className="bouton bouton--marque bouton--large min-h-11"',
    raison: "« Créer mon compte », l'appel final de la documentation (refonte du 02/10/2026).",
  },
  {
    fichier: "src/components/formulaire-connexion.tsx",
    repere: 'className="lien-texte min-h-11"',
    raison:
      "« Mot de passe oublié ? », sur la ligne du libellé. Depuis la refonte du " +
      "02/10/2026, ses 44 px viennent d'un `inline-flex` compensé par une marge " +
      "de −12 px (`.champ-acces__ligne .lien-texte`, maquette) : la ligne du " +
      "libellé est en `align-items: baseline`, et la marge ramène la boîte sans " +
      "déplacer la ligne.",
  },
];

/** `min-h-11` pour une cible dans le flux, `after:h-11` pour un pseudo-élément. */
const PLANCHERS = ["min-h-11", "after:h-11"];

describe("les cibles tactiles autonomes hors des pieds", () => {
  test("chaque cible declaree existe encore, et porte son plancher de 44 px", () => {
    const introuvables: string[] = [];
    const sansPlancher: string[] = [];

    for (const cible of AUTONOMES) {
      const code = codeSeul(readFileSync(join(process.cwd(), cible.fichier), "utf8"));
      // La classe complète qui contient le repère : on lit la vraie déclaration,
      // pas le voisinage.
      const debut = code.indexOf(cible.repere);
      if (debut === -1) {
        introuvables.push(`${cible.fichier} — repère « ${cible.repere} » introuvable`);
        continue;
      }
      const ouverture = code.lastIndexOf('className="', debut);
      const fermeture = code.indexOf('"', ouverture + 'className="'.length);
      const classes = ouverture === -1 ? "" : code.slice(ouverture, fermeture);
      if (!PLANCHERS.some((p) => classes.includes(p))) {
        sansPlancher.push(`${cible.fichier} — ${cible.raison.slice(0, 60)}`);
      }
    }

    expect(
      introuvables,
      "Ces déclarations ne désignent plus rien : la cible a été renommée, déplacée " +
        "ou supprimée. Une liste qui ne pointe nulle part ne garde rien.",
    ).toEqual([]);
    expect(
      sansPlancher,
      `Ces cibles autonomes n'imposent aucun plancher (${PLANCHERS.join(" ou ")}). ` +
        "Le brief §8 exige 44 points en tactile.",
    ).toEqual([]);
  });

  test("CONTRE-TEST : l'inventaire declare porte reellement des entrees", () => {
    expect(AUTONOMES.length, "inventaire vide : le contrôle ne garderait rien").toBeGreaterThanOrEqual(10);
    const fichiers = [...new Set(AUTONOMES.map((c) => c.fichier))];
    expect(fichiers.length).toBeGreaterThanOrEqual(6);
  });
});

/**
 * LES CIBLES DES SURFACES AUTHENTIFIÉES — RELEVÉES LE 10/09/2026.
 *
 * ⚠️ ELLES N'AVAIENT JAMAIS ÉTÉ MESURÉES. La passe du 09/09 a porté les 22
 * cibles des surfaces PUBLIQUES à 44 px et s'est arrêtée là. Or ce sont les
 * écrans authentifiés qui portent les actions : commandes, éditeur, envois,
 * analyses, marque, et les six écrans d'administration.
 *
 * Relevé au navigateur piloté, à 390 px, sur un build de production servi
 * contre la base de tests, avec une vraie session — 192 cibles inventoriées sur
 * 14 écrans. CINQ contrôles manquaient les 44 points :
 *
 *   le lien « Aller au contenu » des deux racines       80 × 32 (focalisé)
 *   le bouton « Rechercher » de la recherche admin      80 × 34 (focalisé)
 *   l'interrupteur de filigrane de « Ma marque »        46 × 27
 *   les trois champs nombre des paramètres système     120 × 42
 *   le retour « à la liste des comptes »                40 × 40
 *
 * ⚠️ ET IL A FALLU DEUX CAMPAGNES, PARCE QUE LA PREMIÈRE MESURAIT LE MAUVAIS
 * APPAREIL. `Emulation.setDeviceMetricsOverride({mobile: true})` change la mise
 * en page, PAS la nature du pointeur : `@media (pointer: coarse)` ne
 * s'appliquait donc pas, et `globals.css` y pose justement un plancher de 44 px
 * sur `button`, `a[role=button]`, `[role=tab]`, `input[type=checkbox]` et
 * `input[type=radio]`. La première campagne a compté HUIT défauts en mesurant
 * un rendu à la souris ; trois d'entre eux — les deux interrupteurs des
 * paramètres, qui sont des `<button>`, et la case de révocation, qui est une
 * `input[type=checkbox]` — sont déjà protégés et n'ont PAS été touchés.
 * `setTouchEmulationEnabled` rend `matchMedia("(pointer: coarse)")` vrai, et
 * c'est cette mesure-là qui fait foi.
 *
 * ⚠️ CE QUI RESTE EST EXACTEMENT CE QUE LA RÈGLE GLOBALE NE COUVRE PAS : un
 * `<a>` sans `role="button"`, un `<label>` qui porte le dessin d'un
 * interrupteur, un `input[type=number]`, et tout ce qui porte `sr-only`.
 *
 * ⚠️ CE QUE CE CONTRÔLE PROUVE, ET CE QU'IL NE PROUVE PAS. Comme celui des
 * pieds, il garde le MOYEN — la classe qui produit les 44 px — et pas la
 * géométrie : les portes n'ont pas de navigateur. Le lien moyen → effet a été
 * établi une fois, par la mesure ci-dessus. Ce qu'il attrape réellement : un
 * plancher retiré d'un de ces huit contrôles.
 *
 * ⚠️ DEUX EXCEPTIONS DÉCLARÉES, mesurées et écartées volontairement :
 *   - `formulaire-marque.tsx` porte un `<input type="file">` visuellement caché
 *     DANS la zone de dépôt (un `<label>` de 148 px) : c'est la zone qu'on
 *     touche, jamais l'input.
 *   - le `<input type="color">` du même écran est en `sr-only` DANS un
 *     `<label>` de 46 × 46 qui est la pastille de couleur. C'est le label que
 *     l'on touche.
 */
const AUTHENTIFIEES: ReadonlyArray<{
  readonly fichier: string;
  readonly repere: string;
  readonly plancher: string;
  readonly raison: string;
}> = [
  {
    /*
     * ⚠️ DÉPLACÉ LE 02/10/2026 PAR LA REFONTE : le lien de l'espace vendeur
     * porte désormais la classe `evitement` de la maquette, et son plancher vit
     * dans la feuille de la refonte, pas dans des utilitaires. La garde suit le
     * plancher là où il est écrit ; `codeSeul` retire aussi les commentaires CSS.
     */
    fichier: "src/styles/refonte/app.css",
    repere: ".evitement {",
    plancher: "min-height: 44px",
    raison:
      "« Aller au contenu » de l'espace vendeur. Positionné en absolu une fois " +
      "focalisé : l'agrandir ne déplace aucun pixel du flux.",
  },
  {
    // La refonte (02/10/2026) dessine l'interrupteur dans sa feuille : la cible
    // y est portée à 44 px de haut au toucher.
    fichier: "src/styles/refonte/app.css",
    repere: ".interrupteur { width: 52px",
    plancher: "height: 44px",
    raison:
      "L'interrupteur de filigrane de « Ma marque ». ⚠️ C'est un <label>, et " +
      "c'est pour cela qu'il échappe au plancher de `globals.css`, qui ne vise " +
      "que button, a[role=button], [role=tab] et les cases. Le contrôle DESSINÉ " +
      "fait 46 × 27 : l'agrandir changerait le dessin de la planche, donc la " +
      "zone passe par un pseudo-élément transparent. Les deux interrupteurs des " +
      "paramètres système, eux, sont des <button> et n'ont RIEN eu à changer.",
  },
  {
    fichier: "src/styles/refonte/app.css",
    repere: ".adm-reglage__saisie input, .adm-filtres a, .adm-champ input {",
    plancher: "height: 44px",
    raison:
      "Les champs nombre des paramètres système (36 px au bureau) et les pastilles de " +
      "filtre de l'administration (30 px), portés à 44 au toucher par la feuille de la refonte.",
  },
  {
    fichier: "src/styles/refonte/app.css",
    repere: ".puce, .adm-danger, .adm-confirmer, .adm-pastille-contest, .adm-lien {",
    plancher: "min-height: 44px",
    raison:
      "Les boutons des dialogues d'administration (confirmer, danger), la pastille " +
      "« Contestation » et les liens « Tout le journal » — 24 à 36 px au bureau.",
  },
];

describe("les cibles tactiles des surfaces authentifiees", () => {
  test("chaque cible relevee le 10/09 porte encore son plancher de 44 px", () => {
    const introuvables: string[] = [];
    const sansPlancher: string[] = [];

    for (const cible of AUTHENTIFIEES) {
      const code = codeSeul(readFileSync(join(process.cwd(), cible.fichier), "utf8"));
      const debut = code.indexOf(cible.repere);
      if (debut === -1) {
        introuvables.push(`${cible.fichier} — repère « ${cible.repere} » introuvable`);
        continue;
      }
      /*
       * ⚠️ UNE FENÊTRE, ET PAS L'ATTRIBUT ENTIER. Deux de ces classes sont
       * BÂTIES PAR CONCATÉNATION (`className={"…" + (actif ? … : …)}`) : y
       * chercher l'ouverture `className="` ne trouverait rien, et le contrôle
       * se déclarerait vert en n'ayant rien lu. La fenêtre est volontairement
       * courte — le plancher est toujours écrit dans la même classe que son
       * repère, jamais chez un voisin.
       */
      const fenetre = code.slice(Math.max(0, debut - 200), debut + 400);
      if (!fenetre.includes(cible.plancher)) {
        sansPlancher.push(`${cible.fichier} — ${cible.raison.slice(0, 64)}`);
      }
    }

    expect(
      introuvables,
      "Ces déclarations ne désignent plus rien : la cible a été renommée, déplacée " +
        "ou supprimée. Une liste qui ne pointe nulle part ne garde rien.",
    ).toEqual([]);
    expect(
      sansPlancher,
      "Ces cibles des surfaces authentifiées n'imposent plus leur plancher de 44 px. " +
        "Le brief §8 exige 44 points en tactile ; mesuré le 10/09/2026 avec " +
        "`pointer: coarse` réellement émulé, cinq contrôles allaient de 27 à 42 px.",
    ).toEqual([]);
  });

  test("CONTRE-TEST : l'inventaire authentifie porte reellement des entrees", () => {
    expect(
      AUTHENTIFIEES.length,
      "inventaire vide : le contrôle ne garderait rien",
    ).toBeGreaterThanOrEqual(4);
    const fichiers = [...new Set(AUTHENTIFIEES.map((c) => c.fichier))];
    // Cinq et non plus six : la refonte (02/10/2026) a déplacé l'interrupteur de
    // « Ma marque » dans la feuille où vivait déjà le lien d'évitement. Les
    // entrées, elles, restent toutes là (test précédent).
    // UN SEUL FICHIER depuis le portage de l'administration (02/10/2026) : chaque plancher
    // relevé le 10/09 vit désormais dans la feuille de la refonte, à côté de la règle qui
    // dessine sa cible — les utilitaires `min-h-11` des composants sont partis avec eux.
    expect(fichiers, "le relevé ne lit plus la feuille de la refonte").toContain("src/styles/refonte/app.css");
  });

  /**
   * ⚠️ L'EXCEPTION `sr-only` DU PLANCHER GLOBAL DOIT COUVRIR LES CASES, ET ELLE
   * NE LES COUVRAIT PAS.
   *
   * `globals.css` impose 44 px sous `pointer: coarse` puis exempte `.sr-only` —
   * sans quoi tout contrôle visuellement masqué devient une zone cliquable
   * invisible. Mais `.sr-only` pèse (0,1,0) et `input[type="checkbox"]` pèse
   * (0,1,1) : l'exception PERDAIT. Mesuré le 10/09/2026 sur « Ma marque », la
   * case du filigrane rendait une boîte de 44 × 44 au lieu de 1 × 1.
   *
   * C'est un défaut qui ne se voit pas — une zone cliquable transparente — et
   * qu'aucune relecture ne signale, puisque la règle et son exception sont
   * toutes deux écrites et toutes deux correctes prises séparément.
   */
  test("l exception sr-only du plancher global couvre AUSSI les cases et les radios", () => {
    /*
     * ⚠️ COMMENTAIRES RETIRÉS — L-031, ET IL M'A REPRIS ICI MÊME. Le
     * commentaire qui explique la règle, juste au-dessus d'elle, CITE
     * `input[type="checkbox"].sr-only`. Sans ce nettoyage, retirer le sélecteur
     * laissait le contrôle VERT : il gardait sa propre description. Constaté en
     * falsifiant, pas en relisant.
     */
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      " ",
    );
    const bloc = /@media \(pointer: coarse\)[\s\S]*?\n  \}/.exec(css)?.[0] ?? "";
    expect(bloc.length, "le bloc `pointer: coarse` est introuvable : ce contrôle n'inspecte rien").toBeGreaterThan(200);
    for (const forme of ['input[type="checkbox"].sr-only', 'input[type="radio"].sr-only']) {
      expect(
        bloc.includes(forme),
        `L'exception ne porte pas « ${forme} ». Sans elle, la spécificité de ` +
          "`input[type=...]` l'emporte sur `.sr-only` et chaque case masquée " +
          "devient une cible invisible de 44 px.",
      ).toBe(true);
    }
  });

  /**
   * ⚠️ UNE CASE ENVELOPPÉE DE SON LIBELLÉ SE DESSINAIT EN CARRÉ DE 44 PX.
   *
   * Vu le 18/09/2026 en capture, la planche téléphone à côté : Chrome agrandit
   * la case elle-même quand le plancher lui impose une hauteur. Toucher le
   * libellé coche la case, donc c'est le LIBELLÉ qui porte les 44 px, et la
   * case garde sa taille. Aucune soustraction ne pouvait le voir — une case
   * n'a pas de texte — d'où ce contrôle, dans les deux moitiés : la case
   * rendue à sa taille ET le plancher reporté sur le libellé. Une seule des
   * deux ferait soit le carré, soit une cible sous 44.
   */
  test("une case enveloppée de son libellé garde sa taille, et le libellé prend les 44 px", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      " ",
    );
    const bloc = /@media \(pointer: coarse\)[\s\S]*?\n  \}/.exec(css)?.[0] ?? "";
    expect(bloc.length, "le bloc `pointer: coarse` est introuvable : ce contrôle n'inspecte rien").toBeGreaterThan(200);

    const regle = (selecteur: string): string =>
      new RegExp(selecteur.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^{]*\\{([^}]*)\\}").exec(bloc)?.[1] ?? "";

    for (const type of ["checkbox", "radio"]) {
      expect(
        regle(`label > input[type="${type}"]:not(.sr-only)`),
        `La case « ${type} » enveloppée de son libellé n'est plus exemptée : elle se dessine en carré de 44 px.`,
      ).toMatch(/min-height:\s*0/);
      expect(
        regle(`label:has(> input[type="${type}"]:not(.sr-only))`),
        `Le libellé d'une case « ${type} » ne porte plus les 44 px : la cible tactile tombe à la hauteur du texte.`,
      ).toMatch(/min-height:\s*44px/);
    }
  });

  /**
   * ⚠️ LA SONDE QUI A PRODUIT CES CHIFFRES DOIT SURVIVRE, ET ELLE A FAILLI NE
   * PAS SURVIVRE.
   *
   * La mémoire du projet affirmait « la sonde CDP existe et se réutilise telle
   * quelle ». Vérifié le 10/09/2026 : elle vivait dans un dossier TEMPORAIRE de
   * session et dans `out/`, qui est ignoré par git. Elle allait disparaître avec
   * la session, en laissant l'affirmation derrière elle — L-014 dans sa forme
   * exacte, un document qui affirme un état que personne n'a vérifié.
   *
   * Elle est donc dans `scripts/`, et ce contrôle rend l'affirmation
   * VÉRIFIABLE. Il garde aussi la leçon la plus chère de la journée : sans
   * `setTouchEmulationEnabled`, `@media (pointer: coarse)` ne s'applique pas, et
   * la sonde mesure un rendu À LA SOURIS en croyant tenir le téléphone — trois
   * défauts comptés qui n'existaient pas.
   */
  test("la sonde de mesure existe encore, et elle EMULE bien le tactile", () => {
    const sonde = readFileSync(
      join(process.cwd(), "scripts/mesurer-cibles-tactiles.mjs"),
      "utf8",
    );
    expect(sonde.length, "la sonde a disparu de `scripts/`").toBeGreaterThan(2000);
    expect(
      /setTouchEmulationEnabled/.test(sonde),
      "La sonde n'émule plus le tactile : `@media (pointer: coarse)` ne " +
        "s'appliquerait pas, et elle mesurerait un rendu à la souris en croyant " +
        "tenir le téléphone. C'est l'erreur qui a fait compter trois défauts " +
        "inexistants le 10/09/2026.",
    ).toBe(true);
    expect(
      /pointer: coarse/.test(sonde),
      "La sonde ne vérifie plus que `matchMedia(\"(pointer: coarse)\")` est " +
        "vrai : elle ne pourrait plus dire quel appareil elle décrit.",
    ).toBe(true);
    expect(
      /scrollIntoView/.test(sonde),
      "La sonde ne fait plus défiler ses cibles au centre : tout ce qui est " +
        "sous la ligne de flottaison sortirait du cadre et se déclarerait " +
        "« recouvert » — 67 contrôles parfaitement bons signalés à tort.",
    ).toBe(true);
  });

  /**
   * ⚠️ SANS CE CONTRÔLE, LE PRÉCÉDENT PASSE SUR UNE FENÊTRE VIDE. Si
   * `codeSeul` cessait de rendre du texte — extension changée, fichier
   * déplacé —, `indexOf` rendrait -1 partout et la première assertion
   * signalerait « introuvable », ce qui est le bon comportement. Mais si la
   * fenêtre était trop LARGE, le plancher d'un voisin suffirait. On vérifie
   * donc qu'elle reste petite devant le fichier qu'elle découpe.
   */
  test("CONTRE-TEST : la fenetre de lecture reste plus petite que les fichiers", () => {
    for (const cible of AUTHENTIFIEES) {
      const code = codeSeul(readFileSync(join(process.cwd(), cible.fichier), "utf8"));
      expect(code.length, `${cible.fichier} est plus court que la fenêtre de lecture`).toBeGreaterThan(600);
    }
  });
});
