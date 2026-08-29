import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LES CHAÎNES DE TRADUCTION QUE PLUS RIEN N'APPELLE.
 *
 * DÉFAUT QUI A MOTIVÉ CE CONTRÔLE : un namespace entier, `pagePublique`, neuf
 * chaînes, survivait à la refonte de la page publique. Rien ne l'appelait
 * depuis des semaines. Il n'a été trouvé qu'en relisant les catalogues à la
 * main pour une autre raison — c'est-à-dire par hasard, ce qui est exactement
 * ce qu'un contrôle doit remplacer.
 *
 * POURQUOI CE N'EST PAS COSMÉTIQUE. Une chaîne morte se traduit, se relit et se
 * corrige comme les autres : elle consomme du travail. Pire, elle MENT — deux
 * namespaces portaient une clé `titre` avec des valeurs différentes (« Suivi de
 * commande » et « Votre commande »), et rien ne disait laquelle était affichée.
 * Devant un doute sur le libellé, on corrige la mauvaise et le produit ne bouge
 * pas.
 *
 * LE PIÈGE DE CE CONTRÔLE, ET SA RÉPONSE. Beaucoup de clés sont appelées
 * DYNAMIQUEMENT — `t(\`panneau.tache.${etat}\`)` — et aucune recherche textuelle
 * ne les trouvera. Un contrôle naïf les déclarerait toutes mortes, on le
 * désactiverait dans l'heure, et il ne protégerait plus rien. Les préfixes
 * dynamiques sont donc DÉCLARÉS, avec la raison et l'endroit qui les compose.
 *
 * IL ÉCHOUE DANS LES DEUX SENS : une clé que rien n'appelle, mais aussi un
 * préfixe dynamique déclaré qui ne couvre plus rien. Sans le second, une
 * déclaration posée pour un écran supprimé continuerait de couvrir tout un pan
 * du catalogue.
 */

/**
 * Les familles de clés composées à l'exécution.
 *
 * Chaque entrée dit QUI la compose : sans cela, la liste devient l'endroit où
 * l'on range ce qu'on ne veut pas expliquer, et le contrôle ne prouve plus rien.
 */
const PREFIXES_DYNAMIQUES: ReadonlyMap<string, string> = new Map([
  [
    "admin.panneau.alerte.",
    "composé depuis le genre d'alerte rendu par `alertes_admin` — page admin",
  ],
  [
    "admin.panneau.alerteDetail.",
    "composé depuis le même genre d'alerte, pour la ligne de détail — page admin",
  ],
  [
    "admin.fiche.evenement.",
    "composé depuis le type d'événement rendu par `lire_compte_admin` — fiche de compte",
  ],
  [
    "admin.langues.",
    "composé depuis `profiles.locale` — fiche de compte",
  ],
  [
    "admin.journal.fenetre.",
    "composé depuis FENETRES_JOURNAL — filtres du journal d'audit",
  ],
  [
    "admin.journal.famille.",
    "composé depuis FAMILLES_JOURNAL — filtres du journal d'audit",
  ],
  ["admin.panneau.tache.", "composé depuis l'état du veilleur — page admin"],
  [
    "admin.surveillance.indicateur.",
    "composé depuis l'indicateur rendu par `sante_infrastructure`",
  ],
  ["admin.surveillance.genre.", "composé depuis le genre d'indicateur"],
  ["admin.surveillance.absent.", "composé depuis la liste NON_MESURE"],
  ["admin.parametres.cles.", "composé depuis la clé du paramètre — écran des réglages"],
  ["admin.parametres.erreur.", "composé depuis le motif de refus"],
  ["admin.comptes.type.", "composé depuis `account_type`"],
  ["admin.comptes.roles.", "composé depuis `role`"],
  ["admin.comptes.statuts.", "composé depuis `status`"],
  ["admin.journal.actions.", "composé depuis l'action tracée"],
  ["admin.suspension.erreur.", "composé depuis le SQLSTATE traduit"],
  ["page-publique.frise.", "composé depuis le statut normalisé du colis"],
  [
    "landing.fonctionnalites.",
    "composé depuis la liste des trois bénéfices — landing, section « ce que ça vous enlève »",
  ],
  [
    "landing.flottant.",
    "composé depuis la liste des trois cartes flottantes de la scène du téléphone — landing",
  ],
  ["commandes.qc.", "composé depuis le statut QC"],
  ["medias.refus.", "composé depuis le motif de refus d'un média"],
  ["legal.signalement.cat_", "composé depuis la catégorie de signalement"],
  ["marque.erreur.", "composé depuis le champ en échec"],
]);

/** Aplatit un catalogue en chemins de clés. */
function cles(objet: unknown, prefixe = ""): string[] {
  if (typeof objet === "string") return [prefixe];
  if (objet === null || typeof objet !== "object") return [];
  return Object.entries(objet as Record<string, unknown>).flatMap(([cle, valeur]) =>
    cles(valeur, prefixe === "" ? cle : `${prefixe}.${cle}`),
  );
}

/** Tout le code source, concaténé, commentaires RETIRÉS. */
function sourceComplete(): string {
  const morceaux: string[] = [];

  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) {
        parcourir(chemin);
      } else if (/\.(ts|tsx)$/.test(entree)) {
        morceaux.push(readFileSync(chemin, "utf8"));
      }
    }
  };
  parcourir(join(process.cwd(), "src"));

  // LES COMMENTAIRES SONT RETIRÉS. Ce fichier-ci et beaucoup d'autres CITENT des
  // clés dans leurs commentaires ; les garder ferait passer une clé morte pour
  // vivante parce qu'un commentaire la mentionne — un garde qui se satisfait du
  // commentaire décrivant la garde.
  return morceaux
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const CATALOGUE = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "fr.json"), "utf8"),
) as unknown;

const TOUTES = cles(CATALOGUE);
const SOURCE = sourceComplete();

/**
 * Une clé est atteignable si son dernier segment apparaît dans le code, ou si
 * elle tombe sous un préfixe dynamique déclaré.
 *
 * On cherche le SEGMENT et non le chemin complet : `t()` est appelé sur un
 * namespace, donc le chemin entier n'apparaît jamais littéralement.
 */
function atteignable(chemin: string): boolean {
  for (const prefixe of PREFIXES_DYNAMIQUES.keys()) {
    if (chemin.startsWith(prefixe)) return true;
  }
  const segments = chemin.split(".");
  const dernier = segments[segments.length - 1] ?? "";
  // Encadré par un guillemet ou un point : sans cela, `titre` serait trouvé
  // dans `metaTitre` et une clé morte passerait pour vivante.
  return new RegExp(`["'\`.]${dernier}["'\`]`).test(SOURCE);
}

describe("Les chaînes de traduction", () => {
  test("la sonde inspecte réellement le catalogue et le code", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : si le catalogue ou la source ne se lisent
    // pas, tout serait déclaré atteignable et le contrôle serait vert et muet.
    expect(TOUTES.length, "catalogue vide ou illisible").toBeGreaterThan(400);
    expect(SOURCE.length, "code source vide ou illisible").toBeGreaterThan(100_000);
    expect(SOURCE.includes("useTranslations"), "la source lue n'appelle rien").toBe(true);
  });

  test("aucune chaîne n'est morte", () => {
    const mortes = TOUTES.filter((c) => !atteignable(c));
    expect(
      mortes,
      `Chaînes que plus rien n'appelle : ${mortes.join(", ")}. ` +
        "Les retirer, ou déclarer leur préfixe dynamique avec sa raison.",
    ).toEqual([]);
  });

  test("chaque préfixe dynamique déclaré couvre encore des clés RÉELLES", () => {
    // SECOND SENS. Une déclaration posée pour un écran depuis supprimé
    // continuerait de couvrir tout un pan du catalogue, et les chaînes mortes
    // qu'il contient ne seraient plus jamais signalées.
    const steriles = [...PREFIXES_DYNAMIQUES.keys()].filter(
      (p) => !TOUTES.some((c) => c.startsWith(p)),
    );
    expect(
      steriles,
      `Préfixes dynamiques qui ne couvrent plus rien : ${steriles.join(", ")}. Les retirer.`,
    ).toEqual([]);
  });
});
