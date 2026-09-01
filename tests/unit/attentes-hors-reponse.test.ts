import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * CE QUE LE VENDEUR ATTEND, ET CE QU'IL N'A PAS À ATTENDRE.
 *
 * DÉFAUT DE PERFORMANCE RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026 : sauvegarder un
 * seul champ de l'éditeur enchaînait SIX allers-retours en série avant de
 * répondre — profil, écriture, colis, marque de premier contenu,
 * instrumentation, journal. Deux d'entre eux ne sont destinés à personne qui
 * regarde l'écran.
 *
 * L'instrumentation est configurée en `flushAt: 1` : un POST HTTP par
 * événement, attendu. Tant que PostHog n'est pas branché, `emettre()` sort
 * immédiatement — c'est pourquoi le défaut était invisible. Le jour où la clé
 * est renseignée, chaque clic paie un aller-retour vers l'UE, en série, AVANT
 * la réponse. Un défaut qui n'existe pas encore et qui apparaîtra le jour de la
 * mise en service est pire qu'un défaut visible : personne ne le cherchera.
 *
 * CE CONTRÔLE INVENTORIE LES ATTENTES et exige qu'elles soient DÉCLARÉES avec
 * leur raison. Il ne cherche pas à interdire : il y a de bonnes raisons
 * d'attendre — deux appelants exploitent le retour pour rendre une marque en
 * base, ce qui est précisément ce qui empêche de perdre un dénominateur. Ce
 * qu'on interdit, c'est d'attendre SANS L'AVOIR DÉCIDÉ.
 *
 * IL ÉCHOUE DANS LES DEUX SENS : une attente non déclarée, et une déclaration
 * qui ne correspond plus à rien.
 */

const RACINE = join(process.cwd(), "src");

/**
 * Les attentes légitimes, et pourquoi. Clé : `fichier → symbole attendu`.
 *
 * La raison est OBLIGATOIRE et vérifiée : sans elle, cette liste devient
 * l'endroit où l'on range ce qu'on ne veut pas expliquer, et le contrôle ne
 * prouve plus rien.
 */
const ATTENTES_ADMISES: ReadonlyMap<string, string> = new Map([
  [
    "emettre.ts → emettre",
    "c'est la définition elle-même : `emettreApres` confie cette promesse à " +
      "`after`, qui l'attend. Une promesse non attendue perdrait l'événement en " +
      "silence, ce qui est exactement le piège que le brief nomme.",
  ],
  [
    "journal.ts → journaliser",
    "idem : la définition de `journaliserApres`, dont la promesse est attendue " +
      "par `after`.",
  ],
  [
    // ⚠️ CETTE DÉCLARATION DISAIT `retour/route.ts` JUSQU'AU 01/09/2026. Le
    // comptage des inscriptions ne vivait que dans le retour du lien magique,
    // c'est-à-dire dans le SEUL chemin qui ouvrait une session. Avec le mot de
    // passe il y en a trois : l'émission est descendue dans `apres-session`, que
    // les trois appellent. Le déplacement a été signalé par ce test, dans les
    // deux sens — attente non déclarée d'un côté, déclaration orpheline de
    // l'autre.
    "apres-session.ts → emettre",
    "l'inscription RÉCLAME une marque à usage unique en base et la REND si " +
      "l'événement n'est pas parti. Sans le retour, la marque serait consommée " +
      "pour un événement perdu, sans réémission possible — et l'inscription est " +
      "le DÉNOMINATEUR du taux d'activation : sa perte ferait monter le taux, " +
      "du côté rassurant.",
  ],
  [
    "ecriture.ts → emettre",
    "création de commande : même mécanisme de marque réclamée puis rendue. " +
      "C'est le meilleur code d'instrumentation du dépôt, et il exige le retour.",
  ],
  [
    "cadence.ts → emettre",
    "tâche de fond du planificateur : aucun humain n'attend cette réponse, et " +
      "`after` n'aurait rien à différer puisqu'il n'y a pas de réponse à rendre " +
      "en premier.",
  ],
  [
    "ingestion.ts → emettre",
    "chemin machine (cadence et notifications du transporteur) : aucun écran " +
      "n'attend derrière.",
  ],
  [
    "prise-en-charge.ts → emettre",
    "appelée depuis la cadence et depuis l'attache d'un colis, elle-même déjà " +
      "sortie du chemin de réponse par `after`. Attendre deux fois n'aurait " +
      "aucun effet visible.",
  ],
]);

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

/** Les symboles dont l'attente coûte un aller-retour à qui regarde l'écran. */
const DIFFERABLES = ["emettre", "journaliser"] as const;

function attentes(): readonly string[] {
  const trouvees: string[] = [];
  for (const chemin of fichiers(RACINE)) {
    const source = sansCommentaires(readFileSync(chemin, "utf8"));
    const nom = chemin.split(/[\\/]/).pop() as string;
    // Le dossier est inclus quand le nom seul serait ambigu : `route.ts` et
    // `page.tsx` existent des dizaines de fois.
    const segments = chemin.split(/[\\/]/);
    const etiquette =
      nom === "route.ts" || nom === "page.tsx" || nom === "actions.ts"
        ? `${segments[segments.length - 2] as string}/${nom}`
        : nom;

    for (const symbole of DIFFERABLES) {
      // `await emettre(` et non `await emettreApres(` : la borne de mot évite
      // que la version différée soit comptée comme une attente.
      if (new RegExp(`await\\s+${symbole}\\(`).test(source)) {
        trouvees.push(`${etiquette} → ${symbole}`);
      }
    }
  }
  return [...new Set(trouvees)];
}

describe("rien n'est attendu sans qu'on ait décidé de l'attendre", () => {
  const trouvees = attentes();

  // UN ENSEMBLE VIDE PASSE TOUT. Si le motif cessait de coller, cette suite
  // deviendrait verte en ne trouvant plus AUCUNE attente — y compris les
  // légitimes, qui existent et doivent être vues.
  test("la sonde trouve réellement des attentes", () => {
    expect(trouvees.length, "aucune attente trouvée : la lecture est fausse").toBeGreaterThan(4);
  });

  test("chaque attente est déclarée, avec sa raison", () => {
    const nonDeclarees = trouvees.filter((a) => !ATTENTES_ADMISES.has(a));
    expect(
      nonDeclarees,
      "Ces appels font attendre au vendeur un aller-retour qui ne lui est pas " +
        "destiné. Employer `emettreApres` / `journaliserApres`, ou déclarer " +
        "l'attente ici avec sa raison.",
    ).toEqual([]);
  });

  // L'AUTRE SENS. Une déclaration périmée couvrirait tout ce qu'on ajouterait
  // ensuite dans ce fichier, sans que personne relise la raison.
  test("chaque déclaration correspond encore à une attente réelle", () => {
    for (const [cle, raison] of ATTENTES_ADMISES) {
      expect(raison.length, `${cle} : déclaration sans raison`).toBeGreaterThan(40);
      expect(trouvees, `${cle} : déclaration devenue inutile, à retirer`).toContain(cle);
    }
  });
});
