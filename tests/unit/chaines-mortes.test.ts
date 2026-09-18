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
  /*
   * ⚠️ CES DIX-HUIT FAMILLES ONT ÉTÉ RÉVÉLÉES LE 31/08/2026, quand la recherche a
   * cessé de porter sur TOUT le code pour ne porter que sur les fichiers qui
   * déclarent l'espace. Elles passaient jusque-là par COLLISION : leur dernier
   * segment — `expedie`, `livre`, `Ko`, `nom`, `refuse` — apparaît ailleurs dans
   * le code pour de tout autres raisons.
   *
   * Elles étaient donc « vivantes » sans que personne ne l'ait établi, et la
   * même collision protégeait des clés RÉELLEMENT mortes. Les déclarer, c'est
   * échanger une couverture illusoire contre une couverture connue.
   */
  ["marque.logoErreur.", "composé depuis le motif de refus d'un logo — réglages de marque"],
  ["envois.etat.", "composé depuis l'état du colis rendu par `compter_envois`"],
  /* Les six questions de la documentation sont rendues par une boucle sur
     `[1..6]`, qui compose `faqQ${n}` et `faqR${n}`. Les écrire à plat aurait
     donné douze appels identiques à une ligne près. */
  ["docs.faqQ", "composé depuis le rang de la question — documentation"],
  ["docs.faqR", "composé depuis le rang de la question — documentation"],
  ["envois.tri.", "composé depuis le tri choisi — tableau des envois"],
  ["analyses.periode.", "composé depuis la période choisie — sélecteur des Analyses"],
  ["commandes.statut.", "composé depuis `orders.status` — badge de la liste"],
  ["commandes.tri.", "composé depuis le tri choisi — liste des commandes"],
  ["commandes.lot.", "composé depuis le motif d'échec d'une action groupée"],
  ["editeur.historique.types.", "composé depuis `order_events.type` — historique de la commande"],
  ["editeur.statut.", "composé depuis `orders.status` — sélecteur de l'éditeur"],
  ["editeur.qc.", "composé depuis `orders.qc_status` — sélecteur de l'éditeur"],
  ["admin.boutiques.colonnes.", "composé depuis la colonne de tri — liste des boutiques"],
  ["admin.boutiques.filtre.", "composé depuis `profiles.account_type` — filtre des boutiques"],
  ["admin.unites.", "composé depuis l'unité rendue par `mettreOctetsALEchelle`"],
  ["admin.surveillance.etat.", "composé depuis l'état du veilleur"],
  ["admin.surveillance.tache.", "composé depuis `scheduler_heartbeat.source`"],
  ["admin.surveillance.degradation.", "composé depuis la décision de `surPanne`"],
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
    "marque.langue.",
    "composé depuis `LANGUES` — le sélecteur de langue des pages client. Les " +
      "options étaient ÉNUMÉRÉES jusqu'au 06/09/2026 : une troisième langue " +
      "serait entrée dans le produit sans jamais apparaître dans cette liste, " +
      "et un `<select>` dont la valeur ne correspond à aucune option affiche " +
      "la PREMIÈRE — un vendeur réglé en chinois aurait lu « Français », et " +
      "son prochain enregistrement aurait écrasé son propre choix.",
  ],
  [
    "admin.journal.fenetre.",
    "composé depuis FENETRES_JOURNAL — filtres du journal d'audit",
  ],
  [
    "admin.journal.famille.",
    "composé depuis FAMILLES_JOURNAL — filtres du journal d'audit",
  ],
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

/** Un fichier source, dépollué, et les espaces de traduction qu'il DÉCLARE. */
type FichierSource = { readonly code: string; readonly espaces: ReadonlySet<string> };

const FICHIERS: FichierSource[] = [];

/**
 * Les espaces qu'un fichier demande explicitement.
 *
 * Quatre formes, toutes présentes dans le produit : `useTranslations("x")`,
 * `getTranslations("x")`, `getTranslations({ namespace: "x" })`, et
 * `espaces={["x", "y"]}` — celle de `TraductionsClient`.
 */
function espacesDeclares(code: string): Set<string> {
  const trouves = new Set<string>();
  for (const m of code.matchAll(/(?:use|get)Translations\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
    trouves.add(m[1] as string);
  }
  for (const m of code.matchAll(/namespace\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    trouves.add(m[1] as string);
  }
  for (const m of code.matchAll(/espaces=\{\[([^\]]*)\]/g)) {
    for (const e of (m[1] as string).matchAll(/["'`]([^"'`]+)["'`]/g)) trouves.add(e[1] as string);
  }
  return trouves;
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
        const brut = readFileSync(chemin, "utf8");
        const code = brut
          .replace(/\/\*[\s\S]*?\*\//g, " ")
          .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
        FICHIERS.push({ code, espaces: espacesDeclares(code) });
        morceaux.push(brut);
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
  const motif = new RegExp(`["'\`.]${dernier}["'\`]`);

  /*
   * ⚠️ ON NE CHERCHE PLUS DANS TOUT LE CODE, MAIS DANS LES FICHIERS QUI
   * DEMANDENT L'ESPACE.
   *
   * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 31/08/2026. Chercher le dernier segment
   * dans la source ENTIÈRE déclare une clé vivante dès que ce mot apparaît
   * n'importe où, pour n'importe quelle raison. Trois cas mesurés :
   *
   *   pied.droits          ← `id: "droits"` dans confidentialite/page.tsx
   *   pied.conditions      ← le tableau de routes de la landing
   *   pied.confidentialite ← le même tableau
   *
   * Les trois auraient survécu à la suppression de leur composant sans qu'aucun
   * appelant n'existe — et c'est exactement ce qui s'est passé : `PiedDePage`
   * était mort depuis un moment, et seule `pied.signaler` a été signalée.
   * Toutes les clés dont le dernier segment est `titre`, `nom`, `annuler` ou
   * `valider` étaient structurellement inattaquables.
   *
   * LE REPLI EST DÉLIBÉRÉ : quand AUCUN fichier ne déclare l'espace, on
   * retombe sur la recherche globale. Une clé peut être lue par `t.raw()` puis
   * passée en propriété, ou résolue dans un module sans `useTranslations` — la
   * restriction produirait alors un faux mort, ce qui est le défaut symétrique
   * et coûte plus cher : on retire une chaîne qui s'affiche.
   */
  const candidats = FICHIERS.filter((f) => {
    for (let i = 1; i <= segments.length - 1; i += 1) {
      if (f.espaces.has(segments.slice(0, i).join("."))) return true;
    }
    return false;
  });

  if (candidats.length === 0) return motif.test(SOURCE);
  return candidats.some((f) => motif.test(f.code));
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
