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
 * `components/coque-publique.tsx` (conditions, confidentialité, signalement,
 * blog, connexion, inscription…) et `app/p/[token]/page.tsx` (la page client).
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
const OUVERTURE_CIBLE = /<(?:Link|a|button)\b/g;

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
  const litteral = /className="([^"]*)"/.exec(balise);
  if (litteral?.[1] !== undefined) return litteral[1];
  const reference = /className=\{([A-Za-z_$][\w$]*)\}/.exec(balise);
  if (reference?.[1] === undefined) return "";
  // Recherche littérale plutôt qu'une expression construite : le nom peut
  // contenir un `$`, qui devrait alors être échappé — et une expression bâtie
  // par concaténation est précisément ce qui se casse en silence.
  const marque = "const " + reference[1];
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

  test("chaque cible d'un pied atteint les 44 points du brief §8", () => {
    const fautives = CIBLES.filter((c) => !c.classes.includes(CLASSE_MINIMALE)).map(
      (c) => c.libelle,
    );
    expect(
      fautives,
      `Ces cibles n'imposent pas ${CLASSE_MINIMALE} (44 px). Le brief §8 exige 44 points ` +
        `en tactile ; mesuré le 09/09/2026, le produit en servait 15.`,
    ).toEqual([]);
  });

  test("chaque cible agrandie compense sa hauteur pour ne pas gonfler le pied", () => {
    const sansCompensation = CIBLES.filter(
      (c) => c.classes.includes(CLASSE_MINIMALE) && !CLASSE_COMPENSATION.test(c.classes),
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
 * посреди d'une phrase de consentement disloquerait le paragraphe.
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
    fichier: "src/components/coque-publique.tsx",
    repere: "text-[17px] leading-[22px] font-extrabold",
    raison: "Le logo d'en-tête : seul dans sa barre, il ramène à l'accueil. 22 px mesurés.",
  },
  {
    fichier: "src/app/[locale]/connexion/page.tsx",
    repere: "text-[17px] leading-[22px] font-extrabold",
    raison: "Le logo d'en-tête de la connexion.",
  },
  {
    fichier: "src/app/[locale]/inscription/page.tsx",
    repere: "text-[17px] leading-[22px] font-extrabold",
    raison:
      "Le logo d'en-tête de l'inscription. Il porte sa propre marge basse : la " +
      "compensation y est asymétrique (-11 en haut, 26-11 en bas) pour ne pas l'écraser.",
  },
  {
    fichier: "src/app/[locale]/mot-de-passe-oublie/page.tsx",
    repere: "text-[17px] leading-[22px] font-extrabold",
    raison: "Le logo d'en-tête de la réinitialisation.",
  },
  {
    fichier: "src/app/[locale]/mot-de-passe-oublie/page.tsx",
    repere: "font-semibold text-violet hover:underline",
    raison:
      "« Revenir à la connexion » : SEUL dans son paragraphe, donc autonome et " +
      "non un lien en flux de texte. Interligne hérité du <p>, 22 px.",
  },
  {
    fichier: "src/app/[locale]/blog/page.tsx",
    repere: "font-semibold text-ardoise transition-colors hover:text-on-surface",
    raison: "« Découvrir DropLink », l'action d'en-tête de l'index du blog.",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: "font-semibold text-ardoise transition-colors hover:text-on-surface",
    raison: "« Le blog », l'action d'en-tête d'un article.",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: "font-semibold text-sourdine transition-colors hover:text-violet",
    raison: "« ← Le blog », le retour en tête du corps de l'article.",
  },
  {
    fichier: "src/components/page-legale.tsx",
    repere: "font-bold text-violet",
    raison: "« Signaler un contenu », l'encart des pages légales. 18 px mesurés.",
  },
  {
    fichier: "src/components/formulaire-connexion.tsx",
    repere: "font-semibold text-violet after:absolute",
    raison:
      "« Mot de passe oublié ? ». ⚠️ SEULE CIBLE POSÉE PAR UN PSEUDO-ÉLÉMENT, et " +
      "ce n'est pas un caprice : son parent est en `items-baseline`, et un " +
      "`inline-flex` de 44 px y porte sa baseline au centre de sa boîte — le lien " +
      "descendait de 55 px et entraînait la page. Le pseudo-élément agrandit ce " +
      "que le doigt touche sans exister dans le flux. Prouvé au navigateur par " +
      "`elementFromPoint` : à 20 px au-dessus et en dessous c'est le lien qui " +
      "répond, à 40 px c'est l'input.",
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
