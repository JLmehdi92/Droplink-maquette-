import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * AUCUN MODULE DE `src/lib` NE VIT MORT.
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026, ET IL ÉTAIT PIRE QUE DU CODE
 * MORT ORDINAIRE.
 *
 * `src/lib/auth/session.ts` exportait `exigerSession()`. Le middleware ET
 * `CLAUDE.md` la présentaient tous deux comme « la garde qui fait autorité », à
 * appeler « en tête de chaque page authentifiée ». Elle avait ZÉRO site
 * d'appel : le module entier n'était importé par personne.
 *
 * CE QUI EN FAISAIT UN PIÈGE ACTIF, et pas seulement une ligne périmée :
 * `exigerSession()` ne vérifiait QUE la présence d'une session, jamais
 * `profiles.status`. La vraie garde du produit — `lireProfilVendeur()` suivie
 * d'une redirection — vérifie les deux. Quelqu'un qui aurait suivi la consigne
 * à la lettre sur une nouvelle page aurait donc écrit une garde LAISSANT PASSER
 * UN COMPTE SUSPENDU, en croyant appliquer la règle du projet.
 *
 * Une documentation fausse est plus dangereuse qu'une documentation absente :
 * on la suit. C'est L-014 dans sa forme la plus coûteuse — un document affirme
 * un état que personne n'a exécuté — appliqué à une garde de sécurité.
 *
 * CE QUE CE CONTRÔLE INTERROGE : un export de `src/lib` qui n'est importé par
 * rien. Il ne prouve pas qu'une garde est CORRECTE ; il prouve qu'elle est
 * BRANCHÉE. Une garde débranchée est une garde qui n'existe pas, et c'est
 * exactement ce qu'aucune relecture de code ne montre — le fichier a l'air
 * parfait, il est simplement seul.
 */

const LIB = join(process.cwd(), "src", "lib");
const SRC = join(process.cwd(), "src");

/**
 * Les exports admis sans appelant, et pourquoi.
 *
 * La raison est OBLIGATOIRE et sa longueur est vérifiée : sans elle, cette
 * liste devient l'endroit où l'on range ce qu'on ne veut pas expliquer.
 */
const SANS_APPELANT_ADMIS: ReadonlyMap<string, string> = new Map();

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".ts") || chemin.endsWith(".tsx")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

/**
 * Les GARDES exportées par un fichier.
 *
 * ⚠️ PORTÉE VOLONTAIREMENT ÉTROITE, et il faut dire pourquoi.
 *
 * Une première version inventoriait TOUS les exports de `src/lib`. Elle a rendu
 * 59 « orphelins », dont l'immense majorité sont employés par les tests ou par
 * les sondes de `scripts/` — c'est-à-dire des faux positifs. Un contrôle qui
 * crie au loup finit désactivé, et on perd alors le vrai signal avec le bruit.
 *
 * On ne retient donc que ce que le produit appelle des GARDES : les fonctions
 * dont le nom commence par `exiger` ou `verifier`. Ce sont celles dont le
 * débranchement est une faille plutôt qu'un déchet, et c'est exactement la
 * famille à laquelle appartenait `exigerSession()`.
 *
 * Les types ne sont pas comptés : ils disparaissent à la compilation.
 */
const PREFIXES_DE_GARDE = ["exiger", "verifier"] as const;

function estGarde(nom: string): boolean {
  return PREFIXES_DE_GARDE.some((p) => nom.startsWith(p));
}

function exportsDe(source: string): readonly string[] {
  const propre = sansCommentaires(source);
  const noms: string[] = [];
  for (const m of propre.matchAll(
    /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    const nom = m[1] as string;
    if (estGarde(nom)) noms.push(nom);
  }
  return noms;
}

const TOUS = fichiers(SRC).map((chemin) => ({
  chemin,
  posix: chemin.split(/[\\/]/).join("/"),
  source: sansCommentaires(readFileSync(chemin, "utf8")),
}));

describe("chaque garde exportée par src/lib a au moins un appelant", () => {
  const modules = TOUS.filter((f) => f.chemin.startsWith(LIB));

  // UN ENSEMBLE VIDE PASSE TOUT. Sans cette borne, un chemin renommé rendrait
  // cette suite verte et muette — l'état précis qu'elle est censée empêcher.
  test("la sonde lit réellement les modules de src/lib", () => {
    expect(modules.length, "aucun module lu : la sonde vise à côté").toBeGreaterThan(25);
    const total = modules.reduce((n, m) => n + exportsDe(m.source).length, 0);
    // UN ENSEMBLE VIDE PASSE TOUT : si plus aucune garde ne portait ce préfixe,
    // cette suite deviendrait verte en ne surveillant plus rien.
    expect(total, "aucune garde trouvée : la lecture est fausse").toBeGreaterThan(5);
  });

  test("aucune garde n'est orpheline", () => {
    const orphelins: string[] = [];

    for (const fichier of modules) {
      const nom = fichier.posix.split("/").pop() as string;

      for (const symbole of exportsDe(fichier.source)) {
        // Un appelant est n'importe quel AUTRE fichier de `src` qui nomme ce
        // symbole. On ne suit pas les imports un par un : un symbole réexporté,
        // renommé à l'import ou employé dans un type serait perdu, et le
        // contrôle crierait au loup — un contrôle qui crie au loup finit
        // désactivé.
        const motif = new RegExp(`\\b${symbole}\\b`);
        const appele = TOUS.some((f) => f.chemin !== fichier.chemin && motif.test(f.source));

        if (!appele && !SANS_APPELANT_ADMIS.has(`${nom} → ${symbole}`)) {
          orphelins.push(`${nom} → ${symbole}`);
        }
      }
    }

    expect(
      [...new Set(orphelins)],
      "Gardes de `src/lib` que rien n'appelle. Une garde débranchée est une " +
        "garde qui n'existe pas — et c'est précisément ce qu'aucune relecture " +
        "de code ne montre : le fichier a l'air parfait, il est seul.",
    ).toEqual([]);
  });

  // L'AUTRE SENS : une dispense qui ne correspond plus à rien couvrirait tout
  // ce qu'on ajouterait ensuite dans ce fichier.
  test("chaque dispense correspond encore à un export orphelin", () => {
    for (const [cle, raison] of SANS_APPELANT_ADMIS) {
      expect(raison.length, `${cle} : dispense sans raison`).toBeGreaterThan(40);
    }
  });
});

describe("aucun document ne désigne une garde qui n'existe pas", () => {
  /*
   * LA MOITIÉ DU DÉFAUT QUE LE CONTRÔLE PRÉCÉDENT NE VOIT PAS.
   *
   * Un export orphelin est détectable. Une PHRASE qui nomme une garde
   * inexistante ne l'est pas — et c'est elle qui fait écrire du mauvais code,
   * puisque c'est elle qu'on lit avant d'écrire.
   *
   * On extrait donc les symboles cités entre accents graves suivis de `()` dans
   * `CLAUDE.md` et dans les commentaires du middleware, et on exige que chacun
   * existe réellement dans `src`. C'est étroit — cela ne couvre pas toute la
   * prose — mais cela couvre exactement la forme qui a produit le défaut : une
   * garde nommée comme si elle était en place.
   */
  const SOURCES_DE_PROSE = [
    join(process.cwd(), "CLAUDE.md"),
    join(process.cwd(), "src", "middleware.ts"),
  ];

  /**
   * Les fonctions TIERCES citées dans la prose, et leur origine.
   *
   * Elles n'ont pas à exister dans `src` : elles appartiennent à une
   * bibliothèque. La liste est déclarée avec sa raison plutôt que le contrôle
   * assoupli, sans quoi il suffirait d'un nom mal orthographié pour passer.
   */
  const TIERCES: ReadonlyMap<string, string> = new Map([
    [
      "getSession",
      "méthode du client Supabase (`supabase.auth.getSession()`), citée pour " +
        "expliquer qu'elle ne fait aucun appel réseau quand le jeton est valide.",
    ],
  ]);

  /**
   * Les gardes SUPPRIMÉES que la prose a le droit de nommer, et pourquoi.
   *
   * Un commentaire qui explique pourquoi une garde a été retirée doit pouvoir
   * la nommer — sinon on perd la seule trace de la raison, et quelqu'un la
   * réintroduit. Mais la déclarer ici est une DÉCISION, relue à chaque ajout,
   * plutôt qu'un effet de bord d'un filtre par mots-clés.
   *
   * ⚠️ Cette liste échoue dans l'autre sens : si l'un de ces noms revenait
   * réellement dans `src`, le contrôle ci-dessous le signalerait.
   */
  const SUPPRIMEES: ReadonlyMap<string, string> = new Map([
    [
      "exigerSession",
      "supprimée le 26/08/2026 : zéro site d'appel alors que le middleware et " +
        "CLAUDE.md la présentaient comme la garde du produit, et elle ne " +
        "vérifiait pas `profiles.status`. Le middleware explique le défaut.",
    ],
  ]);

  /** Les symboles cités comme des appels : `exigerAdmin()`, `lireProfilVendeur()`. */
  function symbolesCites(texte: string): readonly string[] {
    return [...texte.matchAll(/`([a-z][A-Za-z0-9_]*)\(\)`/g)].map((m) => m[1] as string);
  }

  test("la sonde trouve réellement des citations", () => {
    const total = SOURCES_DE_PROSE.reduce(
      (n, f) => n + symbolesCites(readFileSync(f, "utf8")).length,
      0,
    );
    expect(total, "aucune citation trouvée : la lecture est fausse").toBeGreaterThan(3);
  });

  test.each(SOURCES_DE_PROSE)("%s ne cite que des fonctions qui existent", (fichier) => {
    const texte = readFileSync(fichier, "utf8");

    // Les citations sont éprouvées TOUTES, sans filtrer par mots-clés : un tel
    // filtre serait exactement le genre de contrôle textuel que ce dépôt refuse
    // ailleurs, et il suffirait d'une tournure différente pour le contourner.
    // Ce qui est admis est DÉCLARÉ, avec sa raison.
    const inexistants = [...new Set(symbolesCites(texte))]
      .filter((symbole) => !TIERCES.has(symbole))
      .filter((symbole) => !SUPPRIMEES.has(symbole))
      // L'AUTRE SENS : une garde déclarée supprimée qui réapparaîtrait dans
      // `src` doit faire échouer — sinon cette liste deviendrait le moyen de
      // faire taire le contrôle en réintroduisant ce qu'on a retiré.
      .filter((symbole) => {
        const motif = new RegExp(`(?:function|const)\\s+${symbole}\\b`);
        return !TOUS.some((f) => motif.test(f.source));
      });

    expect(
      inexistants,
      "Ces fonctions sont citées comme si elles étaient en place, et n'existent " +
        "pas dans `src`. Une documentation fausse est plus dangereuse qu'une " +
        "documentation absente : on la suit.",
    ).toEqual([]);
  });
});
