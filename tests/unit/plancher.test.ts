import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PLANCHER_AUTH_MS, attendrePlancher } from "@/lib/auth/plancher";

describe("Délai plancher", () => {
  test("complète une opération rapide jusqu'au plancher", async () => {
    // L'horloge est injectée : mesurer une vraie attente rendrait le test
    // dépendant de la charge de la machine, donc capricieux — et un test qu'on
    // relance jusqu'au vert n'est plus bloquant.
    let faux = 1_000_000;
    const debut = faux;
    faux += 49; // le chemin « pas de compte » mesuré sur le vrai projet

    const avant = Date.now();
    await attendrePlancher(debut, 200, () => faux);
    const attenduReel = Date.now() - avant;

    expect(
      attenduReel,
      "une opération de 49 ms devrait être complétée jusqu'à 200 ms",
    ).toBeGreaterThanOrEqual(140);
  });

  test("n'ajoute RIEN à une opération déjà plus longue que le plancher", async () => {
    let faux = 1_000_000;
    const debut = faux;
    faux += 5_000;

    const avant = Date.now();
    await attendrePlancher(debut, 200, () => faux);
    expect(
      Date.now() - avant,
      "le plancher est un minimum, pas une pause ajoutée",
    ).toBeLessThan(60);
  });

  test("le plancher couvre l'écart mesuré sur le vrai projet", () => {
    // 49 ms sans compte contre 778 ms avec compte. Un plancher inférieur au
    // chemin lent laisserait l'écart visible, donc l'oracle intact — c'est
    // exactement le genre de correctif qui rassure sans rien corriger.
    expect(
      PLANCHER_AUTH_MS,
      "le plancher doit dépasser le chemin lent observé (778 ms), sinon les " +
        "deux chemins restent distinguables au chronomètre",
    ).toBeGreaterThan(778);
  });
});

describe("Garde structurel sur l'énumération de comptes", () => {
  const SOURCE = join(process.cwd(), "src", "app", "[locale]", "connexion", "actions.ts");

  /**
   * Le CODE, commentaires retirés.
   *
   * Le motif s'applique au code et non au fichier, sinon il se satisferait du
   * commentaire qui DÉCRIT la garde au lieu de la garde elle-même (L-031). Ce
   * fichier contient justement de longs commentaires qui citent les appels
   * cherchés ici.
   */
  function codeSansCommentaires(): string {
    return readFileSync(SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  /**
   * Le corps d'une action, découpé sur l'accolade fermante de premier niveau.
   *
   * Sans ce découpage, chaque contrôle regarderait le fichier ENTIER : l'ordre
   * « quota avant appel » serait satisfait par le quota d'une action et l'appel
   * d'une autre, et resterait vert avec les deux inversés dans la même fonction.
   * C'est exactement la forme de garde qui regarde là où le défaut n'est pas.
   */
  function corps(nom: string): string {
    const code = codeSansCommentaires();
    const debut = code.indexOf(`export async function ${nom}(`);
    if (debut === -1) return "";
    let i = code.indexOf("{", debut);
    let profondeur = 0;
    for (; i < code.length; i++) {
      if (code[i] === "{") profondeur++;
      else if (code[i] === "}") {
        profondeur--;
        if (profondeur === 0) return code.slice(debut, i + 1);
      }
    }
    return "";
  }

  /**
   * LES TROIS ACTIONS QUI TOUCHENT LE SERVEUR D'AUTHENTIFICATION, et l'appel de
   * chacune.
   *
   * ⚠️ CETTE LISTE A REMPLACÉ `signInWithOtp`, SEUL APPEL DU PRODUIT JUSQU'AU
   * 01/09/2026. Le lien magique supprimé, la sonde qui le cherchait est partie
   * en rouge — et elle avait raison : ce qu'elle vérifiait n'existait plus. La
   * remplacer par la liste des trois appels réels est la seule correction
   * honnête ; la faire taire aurait laissé les trois chemins sans garde
   * structurelle du tout.
   */
  const ACTIONS: ReadonlyArray<{ nom: string; appel: string; quota: string }> = [
    { nom: "seConnecter", appel: "signInWithPassword", quota: "verifierQuotaMotDePasse(" },
    { nom: "sInscrire", appel: "auth.signUp", quota: "verifierQuotaAuth(" },
    { nom: "demanderReinitialisation", appel: "resetPasswordForEmail", quota: "verifierQuotaAuth(" },
  ];

  test("la sonde lit réellement le code des trois actions", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Si le découpage cassait — une action
    // renommée, un autre style de déclaration —, tous les contrôles suivants
    // porteraient sur des chaînes vides et resteraient verts en ne prouvant
    // plus rien.
    for (const { nom, appel } of ACTIONS) {
      const c = corps(nom);
      expect(c.length, `corps de ${nom}() introuvable : la sonde vise à côté`).toBeGreaterThan(200);
      expect(c, `${nom}() ne contient pas son appel ${appel}`).toContain(appel);
    }
  });

  test("le quota est consommé AVANT l'appel, dans CHAQUE action", () => {
    // Mesuré sur ce projet : une inscription crée `auth.users`, `profiles` ET
    // `shops` immédiatement. Vérifier le quota après l'appel laisserait les
    // comptes fantômes se créer — on saurait qu'on a été balayé sans l'avoir
    // empêché. Et pour la connexion, le bourrage d'identifiants se serait déjà
    // déroulé. L'ORDRE EST LA PROTECTION.
    for (const { nom, appel, quota } of ACTIONS) {
      const c = corps(nom);
      const iQuota = c.indexOf(quota);
      const iAppel = c.indexOf(appel);
      expect(iQuota, `${nom}() : appel au quota introuvable`).toBeGreaterThan(-1);
      expect(iAppel, `${nom}() : appel au serveur d'authentification introuvable`).toBeGreaterThan(
        -1,
      );
      expect(
        iQuota < iAppel,
        `${nom}() vérifie son quota APRÈS l'appel : le mal est déjà fait quand ` +
          "on décide de refuser.",
      ).toBe(true);
    }
  });

  test("le plancher est appliqué APRÈS l'appel, pas seulement au succès", () => {
    // Ne l'appliquer qu'au chemin heureux rendrait l'échec reconnaissable à sa
    // rapidité, ce qui reconstituerait l'oracle qu'on cherche à supprimer. Avec
    // un mot de passe la raison est encore plus littérale qu'avec un lien : le
    // hachage ne s'exécute QUE si le compte existe.
    for (const { nom, appel } of ACTIONS) {
      const c = corps(nom);
      const iAppel = c.indexOf(appel);
      const iErreur = c.indexOf("error !== null", iAppel);
      const iPlancher = c.indexOf("attendrePlancher", iAppel);
      expect(iErreur, `${nom}() : branche d'erreur introuvable`).toBeGreaterThan(-1);
      expect(iPlancher, `${nom}() : plancher introuvable après l'appel`).toBeGreaterThan(-1);
      expect(
        iPlancher < iErreur,
        `${nom}() : le plancher doit être attendu entre l'appel et le ` +
          "branchement sur l'erreur, sinon un échec revient plus vite qu'un succès.",
      ).toBe(true);
    }
  });

  test("la connexion ne distingue AUCUNE cause d'échec, sauf la limite de débit", () => {
    /*
     * Adresse inconnue, mot de passe faux, compte non confirmé : les trois se
     * corrigent de la même façon du point de vue de qui possède le compte, et
     * les distinguer renseignerait qui ne le possède pas.
     *
     * La limite de débit est la SEULE exception, et elle ne divulgue rien : elle
     * ne dépend pas de l'existence d'un compte. Sans elle, on dirait
     * « réessayez » à quelqu'un qui vient d'être limité — il réessaierait
     * aussitôt, échouerait encore, et conclurait que le produit est cassé.
     */
    const c = corps("seConnecter");
    const inspections = [...c.matchAll(/error\.(code|message|name|status)/g)].map((m) => m[0]);
    expect(
      inspections.filter((i) => i !== "error.status"),
      "seConnecter() inspecte l'erreur au-delà de son statut : c'est ainsi " +
        "qu'on se met à répondre « cette adresse n'existe pas ».",
    ).toEqual([]);
    expect(
      /error\.status\s*===\s*429/.test(c),
      "seConnecter() n'isole plus la limite de débit : soit elle a disparu, " +
        "soit elle est confondue avec un échec d'identifiants.",
    ).toBe(true);
  });

  test("la réinitialisation répond la même chose à une adresse inconnue", () => {
    /*
     * C'est le nouveau vecteur de prise de compte, et la seule page du produit
     * où l'on peut poser la question autant de fois qu'on veut sans rien
     * posséder. Structurellement : aucune branche ne doit rendre un statut
     * d'échec autre que la limite de débit — une panne d'envoi comprise, qui
     * sinon distinguerait une adresse inscrite d'une adresse inconnue.
     */
    const c = corps("demanderReinitialisation");
    const motifs = [...c.matchAll(/motif:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(
      motifs.filter((m) => m !== "trop_de_tentatives" && m !== "email_invalide"),
      "demanderReinitialisation() rend un motif d'échec qui dépend de ce que " +
        "le serveur a répondu : c'est un oracle sur l'existence du compte.",
    ).toEqual([]);
    expect(
      /statut:\s*"envoye"/.test(c),
      "l'issue commune aux deux cas a disparu : la sonde ne prouve plus rien",
    ).toBe(true);
  });
});
