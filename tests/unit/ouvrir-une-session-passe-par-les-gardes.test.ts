import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * TOUT CHEMIN QUI OUVRE UNE SESSION DOIT TRAVERSER `suivreApresSession`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE GARDE N'EXISTAIT PAS, ET POURQUOI ELLE EXISTE AUJOURD'HUI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `lib/comptes/apres-session.ts` porte quatre gardes que RIEN d'autre ne
 * porte :
 *
 *   1. l'interrupteur d'inscription — un admin qui ferme les inscriptions ;
 *   2. l'événement `INSCRIPTION`, réclamé en base — c'est le DÉNOMINATEUR du
 *      taux d'activation, donc la métrique de verdict de toute la phase de
 *      validation ;
 *   3. le profil introuvable ;
 *   4. le compte suspendu.
 *
 * Le commentaire en tête de `auth/retour/route.ts` affirme depuis le
 * 01/09/2026 qu'elles sont « appelées par les trois chemins qui ouvrent une
 * session ». C'était vrai. **Aucun test ne l'exigeait**, et la mémoire du
 * projet affirmait pourtant qu'un tel test existait : L-014 dans sa forme
 * exacte — un document affirme un état que personne n'a exécuté.
 *
 * ⚠️ ET LE TROU A CHANGÉ DE NATURE LE 08/09/2026. Jusque-là, le chemin OAuth
 * était INERTE : `external.google = false`, `AUTH_GOOGLE_ACTIF` absente. Retirer
 * l'appel n'aurait rien cassé d'observable, faute d'utilisateur pour l'emprunter.
 * Google est activé depuis ce jour — mesuré : `external.google = true`,
 * `/authorize` rend 302 vers `accounts.google.com`, et le bouton est servi sur
 * `https://droplink.fr/fr/connexion` dans un vrai `<form method="POST">`.
 *
 * C'est L-029 arrivé à échéance : *une protection qui tient à une ABSENCE n'est
 * pas une protection*. La phrase juste était « ce serait ouvert si quelqu'un
 * activait Google » — quelqu'un vient de l'activer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LA SONDE FAIT, ET CE QU'ELLE REFUSE DE FAIRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ELLE INVENTORIE, ELLE NE SÉLECTIONNE PAS. Un contrôle qui citerait les deux
 * fichiers connus ne verrait jamais le troisième — et le troisième est
 * précisément celui qu'on ajoutera sans y penser. Elle balaie donc TOUT
 * `src/app`, retient les fichiers qui appellent une méthode ouvrant réellement
 * une session, et exige l'appel dans chacun.
 *
 * ⚠️ ELLE LIT LE CODE, COMMENTAIRES RETIRÉS (L-031). `auth/retour/route.ts`
 * DÉCRIT longuement ces gardes dans sa prose, et `profil.ts` cite
 * `signInWithPassword` dans un commentaire sans jamais l'appeler : un contrôle
 * textuel naïf se satisferait du texte qui décrit la garde au lieu de la garde,
 * et signalerait un fichier qui n'ouvre aucune session.
 *
 * ELLE ÉCHOUE DANS LES DEUX SENS : un chemin qui ouvre une session sans appeler
 * la garde, ET une exception déclarée qui n'ouvre plus rien — une exception
 * qu'on oublie de retirer devient l'autorisation permanente d'un défaut.
 */

/**
 * Les méthodes qui OUVRENT une session — celles après lesquelles le client
 * Supabase a posé les cookies et l'appelant est authentifié.
 *
 * `signInWithOAuth` n'y est PAS, et c'est délibéré : elle ne fait que rendre
 * une URL vers le fournisseur. La session naît au RETOUR, dans
 * `exchangeCodeForSession` — que cette liste contient.
 */
const OUVRE_UNE_SESSION = [
  "signInWithPassword",
  "auth.signUp",
  "exchangeCodeForSession",
  "verifyOtp",
  "setSession",
] as const;

/**
 * Les fichiers autorisés à ouvrir une session SANS appeler la garde, avec la
 * raison de chacun.
 *
 * VIDE AUJOURD'HUI, ET C'EST UNE INFORMATION. La seule dérogation du produit
 * vit à l'INTÉRIEUR de `auth/retour/route.ts` : la branche
 * `suite=mot-de-passe` mène à l'écran de saisie plutôt qu'aux commandes, et
 * reprend à la main les deux gardes qui comptent là (profil, suspension). Le
 * fichier, lui, appelle bien `suivreApresSession` sur son autre branche — donc
 * il n'a pas besoin d'être exempté, et il ne doit pas l'être : l'exempter
 * couvrirait aussi le chemin Google.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map();

const RACINE = join(process.cwd(), "src", "app");

/** Le code d'un fichier, commentaires retirés. */
function codeSansCommentaires(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

/** Tous les fichiers TypeScript de `src/app`, chemins relatifs à `src/app`. */
function fichiersDeLApp(): string[] {
  return readdirSync(RACINE, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => f.split("\\").join("/"))
    .sort();
}

/** Les fichiers qui ouvrent réellement une session, et par quelle méthode. */
function ouvreursDeSession(): Array<{ fichier: string; methodes: string[]; code: string }> {
  const trouves: Array<{ fichier: string; methodes: string[]; code: string }> = [];
  for (const relatif of fichiersDeLApp()) {
    const code = codeSansCommentaires(join(RACINE, relatif));
    const methodes = OUVRE_UNE_SESSION.filter((m) => code.includes(m));
    if (methodes.length > 0) trouves.push({ fichier: relatif, methodes: [...methodes], code });
  }
  return trouves;
}

describe("Ouvrir une session passe par les gardes d'après-session", () => {
  test("la sonde balaie réellement l'application", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Si la lecture récursive cassait — un
    // changement d'API Node, une racine erronée —, tous les contrôles suivants
    // porteraient sur une liste vide et resteraient verts sans rien prouver.
    const fichiers = fichiersDeLApp();
    expect(fichiers.length, "aucun fichier lu sous src/app : la sonde vise à côté").toBeGreaterThan(
      40,
    );
    expect(
      fichiers,
      "le chemin de retour d'authentification est introuvable : l'arborescence a changé",
    ).toContain("[locale]/auth/retour/route.ts");
  });

  test("le retrait des commentaires n'a pas vidé les fichiers", () => {
    // Ces fichiers sont TRÈS commentés. Un dépouilleur trop gourmand rendrait
    // les contrôles suivants impossibles à échouer autrement que par accident.
    const code = codeSansCommentaires(join(RACINE, "[locale]", "auth", "retour", "route.ts"));
    expect(code.length, "le dépouilleur a vidé le fichier de retour").toBeGreaterThan(800);
    expect(code, "le dépouilleur a mangé le code, pas les commentaires").toContain(
      "export async function GET",
    );
  });

  test("la sonde trouve au moins les deux chemins connus", () => {
    // CONTRE-TEST POSITIF. Une sonde qui ne trouverait AUCUN ouvreur validerait
    // le produit en ne regardant rien.
    const fichiers = ouvreursDeSession().map((o) => o.fichier);
    expect(fichiers, "le retour PKCE n'est pas vu comme ouvrant une session").toContain(
      "[locale]/auth/retour/route.ts",
    );
    expect(fichiers, "les actions de connexion ne sont pas vues comme ouvrant une session").toContain(
      "[locale]/connexion/actions.ts",
    );
  });

  test("CHAQUE chemin qui ouvre une session appelle suivreApresSession", () => {
    const manquants = ouvreursDeSession()
      .filter(({ fichier }) => !EXCEPTIONS.has(fichier))
      .filter(({ code }) => !code.includes("suivreApresSession"))
      .map(({ fichier, methodes }) => `${fichier} (${methodes.join(", ")})`);

    expect(
      manquants,
      "Ces chemins ouvrent une session sans traverser les quatre gardes " +
        "(interrupteur d'inscription, événement INSCRIPTION, profil introuvable, " +
        "compte suspendu). Soit ils appellent suivreApresSession, soit ils " +
        "entrent dans EXCEPTIONS avec leur raison écrite.",
    ).toEqual([]);
  });

  test("aucune exception ne survit à ce qu'elle exemptait", () => {
    // Une exception qu'on oublie de retirer devient l'autorisation permanente
    // d'un défaut : elle est écrite pour un fichier qui ouvrait une session, et
    // reste en place quand ce n'est plus le cas — prête à couvrir le prochain
    // appel qu'on ajoutera dans ce fichier sans y penser.
    const ouvreurs = new Set(ouvreursDeSession().map((o) => o.fichier));
    const perimees = [...EXCEPTIONS.keys()].filter((f) => !ouvreurs.has(f));
    expect(
      perimees,
      "Ces exceptions ne couvrent plus aucun ouvreur de session : les retirer.",
    ).toEqual([]);
  });
});
