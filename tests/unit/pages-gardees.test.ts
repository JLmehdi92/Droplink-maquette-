import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * CHAQUE PAGE DE L'ESPACE VENDEUR PORTE SA PROPRE GARDE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUI A MOTIVÉ CE CONTRÔLE — ET POURQUOI RIEN NE POUVAIT LE VOIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le layout de `(app)` redirige quand le profil est introuvable ou le compte
 * suspendu. Trois pages s'en contentaient. Mais Next a DÉJÀ ENGAGÉ LA RÉPONSE
 * quand cette redirection tombe : l'en-tête `location:` part, **et la charge de
 * la page part avec**. Un navigateur suit le 307 et jette le corps ; `curl`, un
 * script, un aspirateur, non.
 *
 * Mesuré le 02/09/2026 avec un cookie RÉVOQUÉ, sentinelles à l'appui :
 *
 *     cookie révoqué   RSC /fr/commandes/[id] → 200, 19 344 o
 *                      "internal_notes":"SENTINELLE-NOTE-4471"
 *     sans cookie      même route             → 200, 11 686 o, 0 occurrence
 *
 * Les trois pages qui fuyaient portaient exactement les **notes internes** — le
 * prix d'achat — et le **`public_token`**, qui transfère une CAPACITÉ à vie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE SONDE D'INVENTAIRE, ET PAS TROIS CORRECTIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Parce qu'on ne falsifie pas une ABSENCE. Il n'y avait rien à casser pour
 * révéler ces trois pages : elles ne contenaient pas de garde fautive, elles
 * n'en contenaient aucune. Le seul contrôle qui puisse voir ça part de la LISTE
 * des pages et exige de chacune la garde — il ne peut pas dépendre de ce qu'un
 * auteur a pensé à inspecter, puisque c'est précisément la pensée qui a manqué.
 *
 * IL ÉCHOUE DANS LES DEUX SENS : une page sans garde, et une exception déclarée
 * qui ne désigne plus aucun fichier — celle-là couvrirait en silence le jour où
 * le chemin revient sur une page différente.
 */

const RACINE = process.cwd();
const ESPACE_VENDEUR = join(RACINE, "src", "app", "[locale]", "(app)");

/** La garde qui redirige quand le profil manque OU que le compte est suspendu. */
const GARDE = "exigerVendeur(";

/**
 * Les pages de `(app)` dispensées de garde, avec leur raison.
 *
 * VIDE AUJOURD'HUI, et c'est le bon état : les six pages la portent. La table
 * existe pour que la dispense soit un GESTE ÉCRIT, avec sa justification, et non
 * un oubli indiscernable d'une décision.
 */
const DISPENSEES: ReadonlyMap<string, string> = new Map();

function pages(dossier: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (courant: string): void => {
    for (const entree of readdirSync(courant)) {
      const chemin = join(courant, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (entree === "page.tsx") trouves.push(chemin);
    }
  };
  parcourir(dossier);
  return trouves;
}

/** Le CODE, commentaires retirés — sinon la sonde se satisfait du commentaire qui décrit la garde. */
function code(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("chaque page de l'espace vendeur porte sa propre garde", () => {
  const trouvees = pages(ESPACE_VENDEUR);

  test("la sonde trouve réellement des pages", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Un dossier renommé, un groupe déplacé, et
    // ce fichier deviendrait vert en ne regardant plus rien — exactement l'état
    // qu'il existe pour empêcher.
    expect(
      trouvees.length,
      "aucune page trouvée sous (app) : la sonde vise à côté",
    ).toBeGreaterThanOrEqual(6);
  });

  test("aucune page ne s'en remet au layout", () => {
    const sansGarde = trouvees
      .filter((p) => !code(p).includes(GARDE))
      .map((p) => relative(RACINE, p))
      .filter((p) => !DISPENSEES.has(p));

    expect(
      sansGarde,
      "Ces pages n'appellent pas `exigerVendeur` et s'en remettent à la " +
        "redirection du layout. Elle arrive APRÈS que Next a engagé la réponse : " +
        "la charge de la page part avec le 307, et un client qui ne suit pas la " +
        "redirection la lit. C'est ainsi que les notes internes et le " +
        "`public_token` sont sortis avec un cookie révoqué.",
    ).toEqual([]);
  });

  test("la garde vient AVANT la première lecture de la page", () => {
    /*
     * L'ORDRE EST LA PROTECTION, pas la présence.
     *
     * `page-client` ne rend rien : elle lit un `public_token` et redirige. Une
     * garde posée après cette lecture laisserait le jeton partir dans l'en-tête
     * `location:`. Le contrôle porte donc sur la POSITION de l'appel par rapport
     * au premier accès à la base.
     */
    const enRetard: string[] = [];
    for (const page of trouvees) {
      const nom = relative(RACINE, page);
      if (DISPENSEES.has(nom)) continue;

      /*
       * ⚠️ LE CONTRÔLE PORTE SUR LE CORPS DU COMPOSANT, PAS SUR LE FICHIER.
       *
       * Première version : elle comparait des positions dans le fichier entier
       * et accusait l'éditeur — qui définit `lireCommandeEditee` au niveau du
       * module, donc AVANT le composant. Une lecture déclarée n'est pas une
       * lecture exécutée. La sonde criait au loup sur une page correcte, et un
       * garde qui crie à tort est un garde qu'on finit par désactiver.
       */
      const fichier = code(page);
      const debutComposant = fichier.indexOf("export default async function");
      const source = debutComposant === -1 ? fichier : fichier.slice(debutComposant);

      const garde = source.indexOf(GARDE);
      if (garde === -1) continue; // déjà signalé par le contrôle précédent

      // La première lecture de données : un client Supabase employé, ou l'une
      // des fonctions de lecture du produit.
      const lectures = [".from(", "lireCommandes(", "lireCommandeEditee(", "compterParEtat("];
      for (const lecture of lectures) {
        const i = source.indexOf(lecture);
        if (i !== -1 && i < garde) {
          enRetard.push(`${nom} lit « ${lecture} » avant sa garde`);
          break;
        }
      }
    }

    expect(
      enRetard,
      "La garde doit précéder toute lecture : sinon la donnée est déjà " +
        "rassemblée quand on décide de refuser, et elle part avec la réponse.",
    ).toEqual([]);
  });

  test("chaque dispense désigne encore une page réelle", () => {
    // L'AUTRE SENS. Une dispense orpheline couvrirait silencieusement le jour où
    // ce chemin revient sur une page différente.
    const noms = new Set(trouvees.map((p) => relative(RACINE, p)));
    for (const [nom, raison] of DISPENSEES) {
      expect(noms.has(nom), `${nom} est dispensée mais n'existe plus`).toBe(true);
      expect(raison.length, `La dispense de ${nom} n'explique rien`).toBeGreaterThan(80);
    }
  });
});
