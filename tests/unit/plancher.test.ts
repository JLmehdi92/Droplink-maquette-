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

  function codeSansCommentaires(): string {
    // Le motif s'applique au CODE, commentaires retirés — sinon il se
    // satisferait du commentaire qui décrit la garde au lieu de la garde
    // elle-même (L-031). Le fichier contient justement de longs commentaires
    // qui citent `shouldCreateUser`.
    return readFileSync(SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  test("la sonde lit réellement le code de l'action", () => {
    // Un ensemble vide passe tout : si le chemin était faux, l'absence de
    // `shouldCreateUser: false` serait vraie par vacuité.
    const code = codeSansCommentaires();
    expect(code).toContain("signInWithOtp");
    expect(code).toContain("shouldCreateUser");
  });

  test("`shouldCreateUser` n'est JAMAIS mis à false", () => {
    // Le mettre à false fait répondre 422 `otp_disabled` en 49 ms pour une
    // adresse inconnue, contre une autre réponse en 778 ms pour une adresse
    // connue. Deux oracles : le code d'erreur et le délai. Établi par mesure sur
    // le vrai projet, pas déduit de la documentation.
    const code = codeSansCommentaires();
    expect(
      /shouldCreateUser\s*:\s*false/.test(code),
      "L'écran de connexion se remettrait à révéler quelles adresses ont un " +
        "compte. C'est la liste qui a été extraite de Pandabuy, et elle a une " +
        "valeur marchande sur ce marché.",
    ).toBe(false);
  });

  test("le quota est consommé AVANT l'appel à Supabase", () => {
    // Mesuré sur ce projet : une demande de lien crée `auth.users`, `profiles`
    // ET `shops` immédiatement, avant tout clic. Vérifier le quota après l'appel
    // laisserait donc les comptes fantômes se créer — on saurait qu'on a été
    // balayé sans l'avoir empêché. L'ordre EST la protection.
    const code = codeSansCommentaires();
    const indexQuota = code.indexOf("verifierQuotaAuth(");
    const indexAppel = code.indexOf("signInWithOtp");
    expect(indexQuota, "appel au quota introuvable").toBeGreaterThan(-1);
    expect(indexAppel, "appel à Supabase introuvable").toBeGreaterThan(-1);
    expect(
      indexQuota < indexAppel,
      "Le quota est vérifié APRÈS la demande de lien : les comptes fantômes " +
        "sont déjà créés quand on décide de refuser.",
    ).toBe(true);
  });

  test("le plancher est appliqué APRÈS l'appel, pas seulement au succès", () => {
    // Ne l'appliquer qu'au chemin heureux rendrait l'échec reconnaissable à sa
    // rapidité, ce qui reconstituerait l'oracle qu'on vient de supprimer.
    const code = codeSansCommentaires();
    const indexAppel = code.indexOf("signInWithOtp");
    const indexErreur = code.indexOf("error !== null");
    const indexPlancher = code.indexOf("attendrePlancher", indexAppel);
    expect(indexAppel, "appel introuvable").toBeGreaterThan(-1);
    expect(indexErreur, "branche d'erreur introuvable").toBeGreaterThan(-1);
    expect(
      indexPlancher > indexAppel && indexPlancher < indexErreur,
      "Le plancher doit être attendu entre l'appel et le branchement sur " +
        "l'erreur, sinon un échec revient plus vite qu'un succès.",
    ).toBe(true);
  });
});
