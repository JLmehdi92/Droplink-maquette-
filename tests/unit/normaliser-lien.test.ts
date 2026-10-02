import { describe, expect, test } from "vitest";
import { lienAcceptable, normaliserLien, type CleLien } from "@/lib/boutique/normaliser-lien";
import { MOTIFS_RESEAUX, MOTIF_SITE } from "@/lib/boutique/reglages";

/**
 * CE QU'UN VENDEUR COLLE VRAIMENT.
 *
 * DÉFAUT MOTIVANT, trouvé par Wassim le 02/09/2026 : `www.tiktok.com/@laplanque92`
 * — l'adresse de son propre compte, recopiée depuis sa barre d'adresse — était
 * refusée par le champ, avec un message qui lui demandait précisément de coller
 * l'adresse depuis son navigateur.
 *
 * ⚠️ CETTE SUITE NE TESTE PAS LA NORMALISATION SEULE, ELLE TESTE LA CHAÎNE.
 * Normaliser vers une valeur que le motif refuse ensuite ne servirait à rien, et
 * une suite qui comparerait deux chaînes ne le verrait pas. Chaque cas passe donc
 * par `normaliserLien` PUIS par le motif qui fait autorité — le même que la
 * contrainte de base.
 *
 * ⚠️ ET ELLE ÉCHOUE DANS LES DEUX SENS. La moitié basse liste ce qui doit rester
 * REFUSÉ : sans elle, « tout accepter » passerait à 100 %.
 */

const MOTIFS: Record<CleLien, RegExp> = { ...MOTIFS_RESEAUX, site: MOTIF_SITE };

const accepte = (clef: CleLien, saisie: string): boolean =>
  MOTIFS[clef].test(normaliserLien(clef, saisie));

describe("Ce qu'un vendeur colle est accepté", () => {
  const CAS: ReadonlyArray<readonly [CleLien, string, string]> = [
    // Le cas motivant, dans les trois formes qu'il prend selon d'où on copie.
    ["tiktok", "www.tiktok.com/@laplanque92", "https://www.tiktok.com/@laplanque92"],
    ["tiktok", "tiktok.com/@laplanque92", "https://tiktok.com/@laplanque92"],
    ["tiktok", "https://www.tiktok.com/@laplanque92", "https://www.tiktok.com/@laplanque92"],
    // Le pseudo seul : c'est ce que la planche dessine dans le champ.
    ["tiktok", "@laplanque92", "https://www.tiktok.com/@laplanque92"],
    ["tiktok", "laplanque92", "https://www.tiktok.com/@laplanque92"],
    // Le lien de partage de l'application, avec ses paramètres de suivi.
    ["tiktok", "https://www.tiktok.com/@x?_t=8k&_r=1", "https://www.tiktok.com/@x?_t=8k&_r=1"],
    ["instagram", "www.instagram.com/laplanque92", "https://www.instagram.com/laplanque92"],
    ["instagram", "instagram.com/laplanque92/", "https://instagram.com/laplanque92/"],
    ["instagram", "@laplanque92", "https://instagram.com/laplanque92"],
    ["instagram", "laplanque92", "https://instagram.com/laplanque92"],
    ["instagram", "http://instagram.com/x", "https://instagram.com/x"],
    ["instagram", "https://instagram.com/x?igsh=abc", "https://instagram.com/x?igsh=abc"],
    // La casse : une adresse recopiée depuis un document mis en forme.
    ["instagram", "WWW.Instagram.COM/LaPlanque", "https://www.instagram.com/LaPlanque"],
    // WhatsApp se donne en NUMÉRO — c'est le substitut que dessine la planche.
    ["whatsapp", "wa.me/33612345678", "https://wa.me/33612345678"],
    ["whatsapp", "+33 6 12 34 56 78", "https://wa.me/33612345678"],
    ["whatsapp", "0033612345678", "https://wa.me/33612345678"],
    ["whatsapp", "33612345678", "https://wa.me/33612345678"],
    [
      "whatsapp",
      "api.whatsapp.com/send?phone=33612345678",
      "https://api.whatsapp.com/send?phone=33612345678",
    ],
    ["site", "laplanque.fr", "https://laplanque.fr"],
    ["site", "www.laplanque.fr/boutique", "https://www.laplanque.fr/boutique"],
    ["site", "https://laplanque.fr", "https://laplanque.fr"],
    ["site", "LaPlanque.FR", "https://laplanque.fr"],
  ];

  test("la liste des cas n'est pas vide", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. On dit combien on inspecte, et on exige les
    // quatre clefs — sans quoi une clef pourrait sortir de la suite sans bruit.
    expect(CAS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(CAS.map(([c]) => c))).toEqual(
      new Set<CleLien>(["instagram", "tiktok", "whatsapp", "site"]),
    );
  });

  test.each(CAS)("%s : « %s » devient %s et passe le motif", (clef, saisie, attendu) => {
    expect(normaliserLien(clef, saisie)).toBe(attendu);
    expect(MOTIFS[clef].test(attendu)).toBe(true);
  });
});

describe("Ce qui doit rester refusé le reste", () => {
  /*
   * ⚠️ C'EST LA MOITIÉ QUI COMPTE. La normalisation a le droit de rendre une
   * saisie inchangée ; elle n'a jamais le droit de fabriquer un lien vers un
   * domaine qu'on n'attendait pas. Chacun de ces cas est une façon connue de
   * faire croire à un contrôle de domaine qui n'en est pas un.
   */
  const REFUS: ReadonlyArray<readonly [CleLien, string, string]> = [
    ["instagram", "https://instagram.com.attaquant.example/x", "domaine en préfixe"],
    ["tiktok", "https://tiktok.com.attaquant.example/@x", "domaine en préfixe"],
    ["whatsapp", "https://wa.me.attaquant.example/33612", "domaine en préfixe"],
    ["instagram", "https://attaquant.example/instagram.com/x", "domaine dans le chemin"],
    ["instagram", "https://instagram.com@attaquant.example/x", "domaine en userinfo"],
    ["site", "https://laplanque.fr@attaquant.example/x", "domaine en userinfo"],
    ["instagram", "javascript:alert(1)", "schéma exécutable"],
    ["tiktok", "data:text/html,<script>", "charge inline"],
    ["site", "javascript:alert(1)", "schéma exécutable"],
    ["site", "http://laplanque.fr", "http en clair"],
    ["whatsapp", "06 12 34 56 78", "numéro sans indicatif"],
    ["whatsapp", "+33", "indicatif seul"],
    ["site", "https://laplanque", "hôte sans point"],
    ["site", "https://la planque.fr", "espace dans l'hôte"],
  ];

  test("la liste des refus n'est pas vide", () => {
    expect(REFUS.length).toBeGreaterThanOrEqual(12);
  });

  test.each(REFUS)("%s : « %s » (%s) reste refusé", (clef, saisie) => {
    expect(accepte(clef, saisie)).toBe(false);
  });
});

describe("Le champ vide reste vide", () => {
  // Effacer le champ est le geste par lequel un vendeur RETIRE un lien. Une
  // normalisation qui fabriquerait « https:// » depuis rien écrirait une adresse
  // là où le vendeur voulait n'en avoir aucune.
  test.each(["instagram", "tiktok", "whatsapp", "site"] as const)("%s", (clef) => {
    expect(normaliserLien(clef, "")).toBe("");
    expect(normaliserLien(clef, "   ")).toBe("");
  });
});

describe("La validation à la saisie de « Ma marque » (lienAcceptable)", () => {
  test("elle accepte ce que le serveur accepte, normalisation comprise", () => {
    expect(lienAcceptable("instagram", "")).toBe(true);
    expect(lienAcceptable("instagram", "  ")).toBe(true);
    expect(lienAcceptable("tiktok", "www.tiktok.com/@laplanque92")).toBe(true);
    expect(lienAcceptable("site", "https://atelier-exemple.fr/boutique")).toBe(true);
  });

  test("elle refuse un domaine déguisé, comme le motif ancré du serveur", () => {
    expect(lienAcceptable("instagram", "https://instagram.com.attaquant.example/x")).toBe(false);
    expect(lienAcceptable("site", "https://instagram.com@attaquant.example/x")).toBe(false);
    expect(lienAcceptable("site", "javascript:alert(1)")).toBe(false);
  });
});
