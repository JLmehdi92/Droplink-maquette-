import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LE RAYON DE LA CARTE-PAGE A DEUX VALEURS, ET LA SURFACE LES DÉPARTAGE.
 *
 * ⚠️ DÉFAUT MESURÉ LE 27/08/2026 en relevant les 41 planches du canevas :
 * 15 disent 24, 6 disent 28, et la coupure sépare exactement le PUBLIC de
 * l'AUTHENTIFIÉ. Le code rendait 28 partout — non par accident, mais parce
 * qu'il suivait la prose de CLAUDE.md, qui annonçait une valeur unique. C'est
 * le motif L-014 dans sa forme la plus coûteuse : un document assez précis
 * pour être cru, et le code écrit d'après lui plutôt que d'après la source.
 *
 * CE QUE CE TEST ÉPROUVE : l'APPARIEMENT, sur un inventaire DÉRIVÉ du disque.
 * Une liste écrite à la main ne verrait jamais la septième carte-page, celle
 * qu'on ajoutera dans six mois — et c'est précisément celle qui reprendrait
 * l'ancienne valeur.
 *
 * CE QU'IL N'ÉPROUVE PAS : que la classe produise réellement un rayon. Un
 * token Tailwind v4 posé hors de `@theme` ne produit AUCUNE classe, et le coin
 * devient carré sans une erreur nulle part — le même piège que `--color-admin`.
 * Cet effet-là ne se lit pas dans la source : il se lit dans le CSS SERVI, et
 * c'est `pnpm fumee` qui l'interroge.
 */

const RACINE = join(process.cwd(), "src", "app");

/** Les deux classes, et la valeur que la planche leur assigne. */
const RAYON_AUTHENTIFIE = "md:rounded-page";
const RAYON_PUBLIC = "md:rounded-page-publique";

type CartePage = { fichier: string; authentifiee: boolean; classe: string | null };

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiersTsx(chemin);
    return e.isFile() && e.name.endsWith(".tsx") ? [chemin] : [];
  });
}

/**
 * Une carte-page se reconnaît à sa GÉOMÉTRIE, pas à son nom de fichier : c'est
 * le conteneur centré à largeur bornée qui porte le fond blanc de la page. Les
 * six poses actuelles partagent ces trois marqueurs ; les cartes internes n'en
 * portent aucun.
 */
function cartesPage(): CartePage[] {
  const trouvees: CartePage[] = [];
  for (const fichier of fichiersTsx(RACINE)) {
    const source = readFileSync(fichier, "utf8");
    for (const ligne of source.split("\n")) {
      if (!ligne.includes("mx-auto") || !ligne.includes("w-full") || !ligne.includes("max-w-[")) {
        continue;
      }
      // Les crochets sont DANS le motif : un rayon arbitraire — `md:rounded-[24px]`,
      // la bonne valeur ecrite en dur — doit entrer dans l'inventaire pour y etre
      // JUGE. Sans eux il en sortait, et l'ecart n'etait plus signale que par le
      // compteur : la garde regardait a cote du defaut.
      const rayon = /md:rounded-(?:\[[^\]]+\]|[\w-]+)/.exec(ligne);
      if (rayon === null) continue;
      const relatif = relative(RACINE, fichier).split(sep).join("/");
      trouvees.push({
        fichier: relatif,
        // Le segment fait foi : `(app)` et `admin` sont les deux surfaces
        // derrière session. Tout le reste est servi à qui n'a pas de compte.
        authentifiee: relatif.startsWith("[locale]/(app)/") || relatif.startsWith("[locale]/admin/"),
        classe: rayon[0],
      });
    }
  }
  return trouvees;
}

describe("Le rayon de la carte-page", () => {
  const inventaire = cartesPage();

  /**
   * UN ENSEMBLE VIDE PASSE TOUT. Avant d'affirmer que chaque carte-page porte
   * le bon rayon, il faut établir qu'on en a trouvé — sinon un renommage de
   * dossier rendrait cette suite verte et muette.
   */
  test("la sonde inspecte réellement des cartes-pages", () => {
    /*
     * ⚠️ CE PLANCHER DESCEND AVEC LA MIGRATION, ET C'EST VOULU. Le design
     * system abolit la carte-page : plus de cadre extérieur, plus de rayon 24
     * contre 28. Chaque écran migré en retire une, et ce nombre finira à ZÉRO —
     * jour où cette suite entière devra être supprimée, pas assouplie.
     *
     * Il restait 6 cartes-pages le 11/09/2026, puis 5 ; l'administration a perdu
     * la sienne le 12/09, la LANDING dans la foulée, et il n'en reste QUE
     * TROIS. Le plancher descend donc à 3.
     *
     * ⚠️ ET CES TROIS-LÀ NE DESCENDRONT PAS TOUTES SEULES : ce sont exactement
     * les écrans que le design system NE DESSINE PAS — `/bienvenue`,
     * `/mot-de-passe-oublie`, `/nouveau-mot-de-passe` —, et `CLAUDE.md` dit
     * qu'ils gardent leur habillage actuel jusqu'à ce qu'ils soient dessinés.
     * Le jour où ils le seront, cette suite n'aura plus d'objet et devra être
     * SUPPRIMÉE, pas assouplie.
     */
    expect(
      inventaire.length,
      "moins de trois cartes-pages : soit la migration est plus avancée que ce " +
        "que cette suite déclare, soit le balayage est cassé. Les deux se " +
        "corrigent ICI, jamais en baissant le nombre.",
    ).toBeGreaterThanOrEqual(3);
  });

  /**
   * ⚠️ CE CONTRÔLE EXIGEAIT « DEUX FAMILLES », ET LA MIGRATION LE REND FAUX.
   *
   * Sa raison d'origine tient toujours : une suite qui ne verrait que des
   * surfaces publiques passerait à 100 % pendant que tout l'espace vendeur
   * rendrait la mauvaise valeur. Mais l'espace vendeur a PERDU sa carte-page le
   * 11/09/2026, et l'ADMINISTRATION la sienne le 12/09 : il n'en reste AUCUNE
   * derrière session.
   *
   * ⚠️ LA LISTE VIDE N'EST PAS UN AFFAIBLISSEMENT, ET C'EST TOUT L'INTÉRÊT DE
   * L'AVOIR ÉCRITE COMME UNE LISTE : elle échoue toujours DANS LES DEUX SENS.
   * Une carte-page authentifiée qui reparaîtrait — un écran repris à l'ancien
   * canevas, un composant recopié — ferait rougir ce contrôle sans que
   * personne ait à y penser. C'est la seule chose qui reste à garder du côté
   * authentifié, et c'est la bonne.
   *
   * Le jour où les QUATRE surfaces publiques perdront la leur, cette suite
   * n'aura plus d'objet et devra être SUPPRIMÉE, pas assouplie.
   */
  const AUTHENTIFIEES_RESTANTES: ReadonlyArray<readonly [string, string]> = [];

  /**
   * LES TROIS CARTES-PAGES PUBLIQUES QUI RESTENT, et la raison est la même pour
   * les trois : `CLAUDE.md` range ces écrans parmi ceux que le design system NE
   * DESSINE PAS, et dit qu'ils gardent leur habillage actuel jusqu'à ce qu'ils
   * soient dessinés. Ce ne sont pas des oublis de migration.
   */
  const PUBLIQUES_RESTANTES: ReadonlyArray<readonly [string, string]> = [
    ["[locale]/bienvenue/page.tsx", "L'onboarding — non dessiné par le design system."],
    [
      "[locale]/mot-de-passe-oublie/page.tsx",
      "La demande de réinitialisation — non dessinée par le design system.",
    ],
    [
      "[locale]/nouveau-mot-de-passe/page.tsx",
      "La saisie du nouveau mot de passe — non dessinée par le design system.",
    ],
  ];

  test("les cartes-pages authentifiées restantes sont exactement celles déclarées", () => {
    const trouvees = inventaire.filter((c) => c.authentifiee).map((c) => c.fichier).sort();
    const declarees = AUTHENTIFIEES_RESTANTES.map(([f]) => f).sort();
    expect(
      trouvees,
      "La liste des cartes-pages authentifiées ne décrit plus le dépôt. Un écran " +
        "migré retire sa ligne ; un écran qui en ajoute une doit la déclarer avec " +
        "sa raison.",
    ).toEqual(declarees);

    /*
     * ⚠️ LES PUBLIQUES SONT DÉCLARÉES NOMMÉMENT, PLUS COMPTÉES. Un plancher
     * « au moins quatre » disait combien il en restait, jamais LESQUELLES : la
     * landing a perdu la sienne le 12/09, et un simple décompte n'aurait pas
     * distingué cette migration voulue d'un balayage cassé. Les trois qui
     * restent sont exactement les écrans que le design system ne dessine pas.
     */
    const publiquesTrouvees = inventaire
      .filter((c) => !c.authentifiee)
      .map((c) => c.fichier)
      .sort();
    expect(
      publiquesTrouvees,
      "La liste des cartes-pages publiques ne décrit plus le dépôt. Un écran " +
        "migré retire sa ligne ; un écran qui en ajoute une doit la déclarer.",
    ).toEqual(PUBLIQUES_RESTANTES.map(([f]) => f).sort());
  });

  test("chaque carte-page porte le rayon de SA surface", () => {
    const ecarts = inventaire
      .filter((c) => c.classe !== (c.authentifiee ? RAYON_AUTHENTIFIE : RAYON_PUBLIC))
      .map((c) => `${c.fichier} : ${c.classe} sur une surface ${c.authentifiee ? "authentifiée" : "publique"}`);
    expect(ecarts).toEqual([]);
  });

  /**
   * L'ÉCHEC DOIT VENIR DANS LES DEUX SENS. Le contrôle ci-dessus rejette un
   * rayon public sur une surface authentifiée ; celui-ci vérifie qu'il
   * rejetterait aussi l'inverse, et qu'il ne se satisfait pas d'un `rounded-xl`
   * revenu par mégarde.
   */
  test("il refuserait l'inverse, et il refuserait l'ancienne valeur unique", () => {
    const juger = (c: CartePage) => c.classe === (c.authentifiee ? RAYON_AUTHENTIFIE : RAYON_PUBLIC);
    expect(juger({ fichier: "t", authentifiee: true, classe: RAYON_PUBLIC })).toBe(false);
    expect(juger({ fichier: "t", authentifiee: false, classe: RAYON_AUTHENTIFIE })).toBe(false);
    expect(juger({ fichier: "t", authentifiee: true, classe: "md:rounded-xl" })).toBe(false);
    expect(juger({ fichier: "t", authentifiee: false, classe: "md:rounded-xl" })).toBe(false);
  });

  test("les deux tokens sont déclarés DANS le bloc @theme", () => {
    // Hors de `@theme`, une variable ne produit aucune classe utilitaire : le
    // coin devient carré sans erreur. Le contrôle porte donc sur la POSITION,
    // pas sur la présence.
    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const debut = css.indexOf("@theme {");
    expect(debut).toBeGreaterThanOrEqual(0);
    const theme = css.slice(debut, css.indexOf("\n}", debut));
    expect(theme).toContain("--radius-page: 24px;");
    expect(theme).toContain("--radius-page-publique: 28px;");
  });
});
