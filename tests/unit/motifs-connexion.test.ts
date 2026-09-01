import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES MOTIFS D'ÉCHEC DE CONNEXION.
 *
 * DÉFAUT QUI A MOTIVÉ CE CONTRÔLE : la route de retour redirigeait vers la page
 * de connexion avec `?erreur=lien`, `?erreur=expire`, `?erreur=profil` et
 * `?erreur=suspendu` depuis le premier jour — et la page n'affichait RIEN. Un
 * lien magique expiré ramenait l'utilisateur sur un écran identique à celui
 * qu'il venait de quitter, sans un mot. Il recommence, échoue pareil, et conclut
 * que le produit ne marche pas.
 *
 * LE DÉFAUT EST DOUBLEMENT SILENCIEUX : rien n'échoue, aucun journal, aucun
 * test ne s'en plaint. Et il ne se voit que dans le cas d'échec, c'est-à-dire
 * jamais pendant qu'on développe le cas nominal.
 *
 * LE CONTRÔLE INVENTORIE PLUTÔT QU'IL NE SÉLECTIONNE : il extrait du CODE tous
 * les motifs réellement émis — quel que soit le fichier qui les émet — et exige
 * que chacun soit reconnu par la page ET traduit dans les deux langues. Il
 * n'énumère pas les motifs qu'un auteur aurait pensé à vérifier ; il lit ce que
 * le produit fait.
 *
 * IL ÉCHOUE DANS LES DEUX SENS : un motif émis et non traduit, mais aussi un
 * motif traduit que plus rien n'émet — celui-là ferait croire qu'un cas est
 * couvert alors que le chemin qui y menait a disparu.
 */

/** Tout le code source, commentaires RETIRÉS. */
function source(): string {
  const morceaux: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (/\.(ts|tsx)$/.test(entree)) morceaux.push(readFileSync(chemin, "utf8"));
    }
  };
  parcourir(join(process.cwd(), "src"));
  // Un motif cité dans un commentaire n'est pas un motif émis. Sans ce retrait,
  // le contrôle se satisferait du commentaire qui décrit le comportement au lieu
  // du comportement.
  return morceaux
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const SOURCE = source();

/**
 * Les motifs que le produit envoie réellement dans l'URL.
 *
 * DEUX SOURCES, ET LA SECONDE A ÉTÉ AJOUTÉE PARCE QUE CE TEST EST PARTI EN
 * ROUGE. Le 01/09/2026, la construction des URL de refus est descendue dans
 * `cheminDeRefus` — un seul endroit qui les fabrique, au lieu de chaînes
 * recopiées dans chaque appelant. Le motif littéral `connexion?erreur=profil` a
 * donc disparu du code au profit de `connexion?erreur=${motif}`, et cette sonde
 * a immédiatement déclaré `profil` et `fermees` orphelins.
 *
 * Elle avait raison de le dire : ce qu'elle lisait n'existait plus. La
 * correction n'est pas de la faire taire mais de lui apprendre la seconde forme
 * — l'inventaire des motifs que `cheminDeRefus` accepte, lu dans sa SIGNATURE,
 * qui est exhaustive par le type. Un motif ajouté à la fonction sans être
 * reconnu par la page fera donc échouer, comme avant.
 */
function motifsEmis(): string[] {
  const trouves = new Set<string>();
  for (const m of SOURCE.matchAll(/connexion\?erreur=([a-z_]+)/g)) {
    const motif = m[1];
    if (motif !== undefined) trouves.add(motif);
  }
  for (const motif of motifsDeCheminDeRefus()) trouves.add(motif);
  return [...trouves].sort();
}

/** Les motifs admis par `cheminDeRefus`, lus dans le type de son paramètre. */
function motifsDeCheminDeRefus(): string[] {
  const fichier = readFileSync(
    join(process.cwd(), "src", "lib", "comptes", "apres-session.ts"),
    "utf8",
  );
  const signature = /export function cheminDeRefus\(([\s\S]*?)\): string/.exec(fichier);
  if (signature === null || signature[1] === undefined) return [];
  const union = /motif:\s*([^)]+)/.exec(signature[1]);
  if (union === null || union[1] === undefined) return [];
  return [...union[1].matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((m): m is string => m !== undefined);
}

/** Les motifs que la page de connexion sait reconnaître. */
function motifsReconnus(): string[] {
  const page = readFileSync(
    join(process.cwd(), "src", "app", "[locale]", "connexion", "page.tsx"),
    "utf8",
  );
  const bloc = /const MOTIFS = \[([^\]]+)\]/.exec(page);
  if (bloc === null || bloc[1] === undefined) return [];
  return [...bloc[1].matchAll(/"([a-z_]+)"/g)]
    .map((m) => m[1])
    .filter((m): m is string => m !== undefined)
    .sort();
}

function traduits(langue: string): string[] {
  const catalogue = JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${langue}.json`), "utf8"),
  ) as { connexion?: { motif?: Record<string, string> } };
  return Object.keys(catalogue.connexion?.motif ?? {}).sort();
}

describe("Les motifs d'échec de connexion", () => {
  test("la sonde trouve réellement des motifs émis", () => {
    // UN ENSEMBLE VIDE PASSE TOUT. Si l'extraction cassait — un changement de
    // forme dans les redirections, un chemin de fichier erroné — les trois
    // contrôles suivants compareraient des listes vides et resteraient verts en
    // ne prouvant plus rien.
    expect(motifsEmis().length, "aucun motif extrait du code").toBeGreaterThanOrEqual(4);
    expect(motifsReconnus().length, "la liste de la page n'a pas été lue").toBeGreaterThanOrEqual(
      4,
    );
    // LA SECONDE SOURCE PORTE SA PROPRE BORNE. Sans elle, un changement de forme
    // de `cheminDeRefus` la rendrait vide, les motifs qu'elle seule apporte
    // repasseraient pour orphelins — et l'on retirerait de la page des cas
    // parfaitement vivants.
    expect(
      motifsDeCheminDeRefus().length,
      "la signature de `cheminDeRefus` n'a pas été lue : la sonde vise à côté",
    ).toBeGreaterThanOrEqual(3);
  });

  test("chaque motif ÉMIS est reconnu par la page de connexion", () => {
    const muets = motifsEmis().filter((m) => !motifsReconnus().includes(m));
    expect(
      muets,
      `Motifs envoyés dans l'URL que la page n'affiche pas : ${muets.join(", ")}. ` +
        "L'utilisateur revient sur un écran muet après un échec.",
    ).toEqual([]);
  });

  test("chaque motif reconnu est traduit dans LES DEUX langues", () => {
    for (const langue of ["fr", "en"]) {
      const manquants = motifsReconnus().filter((m) => !traduits(langue).includes(m));
      expect(manquants, `Motifs sans traduction ${langue} : ${manquants.join(", ")}`).toEqual([]);
    }
  });

  test("aucun motif traduit n'est devenu orphelin", () => {
    // SECOND SENS. Un motif traduit et reconnu que plus rien n'émet ferait
    // croire qu'un cas d'échec est couvert, alors que le chemin qui y menait a
    // disparu — et le prochain chemin d'échec serait écrit sans motif du tout.
    const emis = motifsEmis();
    const orphelins = motifsReconnus().filter((m) => !emis.includes(m));
    expect(
      orphelins,
      `Motifs reconnus que plus rien n'émet : ${orphelins.join(", ")}. Les retirer.`,
    ).toEqual([]);
  });
});
