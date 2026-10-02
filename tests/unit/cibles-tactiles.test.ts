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

/** Les cibles d'un pied qui ne sont PAS exemptées comme liens de prose. */
const CIBLES_AUTONOMES_DES_PIEDS = CIBLES.filter(
  (c) => !EN_FLUX.some((e) => c.fichier === e.fichier && c.balise.includes(e.repere)),
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
    fichier: "src/components/coque-publique.tsx",
    repere: 'className="inline-flex min-h-11 items-center md:min-h-0"',
    raison:
      "Le logo d'en-tête du signalement et du blog, porté sur le design system le " +
      "14/09/2026 : une IMAGE de 30 px, portée à 44 par son plancher au téléphone.",
  },
  {
    fichier: "src/app/[locale]/connexion/page.tsx",
    repere: "LogoMarque hauteur={44}",
    raison:
      "Le logo d'en-tête de la connexion, migré le 11/09/2026. Ce n'est plus " +
      "du texte agrandi par un plancher mais une IMAGE de 44 px de haut : la " +
      "cible vient de sa hauteur propre, donc `min-h-11` n'a plus rien à y " +
      "imposer. Mesuré à 390 px, tactile émulé.",
  },
  {
    fichier: "src/app/[locale]/inscription/page.tsx",
    repere: "LogoMarque hauteur={52}",
    raison:
      "Le logo de l'inscription, migré le 11/09/2026. Ce n'est plus du texte " +
      "agrandi par un plancher mais une IMAGE de 52 px : la cible vient de sa " +
      "hauteur propre. `min-h-11` reste posé quand même — si l'image ne se " +
      "charge pas, le lien s'effondrerait à la hauteur de son texte alternatif " +
      "et la cible disparaîtrait avec elle.",
  },
  {
    fichier: "src/components/acces/coque-acces-simple.tsx",
    repere: 'className="inline-flex min-h-11 items-center"',
    raison:
      "Le logo d'en-tête du mot de passe oublié et du nouveau mot de passe : une " +
      "IMAGE de 44 px au téléphone, et `min-h-11` reste posé si elle ne se charge pas.",
  },
  {
    fichier: "src/app/[locale]/mot-de-passe-oublie/page.tsx",
    repere: "font-bold text-ds-texte-lien hover:underline lg:my-0 lg:min-h-0",
    raison:
      "« Revenir à la connexion » : SEUL dans son paragraphe, donc autonome et " +
      "non un lien en flux de texte. Porté sur le design system le 14/09/2026 ; " +
      "le logo d'en-tête, lui, vit désormais dans la coque partagée.",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: "gap-2 text-[14px] font-semibold text-ds-texte-corps",
    raison:
      "« Le blog », le retour en tête de l'article. Les actions d'en-tête propres " +
      "à chaque page (« Découvrir DropLink », « Le blog ») ont disparu le 14/09/2026 " +
      "avec la coque de l'ancien canevas : l'en-tête est désormais partagé.",
  },
  {
    fichier: "src/components/coque-publique.tsx",
    repere: "text-[14.5px] font-medium text-ds-texte-corps",
    raison:
      "« Documentation » et « Accueil », l'en-tête partagé du signalement et du " +
      "blog : 44 px au téléphone, la hauteur du texte au bureau, comme au kit.",
  },
  {
    fichier: "src/app/[locale]/blog/[slug]/page.tsx",
    repere: "degrade-ds-marque inline-flex h-[52px]",
    raison:
      "« Créer ma première commande », l'appel de fin d'article : 52 px dessinés, " +
      "et le plancher posé quand même pour qu'une retouche de hauteur ne passe pas sous 44.",
  },
  {
    fichier: "src/components/page-legale.tsx",
    repere: "text-[13.5px] font-semibold text-ds-texte-lien",
    raison:
      "« Signaler un contenu », l'encart des pages légales, porté sur le kit " +
      "`legal` le 13/09/2026. 18 px de texte, 44 par son plancher.",
  },
  {
    fichier: "src/components/formulaire-connexion.tsx",
    repere: "text-ds-texte-lien underline after:absolute",
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
 *   - `formulaire-marque.tsx` porte un `<input type="file">` en `sr-only`,
 *     déclenché par un bouton visible qui, lui, dépasse 44 px. L'input n'est
 *     jamais visé par un doigt.
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
    fichier: "src/app/[locale]/admin/layout.tsx",
    repere: "focus:not-sr-only focus:absolute focus:top-4",
    plancher: "focus:min-h-11",
    raison: "« Aller au contenu » de l'administration.",
  },
  {
    fichier: "src/components/admin/recherche-admin.tsx",
    repere: "focus:not-sr-only focus:absolute focus:top-full",
    plancher: "focus:min-h-11",
    raison:
      "Le bouton « Rechercher », révélé au clavier sur les écrans Comptes et " +
      "Boutiques. 34 px mesurés une fois focalisé.",
  },
  {
    fichier: "src/app/[locale]/admin/comptes/[id]/page.tsx",
    repere: "flex h-11 w-11 shrink-0",
    plancher: "before:-inset-[3px]",
    raison:
      "Le retour vers la liste des comptes. Il faisait 40 × 40 et gagnait ses " +
      "44 px par un pseudo-élément transparent ; la migration du 12/09 l'a porté " +
      "à 44 pour de bon — le kit dessine ses boutons d'action à 48. Le " +
      "pseudo-élément reste : il donne 50 de zone au doigt là où le bouton en " +
      "montre 44, et c'est gratuit.",
  },
  {
    fichier: "src/components/marque/formulaire-marque.tsx",
    repere: "inline-flex h-[27px] w-[46px]",
    plancher: "before:h-11",
    raison:
      "L'interrupteur de filigrane de « Ma marque ». ⚠️ C'est un <label>, et " +
      "c'est pour cela qu'il échappe au plancher de `globals.css`, qui ne vise " +
      "que button, a[role=button], [role=tab] et les cases. Le contrôle DESSINÉ " +
      "fait 46 × 27 : l'agrandir changerait le dessin de la planche, donc la " +
      "zone passe par un pseudo-élément transparent. Les deux interrupteurs des " +
      "paramètres système, eux, sont des <button> et n'ont RIEN eu à changer.",
  },
  {
    fichier: "src/components/admin/reglage-nombre.tsx",
    repere: "w-[120px] rounded-ds-control",
    plancher: "min-h-11",
    raison:
      "Les trois champs nombre des paramètres système, mesurés à 42 px. Le " +
      "plancher est levé à partir de `md`, où la planche AdminParametres — qui " +
      "n'a PAS de variante téléphone — redevient la référence.",
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
    ).toBeGreaterThanOrEqual(6);
    const fichiers = [...new Set(AUTHENTIFIEES.map((c) => c.fichier))];
    expect(fichiers.length, "un seul fichier gardé : le relevé en couvrait six").toBeGreaterThanOrEqual(6);
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
