import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { envoiConfigure, lireConfigEmail } from "@/lib/email/config";

/**
 * LA CONFIGURATION DE L'EXPÉDITEUR D'ALERTES.
 *
 * ⚠️ L-026 : « une valeur qui a la FORME d'une configuration franchit toutes
 * les validations de présence. » Le projet s'est déjà fait prendre une fois par
 * `votre-adresse@exemple.com` sur l'adresse de signalement.
 *
 * Ici la conséquence est pire, et c'est ce qui justifie une suite entière pour
 * trois variables : une adresse de signalement mal substituée produit un lien
 * mort, que quelqu'un finira par signaler. Une adresse d'ALERTE mal substituée
 * produit un veilleur qui croit alerter, dont les emails partent vers un
 * domaine d'exemple — et dont le silence est exactement l'état normal. Personne
 * ne le remarquera, jamais.
 */

const CLES = ["RESEND_API_KEY", "EMAIL_ALERTES_DE", "EMAIL_ALERTES_A"] as const;

let sauvegarde: Record<string, string | undefined> = {};

beforeEach(() => {
  sauvegarde = Object.fromEntries(CLES.map((c) => [c, process.env[c]]));
  for (const c of CLES) delete process.env[c];
});

afterEach(() => {
  for (const c of CLES) {
    const v = sauvegarde[c];
    if (v === undefined) delete process.env[c];
    else process.env[c] = v;
  }
});

/** Une configuration entièrement valide, à dégrader champ par champ. */
function poserValide(): void {
  process.env["RESEND_API_KEY"] = "re_" + "a".repeat(30);
  process.env["EMAIL_ALERTES_DE"] = "veille@alertes.droplink.app";
  process.env["EMAIL_ALERTES_A"] = "exploitation@droplink.app";
}

describe("L'expéditeur d'alertes — le cas qui marche", () => {
  /*
   * ⚠️ LE CONTRE-TEST POSITIF VIENT EN PREMIER.
   *
   * Tous les autres tests de ce fichier vérifient des REFUS. Une implémentation
   * qui refuserait TOUT les passerait à 100 % sans rien prouver — et le produit
   * n'enverrait plus jamais d'alerte. Il faut donc d'abord établir qu'une
   * configuration correcte est acceptée.
   */
  test("une configuration complète et substituée est acceptée", () => {
    poserValide();
    const config = lireConfigEmail();
    expect("manquant" in config, "une configuration valide est refusée").toBe(false);
    expect(envoiConfigure()).toBe(true);
  });

  test("la forme « Nom <adresse> » est acceptée pour l'expéditeur", () => {
    poserValide();
    process.env["EMAIL_ALERTES_DE"] = "DropLink Veille <veille@alertes.droplink.app>";
    expect("manquant" in lireConfigEmail()).toBe(false);
  });
});

describe("L'expéditeur d'alertes — ce qui doit être refusé", () => {
  test("une variable absente est NOMMÉE, pas résumée à un booléen", () => {
    // Savoir QUE ce n'est pas configuré ne suffit pas à le configurer. Le
    // message d'erreur d'un veilleur muet est la seule chose qui dira à
    // l'exploitant quoi poser.
    const config = lireConfigEmail();
    expect("manquant" in config).toBe(true);
    if ("manquant" in config) {
      expect([...config.manquant].sort()).toEqual([...CLES].sort());
    }
  });

  test("chaque variable manquante est signalée SEULE", () => {
    for (const absente of CLES) {
      poserValide();
      delete process.env[absente];
      const config = lireConfigEmail();
      expect("manquant" in config, `${absente} absente et pourtant acceptée`).toBe(true);
      if ("manquant" in config) expect(config.manquant).toEqual([absente]);
    }
  });

  test("une adresse qui a la FORME d'un gabarit est refusée", () => {
    /*
     * LE CŒUR DE CETTE SUITE. Toutes ces valeurs sont des adresses email
     * syntaxiquement PARFAITES : elles franchissent n'importe quelle validation
     * de présence et n'importe quelle expression régulière de format. Ce sont
     * pourtant exactement celles qu'un fichier d'exemple recopié laisse
     * derrière lui.
     */
    for (const gabarit of [
      "votre-adresse@domaine.com",
      "your-email@example.com",
      "alertes@exemple.fr",
      "TODO@droplink.app",
      "changeme@droplink.app",
      "placeholder@droplink.app",
      "<adresse>@droplink.app",
      "[email]@droplink.app",
    ]) {
      poserValide();
      process.env["EMAIL_ALERTES_A"] = gabarit;
      expect("manquant" in lireConfigEmail(), `« ${gabarit} » est passé`).toBe(true);
    }
  });

  test("une chaîne qui n'est pas une adresse est refusée", () => {
    for (const brut of ["", "   ", "pas-une-adresse", "a@b", "deux@arobases@ici.com", "@droplink.app"]) {
      poserValide();
      process.env["EMAIL_ALERTES_A"] = brut;
      expect("manquant" in lireConfigEmail(), `« ${brut} » est passé`).toBe(true);
    }
  });

  test("une clé qui n'a pas la forme d'une clé Resend est refusée", () => {
    // Le préfixe `re_` n'est pas de la superstition de format : c'est ce qui
    // distingue une clé d'un gabarit, et c'est gratuit. Une clé trop courte est
    // écartée pour la même raison — `re_todo` a le bon préfixe.
    for (const brut of ["", "sk_test_abcdefghijklmnop", "re_court", "abcdefghijklmnopqrstuvwx"]) {
      poserValide();
      process.env["RESEND_API_KEY"] = brut;
      const config = lireConfigEmail();
      expect("manquant" in config, `« ${brut} » est passée pour une clé`).toBe(true);
      if ("manquant" in config) expect(config.manquant).toContain("RESEND_API_KEY");
    }
  });
});
