import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * LES MODÈLES D'EMAIL DE SUPABASE, GARDÉS DEPUIS LE DÉPÔT.
 *
 * ⚠️ CES FICHIERS NE SONT PAS EXÉCUTÉS PAR LE PRODUIT, ET C'EST EXACTEMENT
 * POURQUOI ILS ONT BESOIN D'UNE GARDE. Ils vivent dans le tableau de bord
 * Supabase — aucune relecture de code ne les voit, aucune porte ne les traverse,
 * et un modèle faux n'échoue nulle part : il envoie un email qui a l'air normal
 * et dont le lien ne mène à rien. C'est L-028 appliqué à l'authentification.
 *
 * CE QUE CETTE SUITE NE PEUT PAS FAIRE, et il faut le dire : elle ne vérifie
 * pas ce qui est COLLÉ dans Supabase. Elle vérifie que la version de référence,
 * celle qu'on relit et qu'on copie, porte le lien que le produit sait
 * réellement consommer. Le collage reste un geste humain.
 *
 * ⚠️ LE DÉFAUT QU'ELLE GARDE EST MESURÉ, PAS THÉORIQUE. Le 02/09/2026, en
 * suivant un vrai lien de récupération : `/auth/v1/verify` de Supabase répond
 * `303` avec le jeton dans un FRAGMENT — `#access_token=…`. Un fragment n'est
 * JAMAIS envoyé au serveur. `{{ .ConfirmationURL }}`, la variable que propose
 * le modèle par défaut, produit exactement cette forme-là : le lien s'ouvre,
 * la page s'affiche, et la route répond « lien incomplet ».
 */

const DOSSIER = join(process.cwd(), "supabase", "modeles-email");

/**
 * L'INVENTAIRE EST DÉCLARÉ, ET IL ÉCHOUE DANS LES DEUX SENS : un modèle ajouté
 * sans être décrit ici, et un modèle décrit ici qui aurait disparu. Sans les
 * deux, un troisième modèle pourrait naître avec `{{ .ConfirmationURL }}` sans
 * que rien ne le voie — ce qui est précisément le défaut d'origine.
 */
const ATTENDUS = new Map<string, { readonly suite: string | null; readonly raison: string }>([
  [
    "reinitialisation.html",
    {
      suite: "suite=mot-de-passe",
      raison:
        "C'est ce paramètre, et lui seul, qui fait choisir `recovery` plutôt que " +
        "`email` à la route de retour. Sans lui, Supabase vérifierait le jeton " +
        "comme une confirmation d'adresse et la personne n'atteindrait jamais " +
        "l'écran de choix du mot de passe.",
    },
  ],
  [
    "confirmation.html",
    {
      suite: null,
      raison:
        "Une confirmation d'adresse ne doit PAS porter `suite=mot-de-passe` : " +
        "elle enverrait choisir un mot de passe quelqu'un qui vient seulement " +
        "de confirmer son adresse.",
    },
  ],
]);

/**
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUT CONTRÔLE — L-031.
 *
 * Cette suite a échoué sur ELLE-MÊME au premier passage : les commentaires de
 * `confirmation.html` citent `{{ .ConfirmationURL }}` et `suite=mot-de-passe`
 * pour EXPLIQUER pourquoi il ne faut pas les employer, et la garde les y a
 * trouvés. Elle rougissait donc sur un modèle correct.
 *
 * Et le défaut symétrique est le plus grave des deux : un modèle qui ne
 * citerait le bon lien QUE dans un commentaire, sans le poser dans son `href`,
 * passerait tous les contrôles positifs. Un contrôle qui cherche un MOT ne
 * prouve rien (L-020) ; celui-ci interroge ce qui sera RENDU.
 */
function sansCommentaires(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function lire(nom: string): string {
  return sansCommentaires(readFileSync(join(DOSSIER, nom), "utf8"));
}

/** Le fichier ENTIER, commentaires compris — pour les seuls contrôles de volume. */
function lireBrut(nom: string): string {
  return readFileSync(join(DOSSIER, nom), "utf8");
}

describe("Les modèles d'email de Supabase", () => {
  const surLeDisque = readdirSync(DOSSIER).filter((f) => f.endsWith(".html"));

  test("la sonde inspecte réellement des fichiers", () => {
    // ⚠️ EN PREMIER. Toutes les assertions qui suivent sont vraies d'un dossier
    // vide : un `for` sur rien ne lève jamais.
    expect(surLeDisque.length).toBeGreaterThanOrEqual(2);
    for (const nom of surLeDisque) {
      expect(lireBrut(nom).length, `${nom} est vide ou presque`).toBeGreaterThan(800);
      expect(
        lire(nom).length,
        `${nom} : commentaires retirés, il ne reste presque rien — ce serait un fichier qui EXPLIQUE un modèle au lieu d'en être un`,
      ).toBeGreaterThan(600);
    }
  });

  test("l'inventaire correspond au disque, dans les deux sens", () => {
    expect([...surLeDisque].sort()).toEqual([...ATTENDUS.keys()].sort());
  });

  test("chaque exception déclarée porte une raison, pas seulement un nom", () => {
    for (const [nom, { raison }] of ATTENDUS) {
      expect(raison.length, `${nom} : raison trop courte pour être une raison`).toBeGreaterThan(60);
    }
  });

  test("AUCUN modèle n'emploie ConfirmationURL — le jeton y part dans un fragment", () => {
    for (const nom of surLeDisque) {
      expect(
        lire(nom).includes("{{ .ConfirmationURL }}"),
        `${nom} : ConfirmationURL met le jeton dans un FRAGMENT, que le serveur ne reçoit jamais`,
      ).toBe(false);
    }
  });

  test("chaque modèle vise la route de retour avec un token_hash", () => {
    for (const nom of surLeDisque) {
      const contenu = lire(nom);
      expect(contenu, `${nom} : pas de SiteURL`).toContain("{{ .SiteURL }}");
      expect(contenu, `${nom} : pas de TokenHash`).toContain("token_hash={{ .TokenHash }}");
      expect(contenu, `${nom} : ne vise pas /auth/retour`).toContain("/auth/retour?token_hash=");
    }
  });

  test("aucun modèle ne fige une langue dans son URL", () => {
    /*
     * Vérifié par exécution le 04/09/2026 : `/auth/retour?token_hash=…&suite=…`
     * répond `307` vers `/fr/auth/retour?token_hash=…&suite=…` — les deux
     * paramètres survivent à la redirection, et c'est le middleware qui négocie
     * la langue depuis le navigateur de celui qui OUVRE l'email. Figer `/fr/`
     * enverrait un vendeur anglophone sur un écran français ; figer `/en/`
     * ferait l'inverse. Supabase, lui, ne connaît pas la langue du vendeur.
     */
    for (const nom of surLeDisque) {
      expect(
        /\{\{ \.SiteURL \}\}\/(fr|en)\//.test(lire(nom)),
        `${nom} : une langue est figée dans l'URL`,
      ).toBe(false);
    }
  });

  test("le paramètre `suite` est présent là où il doit l'être, et absent ailleurs", () => {
    for (const [nom, { suite }] of ATTENDUS) {
      const contenu = lire(nom);
      if (suite === null) {
        expect(contenu, `${nom} : porte un \`suite=\` qu'il ne devrait pas`).not.toContain("suite=");
      } else {
        expect(contenu, `${nom} : \`${suite}\` manquant`).toContain(suite);
      }
    }
  });

  test("CONTRE-TEST : le lien de repli en clair porte la MÊME adresse que le bouton", () => {
    /*
     * Sans lui, un modèle pourrait afficher une adresse de repli périmée pendant
     * que le bouton, lui, marche. Le repli n'existe que pour les clients de
     * messagerie qui n'affichent pas les boutons : il est lu par ceux qui n'ont
     * AUCUN autre recours, donc c'est le pire endroit où se tromper.
     */
    const contenu = lire("reinitialisation.html");
    /*
     * ⚠️ CE MOTIF S'ARRÊTAIT AU PREMIER ESPACE, ET IL ÉTAIT VERT PAR
     * CONSTRUCTION. Écrit `[^"\s<]*`, il coupait à l'espace qui vit À
     * L'INTÉRIEUR de `{{ .TokenHash }}` : les deux liens se réduisaient tous
     * deux à `…token_hash={{`, donc toujours identiques, quoi qu'on change
     * après. Falsifié — repli divergent du bouton — la suite restait VERTE.
     *
     * Un contre-test qui ne peut pas rougir sur le cas qu'il prétend garder
     * est pire qu'aucun contre-test : il occupe la place et il rassure.
     * Le motif s'arrête désormais au guillemet, au chevron ou à la fin de
     * ligne — jamais à un espace interne de gabarit.
     */
    const liens = [...contenu.matchAll(/\{\{ \.SiteURL \}\}\/auth\/retour\?[^"<\r\n]*/g)].map((m) =>
      m[0].replace(/&amp;/g, "&").trim(),
    );
    expect(liens.length, "le modèle doit porter le bouton ET son repli").toBeGreaterThanOrEqual(2);
    expect(new Set(liens).size, `deux adresses différentes : ${liens.join(" | ")}`).toBe(1);
  });

  test("chaque modèle parle AUSSI anglais", () => {
    /*
     * ⚠️ DÉFAUT MESURÉ LE 06/09/2026 : les deux modèles étaient INTÉGRALEMENT
     * en français, en dur, sans le moindre attribut de langue. Le produit est
     * bilingue depuis le premier jour.
     *
     * CE QUE ÇA COÛTAIT : depuis la suppression du lien magique le 01/09, la
     * réinitialisation est le SEUL recours d'un vendeur enfermé dehors. Un
     * anglophone recevait, pour tout secours, un email qu'il ne comprenait pas.
     * Le brief §9 le dit : « la réinitialisation est le nouveau vecteur de
     * prise de compte » — un recours illisible est un recours qui échoue.
     *
     * ⚠️ POURQUOI BILINGUE ET NON TRADUIT. Supabase n'accepte QU'UN modèle par
     * type et ne connaît pas la langue du destinataire ; `profiles.locale` ne
     * lui est pas accessible. Un envoi par langue exigerait notre propre port
     * d'envoi, que `lib/email/port.ts` déclare explicitement ne pas être.
     *
     * ⚠️ ET CETTE SUITE NE PROUVE TOUJOURS PAS CE QUI EST COLLÉ DANS SUPABASE.
     * Elle garde la version de référence, celle qu'on relit et qu'on copie.
     * Le collage reste un geste humain — c'est L-028, et le dire vaut mieux
     * que de laisser croire l'inverse.
     */
    for (const [fichier] of ATTENDUS) {
      const contenu = lire(fichier);
      const blocs = [...contenu.matchAll(/lang="en"/g)].length;
      expect(
        blocs,
        `${fichier} ne porte aucun bloc \`lang="en"\` : un vendeur anglophone ` +
          "reçoit son SEUL recours d'accès dans une langue qu'il ne lit pas.",
      ).toBeGreaterThan(0);
    }
  });

  test("CONTRE-TEST : le français n'a pas disparu au passage", () => {
    // Sans lui, « chaque modèle parle anglais » serait vrai d'un modèle
    // entièrement traduit — c'est-à-dire du défaut inverse, appliqué au
    // persona majoritaire. Une bascule n'est pas une correction.
    for (const [fichier] of ATTENDUS) {
      const contenu = lire(fichier);
      expect(
        /[àâçéèêëîïôùûüœ]/i.test(contenu),
        `${fichier} ne porte plus aucun accent : le français a-t-il été remplacé ?`,
      ).toBe(true);
    }
  });
});
