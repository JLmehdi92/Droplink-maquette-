import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { LANGUES } from "@/i18n/config";
import { lireLienAuNom } from "@/lib/routes/lien-au-nom";

/**
 * CHAQUE EXCLUSION DU MATCHER EST UNE PORTE.
 *
 * Le middleware ne fait aujourd'hui que la négociation de langue, mais il
 * portera le rafraîchissement de session et la protection de `/admin`. Une
 * exclusion trop large posée maintenant deviendra une faille silencieuse le
 * jour où on lui confie une responsabilité — et personne ne relira le matcher à
 * ce moment-là.
 *
 * La sonde INVENTORIE les routes réelles du dossier `app` au lieu de vérifier
 * celles auxquelles son auteur a pensé, et elle vérifie que chaque exclusion
 * vise EXACTEMENT ce qu'elle prétend viser.
 */

const RACINE_APP = join(process.cwd(), "src", "app");

const SOURCE_MIDDLEWARE = join(process.cwd(), "src", "middleware.ts");

/**
 * Le matcher est lu depuis le FICHIER SOURCE, pas importe depuis le module.
 *
 * Deux raisons. La premiere est pratique : importer le module tire
 * `next-intl/middleware`, qui exige un contexte Next absent d un test. La
 * seconde compte davantage — la garde doit porter sur le code qui sera
 * effectivement deploye, et non sur un module reconstruit par un autre
 * chargeur. Interroger l artefact suppose d etablir qu il correspond au code
 * sous test ; ici on lit le code lui-meme.
 */
function texteMatcher(): string {
  const source = readFileSync(SOURCE_MIDDLEWARE, "utf8");
  const sansCommentaires = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const trouve = /matcher:\s*"([^"]+)"/.exec(sansCommentaires);
  if (trouve?.[1] === undefined) throw new Error("matcher introuvable dans src/middleware.ts");
  return trouve[1];
}

function motifMatcher(): RegExp {
  // Le motif est evalue COMME TYPESCRIPT L EVALUE, via `JSON.parse` sur le
  // litteral. Une premiere version desechappait a la main : elle transformait
  // `\.` en `\.` et obtenait le bon motif — mais le fichier ne portait alors
  // qu UN antislash, donc TypeScript compilait `\.` en `.`, et le produit
  // appliquait un motif ou le point n etait plus echappe. La sonde et le
  // produit divergeaient, la sonde etant la plus indulgente des deux (L-032).
  return new RegExp(`^${litteralMatcher()}$`);
}

/**
 * Évalue le littéral de chaîne comme TypeScript l'évaluerait.
 *
 * L'échec est nommé plutôt que subi : un antislash mal échappé fait lever
 * `JSON.parse`, et sans ce message le fichier de test cesserait simplement de
 * se charger. Un garde qui s'effondre au lieu de désigner le défaut oblige à
 * enquêter sur le garde au lieu d'enquêter sur le produit.
 */
function litteralMatcher(): string {
  const brut = texteMatcher();
  try {
    return JSON.parse(`"${brut}"`) as string;
  } catch {
    throw new Error(
      `Le matcher de src/middleware.ts n'est pas un littéral de chaîne valide : « ${brut} ». ` +
        "Cause la plus probable : un antislash simple là où la source TypeScript " +
        "en exige deux. `\"\\.\"` vaut `\".\"` une fois compilé, donc le point cesse " +
        "d'être échappé et l'exclusion des fichiers avale toutes les routes.",
    );
  }
}

/** Convertit l'arborescence `app` en chemins d'URL concrets. */
function routesDeclarees(): string[] {
  const routes: string[] = [];

  const parcourir = (dossier: string, prefixe: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (!statSync(chemin).isDirectory()) continue;
      // Les groupes entre parenthèses n'ajoutent rien à l'URL.
      const segment = entree.startsWith("(") ? "" : `/${entree}`;
      const nouveauPrefixe = `${prefixe}${segment}`;
      const fichiers = readdirSync(chemin);
      if (fichiers.some((f) => f === "page.tsx" || f === "route.ts")) {
        routes.push(nouveauPrefixe === "" ? "/" : nouveauPrefixe);
      }
      parcourir(chemin, nouveauPrefixe);
    }
  };

  parcourir(RACINE_APP, "");
  return routes;
}

/** Remplace `[locale]` et les autres segments dynamiques par des valeurs réelles. */
function concretiser(route: string): string[] {
  if (route.includes("[locale]")) {
    return LANGUES.map((l) => route.replace("[locale]", l));
  }
  return [route.replace(/\[[^\]]+\]/g, "exemple")];
}

describe("Matcher du middleware", () => {
  const motif = motifMatcher();

  test("la sonde inventorie réellement des routes", () => {
    const routes = routesDeclarees();
    expect(routes.length, "aucune route trouvée : la sonde vise à côté").toBeGreaterThan(0);
  });

  /**
   * Routes volontairement HORS du middleware, chacune avec sa raison. Le test
   * échoue dans les deux sens : une route non couverte et non déclarée ici, et
   * une déclaration devenue inutile.
   */
  const HORS_MIDDLEWARE = new Map<string, string>([
    [
      "/api/paiement/lemon-squeezy",
      "Le webhook d'abonnement. `/api` est exclu du matcher, et cette route " +
        "est la seule du produit qui POSE UN PLAN PAYANT : sans garde, un POST " +
        "suffirait à s'offrir l'abonnement. Elle porte la sienne — une " +
        "signature HMAC-SHA256 vérifiée sur le CORPS BRUT, à temps constant, " +
        "avant toute analyse, et un refus si le secret n'est pas configuré. " +
        "Le middleware ne pourrait de toute façon rien y ajouter : l'appelant " +
        "est un fournisseur, pas une session.",
    ],
    [
      "/api/notification/confirmer",
      "Le bouton « Confirmer » de la page ouverte depuis un e-mail de suivi " +
        "(migration 188). Le client n'a JAMAIS de session : le middleware n'aurait " +
        "rien à rafraîchir. Sa garde est le jeton lui-même — 32 octets aléatoires, " +
        "dont la base ne garde que l'empreinte SHA-256, à usage unique, expiré en " +
        "24 heures — plus le quota d'écriture publique.",
    ],
    [
      "/api/notification/desinscription",
      "La désinscription en un clic des e-mails de suivi (RFC 8058) : la " +
        "messagerie du client poste ICI sans ouvrir de page, donc sans session ni " +
        "cookie. Sa garde est `unsubscribe_token`, immuable et distinct du jeton " +
        "public — il ne donne aucun accès à la commande —, plus le quota " +
        "d'écriture publique.",
    ],
    [
      "/api/suivi/cadence",
      "Déclencheur de la tâche de fond du suivi. `/api` est exclu du matcher, et " +
        "ce que cette route déclenche COÛTE DE L'ARGENT : chaque passage " +
        "interroge le fournisseur. Elle porte SA garde — un secret partagé " +
        "comparé à TEMPS CONSTANT, refus si le secret n'est pas configuré, et " +
        "404 plutôt que 401 pour ne pas révéler l'existence de la surface.",
    ],
    [
      "/api/veille",
      "Second planificateur — la veille mutuelle. `/api` est exclu du matcher : " +
        "elle porte SA garde, la même que la cadence (`lib/taches/secret.ts`), " +
        "secret comparé à TEMPS CONSTANT, refus si le secret n'est pas " +
        "configuré, et 404 plutôt que 401 pour ne pas révéler l'existence de la " +
        "surface. Elle doit être appelée par un planificateur DIFFÉRENT de " +
        "celui de la cadence : deux tâches sur le même planificateur ne " +
        "veillent rien, elles s'arrêtent ensemble.",
    ],
    [
      "/api/commandes/export",
      "Export CSV des commandes du vendeur connecté. Route handler et non Server " +
        "Action parce qu'un téléchargement exige `Content-Disposition`, que la " +
        "seconde ne peut pas fixer — c'est la déviation documentée au brief. " +
        "`/api` est exclu du matcher, et son emplacement donnerait l'impression " +
        "contraire : elle porte SA garde, qui lit le profil EN BASE et répond " +
        "404 — jamais 401 — à qui n'a pas de session active, pour ne pas " +
        "confirmer qu'elle existe. La lecture se fait sous RLS AVEC LA SESSION : " +
        "un export est le pire endroit où contourner l'isolation, puisqu'il " +
        "produit un fichier qui SORT de l'application.",
    ],
    [
      "/api/compte/export",
      "« Exporter mes données » de l'écran Paramètres, posé le 13/09/2026. Route " +
        "handler pour `Content-Disposition`, comme les deux exports CSV. Elle porte " +
        "SA garde : l'état du compte lu EN BASE, 404 — jamais 401 — sans session " +
        "active ET pour une session `aal1` d'un compte à double authentification. " +
        "Lecture sous RLS AVEC LA SESSION. Elle fait sortir les liens publics : " +
        "elle partage donc le plafond de débit de l'export des commandes, et " +
        "n'emporte ni notes internes (décision 15), ni adresse du client, ni " +
        "jeton de désabonnement — contrôlé par sentinelles dans " +
        "`tests/rls/export-donnees.test.ts`.",
    ],
    [
      "/api/envois/export",
      "Export CSV des COLIS du vendeur connecté, posé le 12/09/2026 avec la case " +
        "à cocher de l'écran Envois. Même raison d'être un route handler que " +
        "l'export des commandes : `Content-Disposition`. Elle porte SA garde, " +
        "qui lit le profil EN BASE et répond 404 — jamais 401 — à qui n'a pas de " +
        "session active. La lecture se fait sous RLS AVEC LA SESSION. " +
        "⚠️ ET ELLE N'A PAS DE PLAFOND DE DÉBIT, CONTRAIREMENT À CELLE DES " +
        "COMMANDES, parce qu'elle ne fait sortir AUCUN `public_token` : un " +
        "numéro de suivi est déjà connu du transporteur et du client, là où un " +
        "lien public transfère une capacité immuable à vie. Le plafond de LIGNES " +
        "reste, lui : il protège la mémoire du serveur, pas le vendeur.",
    ],
    [
      "/api/suivi/notification",
      "Point de réception des notifications de suivi. `/api` est exclu du " +
        "matcher, et son préfixe donnerait l'impression contraire à qui la " +
        "relit : cette route ne serait protégée par RIEN si elle ne portait pas " +
        "SA garde. Elle la porte — VÉRIFICATION DE SIGNATURE sur le corps BRUT, " +
        "comparaison à temps constant, refus sur signature absente. Sans elle, " +
        "il suffirait de connaître un numéro de suivi — qui figure sur " +
        "l'étiquette — pour écrire dans la commande d'un vendeur inconnu.",
    ],
    [
      "/p",
      "Page publique par jeton. Hors langue par conception : la langue est celle " +
        "du vendeur, pas de l'URL, et un préfixe créerait deux adresses pour un " +
        "jeton censé être unique.",
    ],
  ]);

  test("chaque route de l'application est couverte, ou déclarée hors du middleware", () => {
    const nonCouvertes: string[] = [];

    for (const route of routesDeclarees()) {
      for (const concrete of concretiser(route)) {
        if (motif.test(concrete)) continue;
        const raison = [...HORS_MIDDLEWARE.keys()].find(
          (prefixe) => concrete === prefixe || concrete.startsWith(`${prefixe}/`),
        );
        if (raison === undefined) nonCouvertes.push(concrete);
      }
    }

    expect(
      nonCouvertes,
      `Routes qui échappent au middleware sans raison déclarée : ${nonCouvertes.join(", ")}`,
    ).toEqual([]);
  });

  test("les exclusions visent EXACTEMENT ce qu'elles prétendent viser", () => {
    // Piège attrapé ici lors de l'écriture : `(?!api|p|…)` excluait TOUT chemin
    // commençant par la lettre « p », pas seulement `/p/`. `/pricing` en
    // sortait. Une exclusion prévue pour une route en couvrait une famille
    // entière — et rien ne l'aurait signalé tant que le middleware ne fait que
    // choisir une langue.
    const doiventPasser = [
      "/fr",
      "/en",
      "/fr/connexion",
      "/en/conditions",
      "/fr/auth/retour",
      "/pricing",
      "/partenaires",
      "/apidocs",
      "/pages",
    ];
    const doiventEtreExclus = ["/api/quelquechose", "/p/abc123XYZ", "/_next/static/x", "/_vercel/y"];

    const fauxExclus = doiventPasser.filter((c) => !motif.test(c));
    expect(
      fauxExclus,
      `Chemins exclus alors qu'ils devraient passer : ${fauxExclus.join(", ")}. ` +
        "Une exclusion trop large est une porte.",
    ).toEqual([]);

    const fauxPassants = doiventEtreExclus.filter((c) => motif.test(c));
    expect(
      fauxPassants,
      `Chemins qui passent alors qu'ils devraient être exclus : ${fauxPassants.join(", ")}`,
    ).toEqual([]);
  });

  test("l'exclusion des fichiers pointés n'avale aucune route réelle", () => {
    // L'exclusion des fichiers statiques vise `favicon.ico` et consorts. Elle
    // exclurait aussi un segment de route contenant un point — un `rapport.png`
    // en sortirait sans que rien ne le signale.
    const routesAvecPoint = routesDeclarees().filter((r) => r.includes("."));
    expect(
      routesAvecPoint,
      `Routes contenant un point, donc invisibles au middleware : ${routesAvecPoint.join(", ")}`,
    ).toEqual([]);
  });

  test("un point dans la VALEUR d'un segment dynamique n'exclut pas la route", () => {
    /*
     * ⚠️ CE CONTRÔLE EXISTE PARCE QUE LE PRÉCÉDENT REGARDAIT À CÔTÉ (L-025).
     *
     * Le test ci-dessus inventorie les GABARITS de routes et vérifie qu'aucun
     * DOSSIER ne contient de point. Il passait — aucun n'en contient. Mais le
     * défaut n'était pas là : `concretiser()` remplace les segments dynamiques
     * par la chaîne littérale « exemple », qui n'a pas de point, alors que la
     * valeur d'un segment dynamique est CHOISIE PAR LE VISITEUR.
     *
     * Avec l'ancienne exclusion `.*\..*` — « un point, n'importe où, sans
     * ancrage » — il suffisait donc d'un point dans l'identifiant pour sortir
     * `/[locale]/admin/comptes/[id]` du middleware. Vérifié par exécution avant
     * correction. Aucune donnée ne fuitait, `exigerAdmin()` tenant ; c'est la
     * défense en profondeur qui tombait à une seule couche, sur la seule route
     * admin dont l'URL est contrôlée par le visiteur.
     *
     * ON ÉPROUVE DONC LES ROUTES CONCRÈTES AVEC DES VALEURS HOSTILES, pas les
     * gabarits avec une valeur polie.
     */
    const VALEURS_HOSTILES = ["a.b", "x.png", "00000000-0000-0000-0000-000000000000.x", "..", "a.b.c"];

    const dynamiques = routesDeclarees().filter(
      (r) => /\[[^\]]+\]/.test(r.replace("[locale]", "fr")) && !r.startsWith("/p/"),
    );

    // UN ENSEMBLE VIDE PASSE TOUT : sans routes dynamiques à éprouver, ce
    // contrôle serait décoratif et personne ne le saurait.
    expect(
      dynamiques.length,
      "aucune route à segment dynamique trouvée : la sonde vise à côté",
    ).toBeGreaterThan(0);

    const avales: string[] = [];
    for (const route of dynamiques) {
      for (const valeur of VALEURS_HOSTILES) {
        const concret = route
          .replace("[locale]", "fr")
          .replace(/\[[^\]]+\]/g, valeur);
        if (!motif.test(concret)) avales.push(concret);
      }
    }

    expect(
      avales,
      "Ces URL sortent du middleware alors qu'elles atteignent une vraie route. " +
        "La valeur d'un segment dynamique est choisie par le visiteur : une " +
        "exclusion qui la regarde est une porte.",
    ).toEqual([]);
  });

  test("les fichiers statiques de la racine restent exclus", () => {
    // CONTRE-TEST POSITIF. Resserrer l'exclusion jusqu'à ne plus rien exclure
    // ferait passer le contrôle ci-dessus à 100 % en envoyant chaque requête de
    // fichier statique dans le middleware — donc dans un rafraîchissement de
    // session, pour une icône.
    for (const fichier of ["/favicon.ico", "/robots.txt", "/manifest.webmanifest"]) {
      expect(motif.test(fichier), `${fichier} devrait rester hors du middleware`).toBe(false);
    }
  });

  test("le fichier middleware ne déclare aucune exclusion non documentée", () => {
    // Un motif de garde qui cherche un appel doit s'appliquer au CODE,
    // commentaires retirés — sinon il se satisfait du commentaire qui décrit la
    // garde (L-031).
    // Le lookahead contient desormais des groupes `(?:/|$)` : un simple
    // `split("|")` les couperait en morceaux et inventerait des exclusions qui
    // n existent pas. On decoupe en respectant les parentheses.
    const litteral = litteralMatcher();
    const debut = litteral.indexOf("(?!");
    const exclusions: string[] = [];
    let profondeur = 0;
    let courante = "";
    for (let i = debut + 3; i < litteral.length; i += 1) {
      const c = litteral[i] as string;
      if (c === "(") profondeur += 1;
      if (c === ")") {
        if (profondeur === 0) break;
        profondeur -= 1;
      }
      if (c === "|" && profondeur === 0) {
        exclusions.push(courante);
        courante = "";
        continue;
      }
      courante += c;
    }
    if (courante !== "") exclusions.push(courante);

    // Inventaire explicite : toute exclusion ajoutée sans être listée ici fait
    // échouer, y compris si elle a l'air anodine.
    const CONNUES = ["api(?:/|$)", "p(?:/|$)", "_next", "_vercel", "[^/]+\\.[^/]+$"];
    const inconnues = exclusions.filter((e) => !CONNUES.includes(e));
    expect(
      inconnues,
      `Exclusions non documentées dans le matcher : ${inconnues.join(", ")}`,
    ).toEqual([]);

    const disparues = CONNUES.filter((e) => !exclusions.includes(e));
    expect(disparues, `Exclusions attendues disparues : ${disparues.join(", ")}`).toEqual([]);
  });

  test("le point de l'exclusion de fichiers est bien ECHAPPE", () => {
    // Test discriminant, ajoute apres avoir trouve le defaut : le fichier ne
    // portait qu UN antislash, donc TypeScript compilait `\.` en `.`, et
    // l exclusion « fichiers contenant un point » devenait « chemins contenant
    // n importe quel caractere » — c est-a-dire presque tout.
    //
    // Comparer un chemin AVEC point et le meme SANS point separe les deux cas.
    // Verifier seulement qu un fichier pointe est exclu ne les separe pas : il
    // l est dans les deux mondes.
    //
    // ⚠️ LES DEUX CHEMINS SONT DÉSORMAIS À LA RACINE, et c'est le sens de la
    // correction du 26/08/2026 : l'exclusion ne s'applique plus qu'à un chemin
    // d'UN SEUL segment. `/fr/logo.png` traverse maintenant le middleware —
    // c'est voulu, `fr` est un segment de route, pas un dossier de fichiers.
    expect(motif.test("/logo.png"), "un fichier pointe doit etre exclu").toBe(false);
    expect(
      motif.test("/logopng"),
      "un chemin SANS point est exclu : le point n est pas echappe, et " +
        "l exclusion avale toutes les routes au lieu des seuls fichiers.",
    ).toBe(true);
  });

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * LA RÉÉCRITURE DU LIEN AU NOM DU VENDEUR N'AVALE AUCUNE ROUTE
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Depuis les migrations 182-183, `droplink.fr/<nom>/<jeton>` sert la page
   * client. La décision est prise au bord, AVANT la négociation de langue, sur
   * tout chemin que le matcher laisse passer.
   *
   * ⚠️ C'EST LA PREMIÈRE FOIS QUE LE MIDDLEWARE DÉTOURNE UNE REQUÊTE AU LIEU DE
   * LA LAISSER PASSER. Une exclusion trop large coûtait jusqu'ici une couche de
   * défense ; une RÉÉCRITURE trop large envoie une page du produit vers la page
   * client, qui rend 404 — et rien, nulle part, ne dirait pourquoi.
   *
   * La sonde INVENTORIE les routes réelles et les éprouve avec des valeurs de
   * segment dynamique HOSTILES : celles qui ont exactement la forme d'un jeton.
   * Un identifiant de commande poli n'y ressemble pas ; celui que le visiteur
   * choisit, si.
   */
  const VALEURS_EN_FORME_DE_JETON = [
    "xK9mQ2pL7vR4nT8wY3zB1", // 21, la longueur réellement produite aujourd'hui
    "abcdefghijklmnop", // 16, la borne basse
    "a".repeat(64), // 64, la borne haute
  ];

  test("la réécriture du lien au nom n'avale aucune route de l'application", () => {
    const avalees: string[] = [];
    let eprouvees = 0;

    for (const route of routesDeclarees()) {
      for (const langue of LANGUES) {
        for (const valeur of VALEURS_EN_FORME_DE_JETON) {
          const concret = route
            .replace("[locale]", langue)
            .replace(/\[[^\]]+\]/g, valeur);

          // Hors du matcher, la décision ne s'exécute jamais : l'y éprouver
          // inventerait un défaut que le produit ne peut pas rencontrer.
          if (!motif.test(concret)) continue;

          eprouvees += 1;
          if (lireLienAuNom(concret) !== null) avalees.push(concret);
        }
      }
    }

    // UN ENSEMBLE VIDE PASSE TOUT. Si le matcher venait à tout exclure, la
    // boucle ci-dessus ne testerait rien et ce contrôle serait vert.
    expect(
      eprouvees,
      "aucune route ne traverse le middleware : la sonde vise à côté",
    ).toBeGreaterThan(0);

    expect(
      avalees,
      "Ces routes RÉELLES seraient détournées vers la page client, qui rendrait " +
        "404 : " + avalees.join(", "),
    ).toEqual([]);
  });

  test("la sonde éprouve bien la forme qui DÉCLENCHE la réécriture", () => {
    /*
     * CONTRE-TEST POSITIF, ET IL N'EST PAS DÉCORATIF.
     *
     * Le contrôle ci-dessus passerait à 100 % si `lireLienAuNom` rendait
     * toujours `null` — c'est-à-dire si la fonctionnalité était morte. Il faut
     * donc établir que les valeurs employées SONT capables de déclencher une
     * réécriture quand le premier segment n'est pas une langue.
     */
    for (const valeur of VALEURS_EN_FORME_DE_JETON) {
      expect(
        lireLienAuNom(`/atelier-nord/${valeur}`),
        `« ${valeur} » ne déclenche aucune réécriture : la sonde ci-dessus ne prouve rien`,
      ).toEqual({ nom: "atelier-nord", jeton: valeur });
    }
  });

  test("un lien brandé traverse le matcher — sinon la réécriture n'a jamais lieu", () => {
    /*
     * ⚠️ LE MATCHER EST LA CONDITION D'EXISTENCE DE LA FONCTIONNALITÉ.
     *
     * `lireLienAuNom` peut être parfaite : si `/atelier-nord/<jeton>` est exclu
     * du middleware, elle n'est jamais appelée et chaque lien brandé rend 404.
     * L'exclusion `[^/]+\.[^/]+$` ne vise qu'un chemin d'UN SEUL segment, et
     * c'est précisément ce qui rend ce cas sûr — mais une protection dont
     * personne n'a vérifié l'effet n'est pas une protection.
     */
    expect(motif.test("/atelier-nord/xK9mQ2pL7vR4nT8wY3zB1")).toBe(true);
    expect(motif.test("/Atelier-Nord/xK9mQ2pL7vR4nT8wY3zB1")).toBe(true);
  });
});
