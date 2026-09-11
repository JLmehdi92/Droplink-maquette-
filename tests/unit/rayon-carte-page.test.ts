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
     * Il reste 6 cartes-pages le 11/09/2026. Le plancher est donc à 5 : assez
     * bas pour qu'une migration ne le fasse pas rougir à tort, assez haut pour
     * qu'une DISPARITION du balayage — un composant renommé, une extension qui
     * change — se voie encore.
     */
    expect(
      inventaire.length,
      "moins de cinq cartes-pages : soit la migration est plus avancée que ce " +
        "que cette suite déclare, soit le balayage est cassé. Les deux se " +
        "corrigent ICI, jamais en baissant le nombre.",
    ).toBeGreaterThanOrEqual(5);
  });

  /**
   * ⚠️ CE CONTRÔLE EXIGEAIT « DEUX FAMILLES », ET LA MIGRATION LE REND FAUX.
   *
   * Sa raison d'origine tient toujours : une suite qui ne verrait que des
   * surfaces publiques passerait à 100 % pendant que tout l'espace vendeur
   * rendrait la mauvaise valeur. Mais l'espace vendeur a PERDU sa carte-page le
   * 11/09/2026 — le design system supprime le cadre extérieur — et il n'en
   * reste qu'une seule authentifiée : l'admin, pas encore migré.
   *
   * Un plancher de « au moins une » aurait tenu sans rien prouver. On DÉCLARE
   * donc ce qui reste, nommément : la liste échoue dans les DEUX SENS — une
   * carte-page authentifiée qui disparaît sans qu'on raye sa ligne, et une
   * nouvelle qui apparaîtrait sans être déclarée. Quand la liste sera vide,
   * cette suite n'aura plus d'objet et devra être SUPPRIMÉE.
   */
  const AUTHENTIFIEES_RESTANTES: ReadonlyArray<readonly [string, string]> = [
    [
      "[locale]/admin/layout.tsx",
      "Le chrome de l'administration. Il garde la carte-page tant que les six " +
        "écrans admin ne sont pas migrés — le design system les dessine en clair, " +
        "sans cadre, mais aucun n'est encore porté.",
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

    // Les surfaces publiques, elles, ne sont pas encore touchées.
    expect(
      inventaire.filter((c) => !c.authentifiee).length,
      "les surfaces publiques ont perdu leurs cartes-pages sans que cette suite " +
        "le sache",
    ).toBeGreaterThanOrEqual(4);
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
