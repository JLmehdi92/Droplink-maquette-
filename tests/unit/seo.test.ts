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
/*
 * ⚠️ `/docs` A ÉTÉ AJOUTÉ EN CONSCIENCE LE 12/09/2026, et voici la relecture que
 * cette liste réclame. C'est une page PUBLIQUE de documentation : elle décrit le
 * fonctionnement du produit, ne porte aucune donnée de compte, aucun jeton,
 * aucun nom de client. Le design system lui assigne d'ailleurs sa propre
 * canonique — `droplink.fr/fr/docs` — et ses trois hreflang.
 *
 * Elle est aussi la seule page de contenu que le produit publie en dehors du
 * blog, donc la seule qui puisse répondre à « comment fonctionne DropLink »
 * dans un moteur. L'indexer est l'intention, pas un effet de bord.
 */
/*
 * ⚠️ `/tarifs` A ÉTÉ AJOUTÉ EN CONSCIENCE LE 26/09/2026 (décision de Wassim : « tu
 * créer la page et tu mets l'offre »). Relecture : page PUBLIQUE de vente, sans
 * donnée de compte, sans jeton, sans nom de client — deux plans, un prix et deux
 * plafonds globaux lus en base. Elle a sa canonique et ses trois hreflang, comme
 * `/docs`. L'indexer est l'intention : c'est la page qui répond à « combien coûte
 * DropLink », et Lemon Squeezy la demande avant d'ouvrir les paiements.
 */
const CHEMINS_ATTENDUS = ["", "/tarifs", "/conditions", "/confidentialite", "/mentions-legales", "/signalement", "/docs"] as const;

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

      /*
       * ⚠️ TROISIÈME CATÉGORIE, AJOUTÉE LE 08/09/2026 AVEC LE BLOG, ET CE TEST
       * L'A EXIGÉE : il a déclaré les deux pages du blog « ni indexables ni
       * fermées », ce qui était exact — elles sont indexables MAIS dans une
       * seule langue.
       *
       * Elles n'entrent pas dans `CHEMINS_ATTENDUS`, qui décrit ce qui existe
       * en trois langues, et elles ne portent pas de `noindex` puisqu'on veut
       * qu'elles soient trouvées. La marque de cette catégorie est l'appel à
       * `alternatesUneSeuleLangue` — celui-là même qui empêche de déclarer des
       * traductions inexistantes.
       */
      if (code.includes("alternatesUneSeuleLangue(")) continue;

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
    for (const fichier of ["p/[token]/page.tsx", "p/[token]/apercu/page.tsx", "p/[token]/layout.tsx"]) {
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

  test("chaque page indexable rend un graphe JSON-LD", () => {
    /*
     * ⚠️ AUDIT SEO DU 03/10/2026 : seules la landing et les articles en
     * portaient un. Tarifs, guide, pages légales, signalement et blog n'en
     * avaient AUCUN — rien ne les rattachait au site ni à l'organisation.
     * Une page qui se déclare indexable (alternates) doit aussi se décrire.
     */
    const indexables = pagesDeLApp().filter((p) =>
      /alternatesDe\(|alternatesUneSeuleLangue\(/.test(codeSansCommentaires(join(RACINE_APP, p))),
    );
    // UN ENSEMBLE VIDE PASSE TOUT : 7 pages trilingues et les 2 du blog.
    expect(indexables.length, "la sonde ne trouve pas les pages indexables").toBeGreaterThanOrEqual(9);
    const sansGraphe = indexables.filter(
      (p) => !/<GrapheJsonLd\s/.test(codeSansCommentaires(join(RACINE_APP, p))),
    );
    expect(sansGraphe, "Ces pages indexables ne rendent aucune donnée structurée.").toEqual([]);
  });

  test("les données structurées ne déclarent AUCUN prix", () => {
    /*
     * ⚠️ PROTECTION DE PRODUIT AUTANT QUE DE SEO, ET LA PRESSION REVIENDRA.
     *
     * Google demande un bloc `offers` pour ses résultats enrichis de
     * `SoftwareApplication` : l'ajouter paraîtra toujours être une amélioration
     * gratuite. Le produit ne connaît AUCUNE notion de prix — ni table, ni code
     * de facturation, c'est une contrainte verrouillée du brief.
     *
     * Déclarer « price: 0 » affirmerait dans un format lisible par une machine
     * ce que la base n'a jamais enregistré (principe XII), et cette affirmation
     * deviendrait fausse en phase 2 **avant que quiconque pense à la relire**.
     * Une absence se corrige ; une donnée structurée périmée circule.
     *
     * La fumée le vérifie aussi, sur le graphe servi. Celui-ci attrape plus tôt
     * — au typecheck plutôt qu'après un build.
     */
    const code = codeSansCommentaires(join(process.cwd(), "src", "lib", "seo", "donnees-structurees.ts"));
    expect(code.length, "le dépouilleur a vidé le fichier").toBeGreaterThan(300);
    expect(code, "le graphe doit rester construit ici").toContain("SoftwareApplication");
    for (const interdit of ["offers", "price", "priceCurrency"]) {
      expect(code.includes(interdit), `le graphe déclare « ${interdit} »`).toBe(false);
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

/**
 * LE BLOG N'EXISTE QU'EN FRANÇAIS — et c'est la contrainte la plus facile à
 * casser sans s'en apercevoir.
 *
 * Décision de Wassim du 08/09/2026 : un article est écrit une fois, on regarde
 * lesquels remontent, on traduit ceux-là. Tant que c'est le cas, déclarer
 * `hreflang="en"` sur une page de blog pointerait vers une URL qui rend 404 —
 * et Google n'ignore pas la ligne fautive, il ignore le JEU ENTIER.
 */
describe("Le blog ne promet pas de traductions qui n'existent pas", () => {
  const PAGES_BLOG = ["[locale]/blog/page.tsx", "[locale]/blog/[slug]/page.tsx"] as const;

  test("les pages du blog existent et sont lues", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : un renommage de dossier rendrait les
    // contrôles suivants verts en n'inspectant rien.
    for (const p of PAGES_BLOG) {
      const code = codeSansCommentaires(join(RACINE_APP, p));
      expect(code.length, `${p} : introuvable ou vidé`).toBeGreaterThan(400);
    }
  });

  test("aucune page du blog n'emploie les alternates TRILINGUES", () => {
    for (const p of PAGES_BLOG) {
      const code = codeSansCommentaires(join(RACINE_APP, p));
      expect(
        /alternatesDe\(/.test(code),
        `${p} emploie alternatesDe() : il déclarerait des traductions ` +
          "inexistantes, et Google ignorerait le jeu hreflang ENTIER",
      ).toBe(false);
      expect(code, `${p} n'emploie pas alternatesUneSeuleLangue()`).toContain(
        "alternatesUneSeuleLangue(",
      );
    }
  });

  test("aucune page du blog n'annonce d'autres locales Open Graph", () => {
    // Contre-inventaire de l'audit SEO (03/10/2026) : `og:locale:alternate` en_US et
    // zh_CN partaient sur les six pages du blog, qui n'existent qu'en français.
    for (const p of PAGES_BLOG) {
      const code = codeSansCommentaires(join(RACINE_APP, p));
      expect(code, `${p} n'emploie pas openGraphDe()`).toContain("openGraphDe(");
      expect(code, `${p} annonce les autres locales Open Graph`).toMatch(/uneSeuleLangue:\s*true/);
    }
  });

  test("chaque page du blog REFUSE les autres langues", () => {
    /*
     * Servir le français sous `/en/blog` serait pire que refuser : une page
     * indexable qui ment sur sa langue, dans un `<html lang="en">`. Le refus
     * doit donc être explicite dans le code, pas seulement dans l'intention.
     */
    for (const p of PAGES_BLOG) {
      const code = codeSansCommentaires(join(RACINE_APP, p));
      expect(code, `${p} ne vérifie pas la langue`).toContain("estLangueDuBlog(");
      expect(code, `${p} ne rend pas 404 hors de sa langue`).toContain("notFound()");
    }
  });

  test("aucun titre de recherche ne dépasse 60 caractères", () => {
    /*
     * ⚠️ MESURÉ SUR LES CINQ PREMIERS ARTICLES : trois `<title>` dépassaient,
     * dont deux à 83 et 84 caractères. Google tronque autour de 60 — et il
     * tronque LA FIN, c'est-à-dire l'endroit où l'on met le mot qu'on vise.
     *
     * D'où `titreMeta`, distinct du `<h1>` : le titre de la page peut rester
     * long et expressif, celui du résultat de recherche doit tenir.
     */
    const SUFFIXE = " — DropLink";
    const trop: string[] = [];
    for (const fichier of readdirSync(join(process.cwd(), "src", "contenu", "blog"))) {
      const source = readFileSync(join(process.cwd(), "src", "contenu", "blog", fichier), "utf8");
      const meta = /titreMeta:\s*"([^"]+)"/.exec(source)?.[1];
      const titre = /\n  titre:\s*"([^"]+)"/.exec(source)?.[1];
      const retenu = meta ?? titre;
      expect(retenu, `${fichier} : aucun titre lisible`).toBeDefined();
      const longueur = (retenu ?? "").length + SUFFIXE.length;
      if (longueur > 60) trop.push(`${fichier} (${longueur})`);
    }
    expect(trop, "Ces titres seront tronqués par Google, en perdant leur fin.").toEqual([]);
  });
});

/**
 * LES TITRES ET DESCRIPTIONS DE RECHERCHE DES PAGES TRILINGUES TIENNENT DANS LE
 * RÉSULTAT — audit SEO du 03/10/2026.
 *
 * Mesuré au premier passage : 35 écarts sur 21 pages — « Tarifs — DropLink »
 * (17 caractères), des descriptions anglaises de 88 caractères, chinoises de 63,
 * une française de 189 que Google coupait au milieu de la promesse.
 *
 * Google tronque en PIXELS : un caractère chinois occupe environ la place de
 * deux lettres latines. La largeur compte donc 2 par caractère chinois ou de
 * ponctuation pleine chasse, 1 sinon — d'où une seule fourchette pour les trois
 * langues : titre 30 à 60, description 120 à 160.
 */
describe("Les titres et descriptions de recherche tiennent dans le résultat", () => {
  const PAGES: ReadonlyArray<readonly [string, string]> = [
    ["landing.metaTitre", "landing.metaDescription"],
    ["tarifs.metaTitre", "tarifs.metaDescription"],
    ["legal.conditionsMetaTitre", "legal.conditionsMetaDescription"],
    ["legal.confidentialiteMetaTitre", "legal.confidentialiteMetaDescription"],
    ["legal.mentionsMetaTitre", "legal.mentionsMetaDescription"],
    ["legal.signalementMetaTitre", "legal.signalementMetaDescription"],
    ["docs.metaTitre", "docs.metaDescription"],
  ];
  const largeur = (s: string): number =>
    [...s].reduce((n, c) => n + (/[　-〿㐀-鿿＀-￯]/.test(c) ? 2 : 1), 0);
  const lire = (catalogue: unknown, cle: string): string => {
    const v = cle.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogue);
    return typeof v === "string" ? v.replace("{prix}", "20 €") : "";
  };

  for (const langue of ["fr", "en", "zh-CN"] as const) {
    test(`${langue} : chaque page a un titre de 30 à 60 et une description de 120 à 160, tous uniques`, () => {
      const catalogue: unknown = JSON.parse(readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8"));
      const ecarts: string[] = [];
      const vus = new Set<string>();
      for (const [cleTitre, cleDescription] of PAGES) {
        const titre = lire(catalogue, cleTitre);
        const description = lire(catalogue, cleDescription);
        // UN ENSEMBLE VIDE PASSE TOUT : une clé renommée doit rougir, pas disparaître.
        expect(titre, `${langue} ${cleTitre} introuvable`).not.toBe("");
        expect(description, `${langue} ${cleDescription} introuvable`).not.toBe("");
        const lt = largeur(titre);
        const ld = largeur(description);
        if (lt < 30 || lt > 60) ecarts.push(`${cleTitre} : ${lt} « ${titre} »`);
        if (ld < 120 || ld > 160) ecarts.push(`${cleDescription} : ${ld}`);
        for (const texte of [titre, description]) {
          if (vus.has(texte)) ecarts.push(`doublon : « ${texte} »`);
          vus.add(texte);
        }
      }
      expect(ecarts).toEqual([]);
    });
  }
});

describe("Le blog tient aussi dans le résultat de recherche", () => {
  /*
   * Le blog n'a pas de catalogue : ses textes de recherche vivent dans
   * `blog/page.tsx` et dans `src/contenu/blog`. Mesuré au premier passage de
   * l'audit (03/10/2026) : la description du blog à 181, deux articles à 175 et
   * 186. Même fourchette que les pages trilingues.
   */
  test("titre et description de recherche du blog, description de chaque article", () => {
    const ecarts: string[] = [];
    const page = readFileSync(join(RACINE_APP, "[locale]", "blog", "page.tsx"), "utf8");
    const titre = /const TITRE = "([^"]+)"/.exec(page)?.[1] ?? "";
    const description = /const DESCRIPTION_META =\s*"([^"]+)"/.exec(page)?.[1] ?? "";
    // UN ENSEMBLE VIDE PASSE TOUT : une constante renommée doit rougir.
    expect(titre, "TITRE du blog introuvable").not.toBe("");
    expect(description, "DESCRIPTION_META du blog introuvable").not.toBe("");
    if (titre.length < 30 || titre.length > 60) ecarts.push(`blog TITRE : ${titre.length}`);
    if (description.length < 120 || description.length > 160) ecarts.push(`blog DESCRIPTION_META : ${description.length}`);
    const fichiers = readdirSync(join(process.cwd(), "src", "contenu", "blog"));
    expect(fichiers.length, "aucun article lu").toBeGreaterThan(0);
    for (const fichier of fichiers) {
      const source = readFileSync(join(process.cwd(), "src", "contenu", "blog", fichier), "utf8");
      const d = /description:\s*"([^"]+)"/.exec(source)?.[1] ?? "";
      if (d.length < 120 || d.length > 160) ecarts.push(`${fichier} description : ${d.length}`);
    }
    expect(ecarts).toEqual([]);
  });
});
