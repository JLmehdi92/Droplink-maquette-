import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LANGUES } from "@/i18n/config";

/**
 * TOUTE PAGE EST SOIT INDEXABLE ET DÉCLARÉE, SOIT FERMÉE — JAMAIS ENTRE LES DEUX.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MESURÉ SUR LA PRODUCTION LE 08/09/2026, AVANT CETTE PASSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   /robots.txt        404          canonical       0
 *   /sitemap.xml       404          hreflang        0
 *   metadataBase       absent       JSON-LD         0
 *
 * Le produit servait trois langues depuis le 06/09 sans jamais dire à un moteur
 * qu'elles sont les traductions les unes des autres. Sans hreflang, Google ne
 * voit pas un site trilingue : il voit trois pages qui se ressemblent, en
 * choisit UNE, et la sert à tout le monde — le fournisseur de Guangzhou reçoit
 * la version française. Le travail de traduction existait et n'atteignait
 * personne.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE SUITE PROUVE, ET CE QU'ELLE NE PEUT PAS PROUVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Elle lit le CODE : elle établit que chaque page se range dans l'une des deux
 * catégories, et que la liste du plan de site correspond aux pages qui se
 * déclarent indexables. Elle **ne peut pas** voir ce que Next émet au rendu.
 *
 * La preuve d'effet vit dans `scripts/fumee.mjs`, qui interroge les douze URL
 * servies. ⚠️ **ET ELLE S'EST TROMPÉE À SA PREMIÈRE EXÉCUTION** : elle cherchait
 * `hreflang="` en minuscules alors que Next rend l'attribut React `hrefLang`
 * avec un L majuscule — parfaitement valide, HTML5 ignorant la casse des noms
 * d'attributs. Douze pages correctes déclarées fautives. Les deux gardes sont
 * donc nécessaires ET faillibles chacune à sa façon : celle-ci ne voit pas le
 * rendu, celle-là ne voit pas le code.
 */

const RACINE_APP = join(process.cwd(), "src", "app");

/**
 * Les chemins indexables ATTENDUS — la troisième source, celle qu'un humain a
 * décidée.
 *
 * ⚠️ CETTE CONSTANTE A DÉJÀ FAIT PASSER UNE FALSIFICATION AU VERT, LE 08/09/2026.
 *
 * La première version de ce test comparait les pages du code À CETTE LISTE, et
 * s'arrêtait là. J'ai ajouté `"/p"` à `src/app/sitemap.ts` pour l'éprouver :
 * **les cinq tests sont restés verts**, parce que le vrai plan de site
 * n'entrait jamais dans la comparaison. La garde censée empêcher la
 * publication des jetons ne regardait pas le fichier qui les publierait.
 *
 * Il y a donc TROIS sources, et elles doivent concorder deux à deux :
 *
 *   1. `CHEMINS_INDEXABLES` de `src/app/sitemap.ts`  — ce qui est ANNONCÉ ;
 *   2. les pages qui appellent `alternatesDe()`      — ce qui est DÉCLARÉ ;
 *   3. cette liste-ci                                 — ce qui est VOULU.
 *
 * La troisième n'est pas redondante : sans elle, ajouter `/p` **aux deux**
 * autres passerait — et c'est exactement ce qu'on ferait en « corrigeant » une
 * divergence sans réfléchir.
 */
const CHEMINS_ATTENDUS = ["", "/conditions", "/confidentialite", "/signalement"] as const;

/** Les chemins réellement déclarés dans `src/app/sitemap.ts`, lus dans le fichier. */
function cheminsDuSitemap(): string[] {
  const source = readFileSync(join(RACINE_APP, "sitemap.ts"), "utf8");
  const bloc = /const CHEMINS_INDEXABLES = \[([^\]]*)\]/.exec(source);
  if (bloc === null || bloc[1] === undefined) return [];
  return [...bloc[1].matchAll(/"([^"]*)"/g)].map((m) => m[1] ?? "").sort();
}

/** Le code d'un fichier, commentaires retirés (L-031). */
function codeSansCommentaires(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** Toutes les `page.tsx` de `src/app`, chemins relatifs à `src/app`. */
function pagesDeLApp(): string[] {
  return readdirSync(RACINE_APP, { recursive: true, encoding: "utf8" })
    .map((f) => f.split("\\").join("/"))
    .filter((f) => f.endsWith("/page.tsx"))
    .sort();
}

/** Le chemin d'URL d'une page, sans le préfixe de langue. `null` hors `[locale]`. */
function cheminUrlDe(relatif: string): string | null {
  if (!relatif.startsWith("[locale]/")) return null;
  const sansPage = relatif.slice("[locale]/".length).replace(/page\.tsx$/, "");
  // Les groupes de routes `(app)` n'apparaissent pas dans l'URL.
  const segments = sansPage.split("/").filter((s) => s !== "" && !s.startsWith("("));
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

describe("Le SEO : chaque page est soit déclarée, soit fermée", () => {
  test("la sonde balaie réellement les pages", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Sans ce contrôle, une lecture récursive
    // cassée rendrait tous les suivants verts en n'inspectant rien.
    const pages = pagesDeLApp();
    expect(pages.length, "aucune page.tsx trouvée : la sonde vise à côté").toBeGreaterThan(15);
    expect(pages, "la landing est introuvable").toContain("[locale]/page.tsx");
    expect(pages, "la page publique est introuvable").toContain("p/[token]/page.tsx");
  });

  test("le plan de site déclare EXACTEMENT les pages qui se disent indexables", () => {
    /*
     * ⚠️ LE CONTRÔLE QUI EMPÊCHE LA FUITE LA PLUS GRAVE.
     *
     * Une page ajoutée au plan de site sans être indexable serait annoncée aux
     * moteurs tout en leur disant de ne pas l'indexer — contradictoire mais
     * inoffensif. L'inverse ne l'est pas : `/p/[token]` glissé dans le plan
     * publierait la liste des jetons, et chaque jeton donne accès À VIE aux
     * photos d'un client.
     *
     * IL ÉCHOUE DANS LES DEUX SENS : une page indexable absente du plan, et une
     * entrée du plan qui ne correspond à aucune page déclarée indexable.
     */
    const indexables = pagesDeLApp()
      .filter((p) => codeSansCommentaires(join(RACINE_APP, p)).includes("alternatesDe("))
      .map(cheminUrlDe)
      .filter((c): c is string => c !== null)
      .sort();

    const annonces = cheminsDuSitemap();

    // CONTRE-TEST : une extraction cassée rendrait une liste vide, et les deux
    // comparaisons suivantes porteraient sur du néant.
    expect(
      annonces.length,
      "aucun chemin extrait de src/app/sitemap.ts : la lecture vise à côté",
    ).toBeGreaterThan(1);

    expect(
      annonces,
      "Le plan de site ANNONCE d'autres chemins que ceux voulus. Si c'est " +
        "délibéré, la liste attendue de ce test doit être mise à jour EN " +
        "CONSCIENCE — c'est le seul endroit où un humain relit ce qui part aux " +
        "moteurs.",
    ).toEqual([...CHEMINS_ATTENDUS].sort());

    expect(
      indexables,
      "Les pages qui appellent alternatesDe() et le plan de site ont divergé. " +
        "Soit une page indexable manque au plan, soit le plan annonce une page " +
        "qui ne se déclare pas indexable.",
    ).toEqual(annonces);
  });

  test("TOUTE page non indexable porte un noindex", () => {
    /*
     * L'INVENTAIRE PLUTÔT QUE LA SÉLECTION. Un contrôle qui citerait les pages
     * connues ne verrait jamais celle qu'on ajoutera — et c'est exactement
     * celle-là qui partira ouverte, parce que personne n'y aura pensé.
     */
    const ouvertes: string[] = [];
    for (const relatif of pagesDeLApp()) {
      const code = codeSansCommentaires(join(RACINE_APP, relatif));
      const cheminUrl = cheminUrlDe(relatif);
      const seDeclareIndexable =
        cheminUrl !== null && (CHEMINS_ATTENDUS as readonly string[]).includes(cheminUrl);
      if (seDeclareIndexable) continue;

      // `index: false` sous n'importe quelle forme d'écriture.
      const ferme = /index:\s*false/.test(code);
      if (!ferme) ouvertes.push(relatif);
    }
    expect(
      ouvertes,
      "Ces pages ne sont NI déclarées indexables NI fermées par un noindex. " +
        "Une page laissée dans cet état est ouverte à l'indexation par défaut.",
    ).toEqual([]);
  });

  test("la page publique ne porte AUCUN Open Graph — décision 23", () => {
    /*
     * Un aperçu enrichi montrerait la photo ou le pseudo du client DANS la
     * conversation, donc à qui n'ouvre pas le lien — et les messageries le
     * mettent en cache sur leurs serveurs. Fuite silencieuse, hors de notre
     * portée une fois partie.
     *
     * Une passe SEO est précisément le moment où quelqu'un ajoute un Open Graph
     * « pour bien faire ». Ce contrôle existe pour que ce jour-là soit rouge.
     */
    for (const fichier of ["p/[token]/page.tsx", "p/[token]/layout.tsx"]) {
      const code = codeSansCommentaires(join(RACINE_APP, fichier));
      expect(code.length, `${fichier} : le dépouilleur a vidé le fichier`).toBeGreaterThan(200);
      /*
       * ⚠️ ON LIT LA VALEUR, ON NE CHERCHE PAS UNE ABSENCE.
       *
       * Ma première version écrivait `/openGraph:\s*(?!undefined)/` et
       * déclarait le fichier fautif alors qu'il porte `openGraph: undefined`.
       * La raison est un piège classique : `\s*` peut rétrograder jusqu'à zéro
       * caractère, et le lookahead réussit alors sur l'espace qui précède —
       * donc le motif trouve toujours quelque chose. Une négation dans une
       * expression régulière est presque toujours plus fragile que la lecture
       * de la valeur elle-même.
       */
      const valeurs = [...code.matchAll(/openGraph:\s*([A-Za-z0-9_$]+|\{)/g)].map((m) => m[1]);
      expect(
        valeurs.filter((v) => v !== "undefined"),
        `${fichier} déclare un openGraph autre que \`undefined\``,
      ).toEqual([]);
      expect(
        /alternatesDe\(/.test(code),
        `${fichier} déclare des hreflang : sa langue est celle du VENDEUR, ` +
          "elle n'a pas de traduction",
      ).toBe(false);
    }
  });

  test("le plan de site et les alternates couvrent les mêmes langues", () => {
    // Une langue ajoutée à `LANGUES` doit se propager aux deux, sinon le
    // maillage devient asymétrique — et un maillage asymétrique invalide le
    // signal des DEUX côtés.
    const sitemap = codeSansCommentaires(join(RACINE_APP, "sitemap.ts"));
    const alternates = codeSansCommentaires(join(process.cwd(), "src", "lib", "seo", "alternates.ts"));
    expect(LANGUES.length, "aucune langue déclarée").toBeGreaterThan(1);
    for (const source of [sitemap, alternates]) {
      expect(
        source.includes("LANGUES"),
        "les langues sont écrites à la main au lieu d'être engendrées depuis " +
          "LANGUES : la prochaine langue ajoutée sera oubliée ici",
      ).toBe(true);
      expect(source, "x-default absent").toContain("x-default");
    }
  });
});
