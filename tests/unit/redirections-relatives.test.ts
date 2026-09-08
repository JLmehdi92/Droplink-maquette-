import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * AUCUNE REDIRECTION NE SE CONSTRUIT DEPUIS L'URL DE LA REQUÊTE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MESURÉ EN PRODUCTION LE 08/09/2026, SUR LA PREMIÈRE CONNEXION GOOGLE RÉELLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Wassim s'est connecté avec Google et a atterri sur `localhost:8080`,
 * `ERR_CONNECTION_REFUSED`. Relevé aussitôt sur le produit servi — les TROIS
 * route handlers qui redirigent envoyaient tous vers la machine interne :
 *
 *   GET  /fr/auth/retour     → location: https://localhost:8080/fr/connexion?erreur=lien
 *   POST /fr/deconnexion     → location: https://localhost:8080/fr/connexion?info=deconnecte
 *   POST /fr/commandes/geste → location: https://localhost:8080/fr/connexion?erreur=session
 *
 * `NextResponse.redirect()` exige une URL ABSOLUE, qu'on fabriquait par
 * `new URL(chemin, requete.url)`. Derrière le proxy de Railway, `requete.url`
 * porte l'adresse par laquelle le CONTENEUR a été joint, pas celle que le
 * navigateur a demandée.
 *
 * ⚠️ INVISIBLE EN DÉVELOPPEMENT PAR CONSTRUCTION : sans proxy, `requete.url`
 * porte `localhost:3000`, et c'est la bonne réponse. Toutes les sondes du dépôt
 * tournent en local. Le même angle mort que la région Railway.
 *
 * ⚠️ ET LE CHEMIN LE PLUS GRAVE N'ÉTAIT PAS GOOGLE : la même route sert la
 * RÉINITIALISATION DE MOT DE PASSE, seul recours d'un utilisateur enfermé
 * dehors depuis la suppression du lien magique. Cassée depuis le premier
 * déploiement, sans qu'aucun signal ne parte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE TEST PROUVE — ET CE QU'IL NE PROUVE PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Il prouve que le MOTIF fautif a disparu du code. C'est un contrôle textuel,
 * donc il ne prouve PAS que le `Location` servi est correct — *un contrôle qui
 * cherche un mot ne prouve rien* (L-020). La preuve d'EFFET vit dans
 * `scripts/fumee.mjs`, qui relève le `Location` réellement émis par les trois
 * routes et refuse tout hôte.
 *
 * Les deux sont nécessaires et aucun ne remplace l'autre : la fumée tourne en
 * local, où un `new URL(…, requete.url)` redonnerait le BON hôte et resterait
 * verte. C'est ce test-ci, et lui seul, qui attrape le retour du motif.
 */

/** Les motifs qui fabriquent une redirection depuis l'adresse d'arrivée. */
const INTERDITS: ReadonlyArray<{ motif: RegExp; pourquoi: string }> = [
  {
    motif: /NextResponse\.redirect\s*\(/,
    pourquoi:
      "NextResponse.redirect() exige une URL absolue, donc une base — et la " +
      "seule base disponible dans un route handler est l'adresse interne du " +
      "conteneur. Employer redirigerVers() de @/lib/http/rediriger.",
  },
  {
    motif: /new\s+URL\s*\([^)]*\b(?:requete|request|req)\.url/,
    pourquoi:
      "`<requete>.url` est l'adresse par laquelle le conteneur a été joint " +
      "(localhost:8080 chez Railway), jamais celle que le navigateur a " +
      "demandée. Une redirection RELATIVE laisse le navigateur résoudre.",
  },
];

/**
 * Les fichiers autorisés à porter un motif interdit, avec leur raison.
 *
 * ⚠️ VIDE, ET C'EST LE TEST CI-DESSOUS QUI L'A IMPOSÉ. J'y avais inscrit
 * `lib/http/rediriger.ts`, en croyant devoir exempter le module qui DÉCRIT le
 * défaut qu'il corrige — sa prose cite `NextResponse.redirect()` et
 * `new URL(chemin, requete.url)` mot pour mot. Le contrôle « aucune exception
 * ne survit » l'a immédiatement refusée : commentaires retirés, ce fichier ne
 * porte AUCUN motif interdit, donc l'exemption ne couvrait rien.
 *
 * Elle aurait pourtant été inoffensive à écrire et permanente à vivre : le
 * premier `NextResponse.redirect()` réellement ajouté là serait passé sans
 * bruit, couvert par une dérogation devenue sans objet. C'est exactement ce que
 * ce contrôle existe pour empêcher.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map();

const RACINE = join(process.cwd(), "src");

/** Le code d'un fichier, commentaires retirés (L-031). */
function codeSansCommentaires(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** Tous les fichiers TypeScript de `src`, chemins relatifs à `src`. */
function fichiersDeSrc(): string[] {
  return readdirSync(RACINE, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => f.split("\\").join("/"))
    .sort();
}

describe("Les redirections des route handlers sont relatives", () => {
  test("la sonde balaie réellement le code source", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Si la lecture récursive cassait, le contrôle
    // suivant porterait sur une liste vide et resterait vert sans rien prouver.
    const fichiers = fichiersDeSrc();
    expect(fichiers.length, "aucun fichier lu sous src/ : la sonde vise à côté").toBeGreaterThan(80);
    expect(fichiers, "le module de redirection est introuvable").toContain("lib/http/rediriger.ts");
    expect(fichiers, "le retour d'authentification est introuvable").toContain(
      "app/[locale]/auth/retour/route.ts",
    );
  });

  test("le retrait des commentaires n'a pas vidé les fichiers", () => {
    const code = codeSansCommentaires(join(RACINE, "app", "[locale]", "auth", "retour", "route.ts"));
    expect(code.length, "le dépouilleur a vidé le fichier").toBeGreaterThan(800);
    expect(code, "le dépouilleur a mangé le code au lieu des commentaires").toContain(
      "export async function GET",
    );
  });

  test("la sonde SAIT reconnaître les motifs interdits", () => {
    // CONTRE-TEST POSITIF. Une expression régulière cassée ne trouverait plus
    // rien nulle part — et le contrôle suivant passerait à 100 % en ne
    // regardant rien. On lui fait donc reconnaître les formes exactes qui
    // étaient dans le produit le 08/09 au matin.
    const avant = [
      'return NextResponse.redirect(new URL(`/${langue}/connexion?erreur=lien`, requete.url));',
      'NextResponse.redirect(new URL("/" + langue + "/commandes", requete.url), 303)',
      "NextResponse.redirect(new URL(resultat.destination, request.url), 303)",
    ];
    for (const ligne of avant) {
      const vus = INTERDITS.filter(({ motif }) => motif.test(ligne));
      expect(vus.length, `aucun motif ne reconnaît : ${ligne}`).toBeGreaterThan(0);
    }
  });

  test("AUCUN fichier ne construit une redirection depuis l'adresse d'arrivée", () => {
    const fautes: string[] = [];
    for (const relatif of fichiersDeSrc()) {
      if (EXCEPTIONS.has(relatif)) continue;
      const code = codeSansCommentaires(join(RACINE, relatif));
      for (const { motif, pourquoi } of INTERDITS) {
        if (motif.test(code)) fautes.push(`${relatif} → ${pourquoi}`);
      }
    }
    expect(
      fautes,
      "Ces fichiers fabriquent une redirection depuis l'URL de la requête. " +
        "Derrière un proxy, elle porte l'adresse interne du conteneur — mesuré " +
        "le 08/09/2026 : location: https://localhost:8080/…",
    ).toEqual([]);
  });

  test("aucune exception ne survit à ce qu'elle exemptait", () => {
    // Une exception qu'on oublie de retirer devient l'autorisation permanente
    // d'un défaut, prête à couvrir le prochain motif qu'on écrira là.
    const perimees = [...EXCEPTIONS.keys()].filter((relatif) => {
      const code = codeSansCommentaires(join(RACINE, relatif));
      return !INTERDITS.some(({ motif }) => motif.test(code));
    });
    expect(
      perimees,
      "Ces exceptions ne couvrent plus aucun motif interdit : les retirer.",
    ).toEqual([]);
  });
});

/**
 * LA GARDE ANTI-REDIRECTION-OUVERTE DE `redirigerVers`.
 *
 * ⚠️ CE BLOC EXISTE PARCE QUE LA GARDE ÉTAIT ÉCRITE SANS ÊTRE ÉPROUVÉE — et
 * *un test qui constate qu'une déclaration existe ne prouve jamais que son
 * absence bloque* (L-018).
 *
 * Le risque est réel et daté : le produit a eu une redirection ouverte le
 * 01/09/2026. Construire les redirections à la main au lieu de passer par
 * `new URL()` remet ce risque sur la table, parce que `//exemple-mal.tld/x`
 * est une référence relative AU PROTOCOLE : elle commence bien par `/`, elle
 * franchirait un contrôle naïf, et un navigateur la résout vers un AUTRE
 * DOMAINE.
 */
describe("redirigerVers refuse de sortir du domaine", () => {
  test("un chemin normal passe intact, dans les deux statuts", async () => {
    // CONTRE-TEST D'ABORD : une fonction qui refuserait TOUT passerait les
    // contrôles suivants à 100 % sans rien protéger.
    const { redirigerVers } = await import("@/lib/http/rediriger");
    const r = redirigerVers("/fr/connexion?erreur=lien");
    expect(r.headers.get("location")).toBe("/fr/connexion?erreur=lien");
    expect(r.status).toBe(307);
    expect(redirigerVers("/fr/commandes", 303).status).toBe(303);
  });

  test("aucune forme ne fait sortir du domaine", async () => {
    const { redirigerVers } = await import("@/lib/http/rediriger");
    const hostiles = [
      "//exemple-mal.tld/x", // relative au protocole — le cas qui compte
      "///exemple-mal.tld",
      "https://exemple-mal.tld/x",
      "http://exemple-mal.tld",
      "fr/commandes", // sans `/` initial : résolu relativement, imprévisible
      "",
    ];
    for (const chemin of hostiles) {
      const lieu = redirigerVers(chemin).headers.get("location");
      expect(lieu, `« ${chemin} » n'a pas été neutralisé`).toBe("/");
    }
  });
});
