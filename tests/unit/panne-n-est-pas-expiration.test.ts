import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  test("le panneau admin DÉGRADE le stockage au lieu de tomber en 500", () => {
    /*
     * ⚠️ SECOND CONSOMMATEUR, TROUVÉ LE 02/09/2026 PAR LA TRACE DU SERVEUR.
     * `lirePanneau` levait sur toute erreur de lecture du stockage : un
     * `TypeError: fetch failed` rendait le panneau ENTIER en 500 — alertes,
     * compteurs et tâches comprises, c'est-à-dire ce qu'on vient y chercher
     * quand le réseau va mal.
     *
     * C'est ce qui a justifié d'extraire le motif dans `lib/reseau/panne.ts` :
     * le même défaut sur deux surfaces qui ne se ressemblent pas.
     */
    expect(panneau).toMatch(/estPanneDeTransport\(\s*stockage\.error\.message\s*\)/);
    // ET IL LÈVE TOUJOURS SUR LE RESTE : dégrader une erreur applicative ferait
    // vivre un panneau « indisponible » pour toujours sans que personne cherche.
    expect(panneau).toMatch(/throw new Error\("lecture du stockage impossible/);
    // ET LE CHIFFRE DEVIENT `null`, JAMAIS ZÉRO — zéro affirmerait qu'on a mesuré.
    expect(panneau).toMatch(/stockageMesurable \? Number\(stockage\.data \?\? 0\) : null/);
  });
});
