import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * UNE PANNE DE TRANSPORT NE SE DIT PAS « VOTRE SESSION A EXPIRÉ ».
 *
 * ⚠️ DÉFAUT MESURÉ LE 02/09/2026. `lireProfilVendeur` traitait toute erreur de
 * `getUser()` comme une session refusée. Le commentaire en énumérait trois
 * causes — révoquée, expirée, compte disparu — et en oubliait une quatrième :
 * le serveur d'authentification INJOIGNABLE.
 *
 * Sur 200 requêtes authentifiées avec un cookie valide, par vagues de 25 en
 * parallèle, DEUX ont été éjectées — à 11,1 s et 11,4 s, soit juste au-delà du
 * délai de connexion de dix secondes. Le vendeur était renvoyé vers
 * `?erreur=session` et lisait « Votre session a expiré. »
 *
 * C'est le principe XII à l'envers : l'interface AFFIRME un état que la base
 * n'a jamais enregistré. Et le même chemin sert la sauvegarde automatique de
 * l'éditeur — le message tombe donc pendant qu'il tape, c'est-à-dire au moment
 * où il a du texte non enregistré.
 *
 * ⚠️ L'ACCÈS RESTE REFUSÉ. On ne devient pas permissif : la garde redirige
 * toujours. Seule la PHRASE change, et elle devient vraie.
 *
 * ⚠️ CE CONTRÔLE INTERROGE LA FONCTION, PAS LE TEXTE DU FICHIER. Il importe
 * `estPanneDeTransport` et lui donne les messages réels, des deux familles :
 * un contrôle qui chercherait le mot « fetch failed » dans la source prouverait
 * qu'une chaîne existe, jamais qu'une décision est prise.
 */

/*
 * La fonction n'est pas exportée — elle n'a aucune raison de l'être pour le
 * produit. On l'éprouve donc par le MOTIF qu'elle emploie, lu dans la source et
 * réinstancié ici : ce qui est vérifié reste le comportement du motif sur des
 * messages réels, pas sa présence.
 */
function motifDeTransport(): RegExp {
  const source = readFileSync(join(process.cwd(), "src", "lib", "reseau", "panne.ts"), "utf8");
  const trouve = /return \/(.+?)\/i\.test\(/.exec(source);
  expect(trouve, "le motif de panne de transport a disparu de `lib/reseau/panne.ts`").not.toBeNull();
  return new RegExp(trouve?.[1] ?? "$^", "i");
}

describe("Distinguer une panne d'une session refusée", () => {
  const motif = motifDeTransport();

  const PANNES = [
    "fetch failed",
    "TypeError: fetch failed",
    "connect ETIMEDOUT 104.18.38.10:443",
    "read ECONNRESET",
    "connect ECONNREFUSED 127.0.0.1:54321",
    "getaddrinfo EAI_AGAIN db.supabase.co",
    "socket hang up",
    "Connect Timeout Error (attempted address: db.supabase.co:443, timeout: 10000ms)",
    "The operation was aborted due to timeout",
    "terminated",
  ];

  const REFUS = [
    "Invalid login credentials",
    "session_not_found",
    "Session from session_id claim in JWT does not exist",
    "JWT expired",
    "User from sub claim in JWT does not exist",
    "Auth session missing!",
    "invalid claim: missing sub claim",
  ];

  test("les deux familles sont réellement peuplées", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : sans ces deux bornes, une expression
    // régulière qui ne reconnaîtrait RIEN passerait la moitié basse, et une qui
    // reconnaîtrait TOUT passerait la moitié haute.
    expect(PANNES.length).toBeGreaterThanOrEqual(8);
    expect(REFUS.length).toBeGreaterThanOrEqual(6);
  });

  test.each(PANNES)("« %s » est une panne de transport", (message) => {
    expect(motif.test(message)).toBe(true);
  });

  test.each(REFUS)("« %s » est un REFUS, jamais une panne", (message) => {
    /*
     * LA MOITIÉ QUI COMPTE. Élargir ce motif transformerait la distinction en
     * machine à laisser passer des sessions refusées : un `session_not_found`
     * pris pour une panne ferait dire « réessayez dans un instant » à quelqu'un
     * dont la session est bel et bien révoquée — et l'accès resterait refusé
     * sans qu'il comprenne pourquoi.
     */
    expect(motif.test(message)).toBe(false);
  });

  test("le motif « service » est déclaré à l'écran de connexion, et traduit", () => {
    const page = readFileSync(
      join(process.cwd(), "src", "app", "[locale]", "connexion", "page.tsx"),
      "utf8",
    );
    expect(page, "le motif n'est pas dans l'inventaire clos de la page").toContain('"service"');

    for (const langue of ["fr", "en"]) {
      const catalogue = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8"),
      ) as { connexion: { motif: Record<string, string> } };
      const texte = catalogue.connexion.motif.service;
      if (texte === undefined) throw new Error(`motif « service » absent du catalogue ${langue}`);
      // ET IL NE DIT PAS QUE LA SESSION A EXPIRÉ : c'est toute la correction.
      expect(texte.toLowerCase()).not.toMatch(/expir|expired/);
    }
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LE MOTIF NE SUFFIT PAS : IL FAUT QU'IL SOIT BRANCHÉ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ TROU RÉEL DE CE FICHIER, TROUVÉ EN LE FALSIFIANT. Les contrôles ci-dessus
 * éprouvent le MOTIF, et rien d'autre : en retirant la branche qui l'appelle —
 * donc en remettant exactement le défaut du 02/09 — ils restaient tous VERTS.
 * C'est L-018 dans sa forme exacte : *un test qui constate qu'une déclaration
 * existe ne prouve jamais que son absence bloque.*
 *
 * ⚠️ ET IL S'APPLIQUE AU CODE, COMMENTAIRES RETIRÉS (L-031). Les deux fichiers
 * DÉCRIVENT cette correction dans leurs commentaires, longuement ; un contrôle
 * textuel naïf se satisferait de la prose qui décrit la garde au lieu de la
 * garde.
 */
function codeSansCommentaires(...chemin: string[]): string {
  return readFileSync(join(process.cwd(), ...chemin), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

describe("La distinction est CÂBLÉE, pas seulement déclarée", () => {
  const profil = codeSansCommentaires("src", "lib", "comptes", "profil.ts");
  const garde = codeSansCommentaires("src", "lib", "comptes", "apres-session.ts");
  const panneau = codeSansCommentaires("src", "lib", "audit", "panneau.ts");

  test("le retrait des commentaires n'a pas vidé les fichiers", () => {
    // UN ENSEMBLE VIDE PASSE TOUT — et ces deux fichiers sont très commentés :
    // un dépouilleur trop gourmand rendrait les quatre contrôles suivants
    // impossibles à échouer autrement que par accident.
    expect(profil.length).toBeGreaterThan(1500);
    expect(garde.length).toBeGreaterThan(1500);
  });

  test("`lireProfilAvec` consulte le motif AVANT de rendre « pas de session »", () => {
    expect(profil).toMatch(/estPanneDeTransport\(\s*session\.error\.message\s*\)/);
    expect(profil).toMatch(/throw new SessionIndisponible\(/);
  });

  test("la garde du vendeur rattrape la panne et l'envoie sur « service »", () => {
    expect(garde).toMatch(/instanceof SessionIndisponible/);
    expect(garde).toMatch(/cheminDeRefus\(\s*langue\s*,\s*"service"\s*\)/);
  });

  test("elle ne rattrape QUE celle-là — tout le reste continue de remonter", () => {
    /*
     * Un `catch` qui avale ce qu'il ne reconnaît pas transformerait n'importe
     * quelle panne — une erreur de programmation comprise — en « le service est
     * momentanément injoignable », c'est-à-dire en une seconde affirmation
     * fausse posée pour en corriger une première.
     */
    expect(garde).toMatch(/if\s*\(!\(erreur instanceof SessionIndisponible\)\)\s*throw erreur;/);
  });

  test("le panneau admin passe par la RÈGLE PARTAGÉE, sans en recopier une variante", () => {
    /*
     * ⚠️ CE CONTRÔLE A CHANGÉ DE FORME LE 04/09/2026, ET LA RAISON COMPTE.
     *
     * Il cherchait `estPanneDeTransport(stockage.error.message)` — un MOTIF
     * TEXTUEL, posé sur la seule lecture qui avait échoué le 02/09. Il est
     * devenu ROUGE le jour où le produit s'est AMÉLIORÉ : les quatre lectures
     * du panneau passent désormais par `lectureIllisible()`, règle unique
     * extraite après que le même défaut a été corrigé QUATRE fois. *Une garde
     * qui rougit sur un progrès gardait une forme, pas une propriété.*
     *
     * CE QU'IL VÉRIFIE MAINTENANT : que le panneau n'ait pas RECOPIÉ une
     * variante locale — c'est la seule chose que le texte puisse établir ici, et
     * c'est exactement par recopie que la règle a divergé quatre fois. La
     * propriété, elle, est éprouvée PAR EXÉCUTION dans
     * `panneau-degrade-le-journal.test.ts` et `surveillance-degrade.test.ts`,
     * qui APPELLENT les fonctions au lieu de lire leur source.
     */
    expect(panneau).toContain("lectureIllisible");
    expect(
      panneau,
      "le panneau a de nouveau sa propre copie de la règle : c'est ainsi qu'elle a divergé quatre fois",
    ).not.toContain("if (!estPanneDeTransport(");
  });
});

/**
 * PERSONNE NE RECOPIE LA RÈGLE — inventaire, pas sélection.
 *
 * ⚠️ CE BLOC EXISTE PARCE QUE LA RECOPIE EST LE MÉCANISME EXACT DE LA PANNE.
 * Le même défaut a été corrigé CINQ fois entre le 02/09 et le 04/09 — stockage,
 * aperçu du journal, état des tâches, surveillance, analyses — et chaque fois
 * en écrivant sur place une variante de la même condition. Une garde nominative
 * sur `panneau.ts` aurait laissé passer la sixième.
 *
 * `estPanneDeTransport` ne doit donc être appelée QUE depuis `panne.ts`. Partout
 * ailleurs on passe par `lectureIllisible()`, qui décide, journalise et lève de
 * la même façon pour tout le monde.
 */
describe("La règle de dégradation n'a qu'un seul exemplaire", () => {
  const RACINE = join(process.cwd(), "src", "lib");

  /** Tous les `.ts` de `src/lib`, code seul — commentaires retirés (L-031). */
  function sources(): readonly { readonly chemin: string; readonly code: string }[] {
    const sortie: { chemin: string; code: string }[] = [];
    const parcourir = (dossier: string): void => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const complet = join(dossier, e.name);
        if (e.isDirectory()) parcourir(complet);
        else if (e.name.endsWith(".ts")) {
          sortie.push({
            chemin: complet,
            code: readFileSync(complet, "utf8")
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .replace(/(^|[^:])\/\/.*$/gm, "$1"),
          });
        }
      }
    };
    parcourir(RACINE);
    return sortie;
  }

  const fichiers = sources();

  test("la sonde lit réellement le dépôt", () => {
    // ⚠️ EN PREMIER : un ensemble vide passe tout.
    expect(fichiers.length).toBeGreaterThan(40);
    expect(
      fichiers.some((f) => f.chemin.endsWith(join("reseau", "panne.ts"))),
      "la sonde ne trouve même pas le module qu'elle garde",
    ).toBe(true);
  });

  test("CONTRE-TEST : la règle EST employée, et par plusieurs modules", () => {
    // Sans lui, « personne ne la recopie » serait aussi vrai d'une règle que
    // personne n'appelle — c'est-à-dire d'un produit qui ne dégrade nulle part.
    const appelants = fichiers.filter((f) => f.code.includes("lectureIllisible("));
    expect(
      appelants.length,
      "moins de trois modules dégradent : la règle ne sert presque personne",
    ).toBeGreaterThanOrEqual(3);
  });

  /**
   * L'INVENTAIRE DÉCLARE SES EXCEPTIONS AVEC LEUR RAISON, et il échoue DANS LES
   * DEUX SENS.
   *
   * ⚠️ CETTE EXCEPTION A ÉTÉ TROUVÉE PAR LA SONDE ELLE-MÊME, au premier
   * passage : j'ignorais que `comptes/profil.ts` employait la primitive. C'est
   * tout l'argument de l'inventaire — *un contrôle ne doit pas dépendre de ce
   * que son auteur a pensé à inspecter.*
   *
   * Et ce n'est PAS une recopie : ce module ne dégrade pas une section d'écran,
   * il distingue « session expirée » de « service injoignable » pour lever
   * `SessionIndisponible`. Les deux usages n'ont que le prédicat en commun.
   */
  const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
    [
      join("comptes", "profil.ts"),
      "Il ne lit pas une section d'écran : il distingue une session expirée d'un " +
        "service injoignable, pour lever SessionIndisponible plutôt que de renvoyer " +
        "un vendeur connecté vers la page de connexion. Deux éjections mesurées sur " +
        "200 requêtes, à 11,1 s et 11,4 s.",
    ],
  ]);

  test("chaque exception déclarée porte une raison, pas seulement un nom", () => {
    for (const [nom, raison] of EXCEPTIONS) {
      expect(raison.length, nom + " : raison trop courte pour être une raison").toBeGreaterThan(80);
    }
  });

  test("seul `panne.ts` appelle `estPanneDeTransport`, hors exceptions déclarées", () => {
    const intrus = fichiers
      .filter((f) => !f.chemin.endsWith(join("reseau", "panne.ts")))
      .filter((f) => ![...EXCEPTIONS.keys()].some((e) => f.chemin.endsWith(e)))
      .filter((f) => f.code.includes("estPanneDeTransport("))
      .map((f) => f.chemin.replace(process.cwd(), ""));
    expect(
      intrus,
      "ces modules recopient la règle au lieu de l'appeler — c'est ainsi qu'elle a divergé cinq fois",
    ).toEqual([]);
  });

  test("L'AUTRE SENS : une exception déclarée qui n'emploierait plus la primitive", () => {
    // Une liste qui garde des noms morts finit par tout autoriser, parce que
    // plus personne ne la relit.
    for (const nom of EXCEPTIONS.keys()) {
      const fichier = fichiers.find((f) => f.chemin.endsWith(nom));
      expect(fichier, "exception déclarée pour " + nom + ", qui n'existe plus").toBeDefined();
      expect(
        (fichier?.code ?? "").includes("estPanneDeTransport("),
        nom + " n'appelle plus la primitive : l'exception est périmée",
      ).toBe(true);
    }
  });
});

/**
 * PERSONNE NE LIT LA SESSION SANS DIRE LA PANNE — inventaire de `src/app`
 * (27/09/2026).
 *
 * ⚠️ DÉFAUT RÉEL, RÉVÉLÉ PAR UNE VRAIE PANNE DE SUPABASE PENDANT LA FUMÉE. Les
 * contrôles ci-dessus regardent `apres-session.ts`, là où la correction du 02/09
 * a été faite. Le layout de `(app)` lisait la session EN DIRECT, en parallèle de
 * la page : pendant la panne, la garde de la page redirigeait vers « service »,
 * et le 500 du layout gagnait — `/en/analyses` a rendu 500. L-025 à la lettre :
 * une garde écrite après coup hérite du champ de vision de la correction.
 * `/bienvenue` et `/nouveau-mot-de-passe` avaient le même trou, et les trois
 * routes d'export répondaient 404 (« rien ici ») au lieu de 503.
 *
 * LA RÈGLE : un fichier de `src/app` qui appelle `lireEtatDuCompte(` ou
 * `lireProfilVendeur(` doit —
 *   - route (`route.ts`) : rattraper `SessionIndisponible` lui-même ;
 *   - page ou layout : passer D'ABORD par `exigerVendeur(` ou
 *     `lireEtatOuDireLaPanne(`, qui disent la panne. La relecture mémoïsée qui
 *     suit ne peut plus lever : la première a réussi, ou elle a redirigé.
 */
const LECTURES_DIRECTES = ["lireEtatDuCompte(", "lireProfilVendeur("] as const;
const LECTEURS_QUI_DISENT_LA_PANNE = ["exigerVendeur(", "lireEtatOuDireLaPanne("] as const;

/** Rend la raison d'une violation, ou `null`. Pure : le contre-test l'éprouve seule. */
function lectureSansPanneDite(chemin: string, code: string): string | null {
  const indices = LECTURES_DIRECTES.map((m) => code.indexOf(m)).filter((i) => i >= 0);
  if (indices.length === 0) return null;
  if (chemin.endsWith("route.ts")) {
    return code.includes("instanceof SessionIndisponible")
      ? null
      : "route qui lit la session sans rattraper SessionIndisponible (404/500 au lieu de 503)";
  }
  const premiereLecture = Math.min(...indices);
  const gardes = LECTEURS_QUI_DISENT_LA_PANNE.map((m) => code.indexOf(m)).filter((i) => i >= 0);
  if (gardes.length === 0 || Math.min(...gardes) > premiereLecture) {
    return "lit la session AVANT exigerVendeur/lireEtatOuDireLaPanne : une panne d'auth y devient un 500";
  }
  return null;
}

describe("Personne ne lit la session sans dire la panne (inventaire de src/app)", () => {
  const racine = join(process.cwd(), "src", "app");
  const fichiers = (readdirSync(racine, { recursive: true }) as string[])
    .filter((f) => /(^|[\\/])(page\.tsx|layout\.tsx|route\.ts)$/.test(f))
    .map((f) => ({ chemin: f.split("\\").join("/"), code: codeSansCommentaires("src", "app", f) }));
  const lecteurs = fichiers.filter((f) =>
    [...LECTURES_DIRECTES, ...LECTEURS_QUI_DISENT_LA_PANNE].some((m) => f.code.includes(m)),
  );

  test("l'inventaire voit réellement des lecteurs de session", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : un parcours cassé rendrait la règle muette.
    expect(fichiers.length).toBeGreaterThan(40);
    expect(lecteurs.length).toBeGreaterThan(10);
  });

  test("CONTRE-TEST : la règle rougit sur une lecture directe non gardée", () => {
    expect(lectureSansPanneDite("x/layout.tsx", "const etat = await lireEtatDuCompte();")).not.toBeNull();
    expect(
      lectureSansPanneDite("x/page.tsx", "const p = await lireProfilVendeur(); await exigerVendeur(l);"),
      "une garde posée APRÈS la lecture ne protège rien",
    ).not.toBeNull();
    expect(lectureSansPanneDite("x/route.ts", "const p = await lireProfilVendeur().catch(() => null);")).not.toBeNull();
    // …et laisse passer les formes sûres.
    expect(lectureSansPanneDite("x/page.tsx", "await exigerVendeur(l); const p = await lireProfilVendeur();")).toBeNull();
    expect(
      lectureSansPanneDite("x/route.ts", "try { p = await lireProfilVendeur(); } catch (e) { if (e instanceof SessionIndisponible) {} }"),
    ).toBeNull();
  });

  test("chaque page, layout et route qui lit la session dit la panne", () => {
    const fautifs = fichiers
      .map((f) => ({ chemin: f.chemin, raison: lectureSansPanneDite(f.chemin, f.code) }))
      .filter((f) => f.raison !== null)
      .map((f) => `${f.chemin} : ${f.raison}`);
    expect(fautifs).toEqual([]);
  });
});
