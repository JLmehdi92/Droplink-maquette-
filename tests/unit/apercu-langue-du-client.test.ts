import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGUES } from "@/i18n/config";
import { substituerNom } from "@/lib/boutique/phrases-apercu";

/**
 * UN APERÇU « CE QUE VOIT LE CLIENT » MONTRE LA LANGUE DU CLIENT.
 *
 * ⚠️ DÉFAUT RAPPORTÉ PAR WASSIM LE 06/09/2026 : *« quand je suis sur le SaaS
 * anglais et que je clique sur la page client, ça me redirige vers la page
 * client en français »*.
 *
 * La page client était CORRECTE — elle vit hors du segment `[locale]` et prend
 * `shops.default_language`, décision verrouillée. Ce qui mentait, ce sont les
 * écrans qui promettaient de la montrer : sur `/en/marque`, un sélecteur
 * intitulé « Customer page language » réglé sur « French », et à vingt pixels
 * un aperçu affichant « Your order ». Trois surfaces disaient anglais, la
 * quatrième — la seule qui compte — rendait français.
 *
 * ⚠️ ET IL Y AVAIT TROIS APERÇUS, PAS DEUX. Le troisième, celui de
 * l'onboarding, n'a été trouvé qu'en inventoriant les clés `apercu*` du
 * catalogue. C'est exactement pourquoi ce fichier INVENTORIE au lieu de
 * vérifier les endroits qu'on a regardés : *un contrôle ne doit pas dépendre de
 * ce que son auteur a pensé à inspecter.*
 */

const RACINE = join(process.cwd(), "src");

/** Le CODE d'un fichier, commentaires retirés — L-031. */
function code(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

/**
 * LES TROIS APERÇUS DE PAGE CLIENT, ET LEURS DEUX VOISINS QUI N'EN SONT PAS.
 *
 * Les deux exclus sont déclarés avec leur raison, parce qu'ils portent les
 * mêmes noms de clés et qu'on les prendrait pour des oublis : `landing` et
 * `connexion` dessinent une maquette d'EXEMPLE, avec une boutique inventée
 * (« Atelier Nord »). Il n'y a aucun vendeur à cet instant, donc aucun
 * `shops.default_language` à respecter — la langue de l'URL est la seule qui
 * existe, et c'est la bonne.
 */
const APERCUS = [
  "components/commandes/apercu-client.tsx",
  "components/marque/formulaire-marque.tsx",
  "components/formulaire-onboarding.tsx",
] as const;

/** Les phrases que le client verra, et qui ne doivent donc jamais venir de `t`. */
const CONTENU = [
  "apercuCommande",
  "apercuVotreCommande",
  "apercuApprouver",
  "apercuReseaux",
  "apercuStatut",
] as const;

/** Le CADRE parle au vendeur : il reste dans la langue de l'interface. */
const CADRE = ["apercuTitre", "apercuDirect"] as const;

describe("Les aperçus rendent la langue du CLIENT, pas celle de l'URL", () => {
  test("la sonde lit réellement les trois fichiers", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Un chemin devenu faux — un fichier renommé,
    // un composant déplacé — rendrait tous les contrôles ci-dessous verts et
    // muets, sur un produit redevenu faux.
    for (const chemin of APERCUS) {
      expect(code(chemin).length, `${chemin} vide ou illisible`).toBeGreaterThan(500);
    }
  });

  test("aucun aperçu ne résout ses phrases de contenu avec `t`", () => {
    const fautifs: string[] = [];
    for (const chemin of APERCUS) {
      const src = code(chemin);
      for (const cle of CONTENU) {
        if (src.includes(`t("${cle}"`)) fautifs.push(`${chemin} → t("${cle}")`);
      }
    }
    expect(
      fautifs,
      "ces aperçus résolvent une phrase du CLIENT avec la locale de l'URL " +
        "VENDEUR : l'écran affirmerait le contraire de ce que le lien produira — " +
        fautifs.join(", "),
    ).toEqual([]);
  });

  test("CONTRE-TEST : le cadre, lui, reste dans la langue de l'interface", () => {
    /*
     * SANS LUI, « aucun `t(...)` de contenu » serait vrai d'un fichier qui
     * n'appellerait plus `t` du tout — c'est-à-dire d'un écran dont les
     * libellés vendeur seraient partis en dur, ou dans la mauvaise langue à
     * l'envers. Une suite où tout est interdit passe à 100 % sans rien prouver.
     */
    const sansCadre = APERCUS.filter((chemin) => {
      const src = code(chemin);
      return !CADRE.some((cle) => src.includes(`t("${cle}"`));
    });
    // `apercu-client.tsx` et `formulaire-marque.tsx` portent le cadre ;
    // l'onboarding a son propre titre (`apercuTitre`) et compte donc aussi.
    expect(
      sansCadre,
      "ces aperçus n'appellent plus `t` du tout : le cadre, qui parle au " +
        "VENDEUR, a-t-il été traduit par erreur dans la langue du client ? — " +
        sansCadre.join(", "),
    ).toEqual([]);
  });

  test("chaque aperçu emprunte ses phrases au module unique", () => {
    /*
     * L'AUTRE SENS. Ne pas appeler `t` ne prouve pas qu'on appelle la bonne
     * source : un aperçu qui écrirait « Votre commande » en dur passerait le
     * contrôle précédent, et retomberait dans la duplication qu'on vient de
     * supprimer.
     *
     * ⚠️ CE CONTRÔLE A ÉTÉ FALSIFIÉ, ET IL EST PASSÉ AU VERT. Il cherchait le
     * NOM du type — `LibellesApercu`. En remplaçant l'import par une COPIE
     * LOCALE du type portant le même nom, le fichier cessait d'emprunter quoi
     * que ce soit au module, et la sonde restait verte : 8/8. C'est L-020 dans
     * sa forme exacte — *une expression régulière prouve qu'un TEXTE existe,
     * jamais qu'une CAPACITÉ est en place*.
     *
     * Il cherche donc le CHEMIN DU MODULE, qui ne peut pas être recopié : il
     * désigne un fichier, et ce fichier est la source unique.
     *
     * ⚠️ C'est `phrases-apercu` et non `libelles-apercu`, parce que la fabrique
     * porte `server-only` : le BUILD a refusé qu'un Client Component l'importe,
     * et il a eu raison. Le contrat traverse, la fabrique non.
     */
    const orphelins = APERCUS.filter((chemin) => !code(chemin).includes("boutique/phrases-apercu"));
    expect(
      orphelins,
      "ces aperçus ne reçoivent plus leurs phrases de `lib/boutique/libelles-apercu` — " +
        orphelins.join(", "),
    ).toEqual([]);
  });
});

describe("Les gabarits d'aperçu portent leur variable, dans toutes les langues", () => {
  /*
   * ⚠️ LA SUBSTITUTION EST LITTÉRALE, DONC MUETTE QUAND ELLE ÉCHOUE. Un gabarit
   * qui perdrait `{nom}` — une retraduction, un renommage de variable — rendrait
   * « pour » tout seul, ou « Retrouvez » sans personne. Rien n'échouerait :
   * `String.replace` sur un motif absent rend la chaîne inchangée.
   *
   * `i18n-parite` ne peut pas le voir : il compare des clés et refuse les
   * valeurs vides, jamais la forme d'une valeur.
   */
  const catalogue = (langue: string): Record<string, unknown> =>
    JSON.parse(readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8")) as Record<
      string,
      unknown
    >;

  test("la sonde inspecte au moins deux langues", () => {
    expect(LANGUES.length, "l'inventaire des langues est vide ou singulier").toBeGreaterThan(1);
  });

  test.each(LANGUES)("`pourClient` et `reseaux.titre` portent {nom} en %s", (langue) => {
    const pp = catalogue(langue)["page-publique"] as {
      pourClient: string;
      reseaux: { titre: string };
    };
    expect(pp.pourClient, `page-publique.pourClient (${langue}) a perdu {nom}`).toContain("{nom}");
    expect(pp.reseaux.titre, `page-publique.reseaux.titre (${langue}) a perdu {nom}`).toContain(
      "{nom}",
    );
  });

  test("la substitution remplace réellement, et ne touche rien d'autre", () => {
    expect(substituerNom("pour {nom}", "Yanis")).toBe("pour Yanis");
    expect(substituerNom("Retrouvez {nom}", "Atelier Nord")).toBe("Retrouvez Atelier Nord");
    // CONTRE-TEST : un gabarit sans variable rend la chaîne inchangée — c'est
    // exactement le mode de défaillance silencieux que le test ci-dessus garde.
    expect(substituerNom("pour", "Yanis")).toBe("pour");
  });
});
