import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * LES DEUX BOUTS DU CONTRAT `FormData` PORTENT LE MÊME NOM.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE GARDE EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'onboarding rendait `<input name="nom">` et son action lisait
 * `donnees.get("nomBoutique")`. Les deux ne se sont JAMAIS rencontrés : le nom
 * de boutique saisi à l'inscription était jeté, pour tous les comptes, depuis
 * toujours.
 *
 * ⚠️ ET RIEN NE POUVAIT LE DIRE. Le champ est facultatif, donc l'absence est un
 * état légitime ; `z.string().optional()` accepte l'absence sans un mot ;
 * l'écran redirigeait vers les commandes, c'est-à-dire qu'il AFFIRMAIT le
 * succès ; et la page publique omet son en-tête quand la boutique n'a pas de
 * nom — un comportement que le brief décrit comme « le cas principal, pas un
 * repli dégradé ». Le défaut se présentait donc partout comme une décision de
 * produit. Trouvé en pilotant la mutation, en comparant l'écran À LA BASE.
 *
 * Il fausse aussi une mesure : l'événement de fin d'onboarding porte
 * `boutique_nommee`, qui valait `false` pour tout le monde. Une métrique
 * légèrement fausse est pire qu'une métrique cassée — elle reste crédible.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL VÉRIFIE, DANS LES DEUX SENS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un contrat `FormData` est un accord sur des CHAÎNES, tenu par deux fichiers
 * qui ne se compilent pas l'un contre l'autre : le typage de TypeScript ne le
 * voit pas, et il ne le verra jamais. Alors on l'inventorie.
 *
 *   SENS 1 — tout `name="…"` rendu par un composant qui importe une Server
 *   Action DOIT être lu par l'une des actions qu'il importe. Sinon la saisie
 *   part et personne ne la reçoit.
 *
 *   SENS 2 — toute clé lue par une action DOIT exister, en toutes lettres, dans
 *   au moins un des composants qui l'importent. Sinon l'action attend une
 *   valeur que personne n'envoie.
 *
 * Le sens 2 se juge sur l'UNION des composants d'une même action : `Connexion`
 * et `BoutonGoogle` postent tous deux vers l'action de connexion et n'envoient
 * pas les mêmes champs. Et le côté composant compte AUSSI les `donnees.set("…")`
 * — l'identifiant du compte à suspendre et la clé d'un paramètre système sont
 * posés par le code, pas par un champ de saisie, et ce sont de vraies clés.
 *
 * ⚠️ TOUT EST LU SUR LE CODE, COMMENTAIRES RETIRÉS. Un motif qui se satisfait
 * du commentaire décrivant un champ ne prouve rien du champ.
 *
 * ⚠️ IL N'Y A AUCUNE LISTE D'EXCEPTIONS, ET C'EST VOULU. Le jour où il en
 * faudra une, elle s'écrira ici avec sa raison — pas dans un silence.
 */

const RACINE = process.cwd();

function fichiers(dossier: string, suffixe: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    if (entree === "node_modules" || entree === ".next") continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiers(chemin, suffixe));
    else if (entree.endsWith(suffixe)) trouves.push(chemin);
  }
  return trouves;
}

/** Le CODE seul : un commentaire qui cite un champ n'est pas un champ. */
function code(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function motifs(source: string, motif: RegExp): Set<string> {
  const vus = new Set<string>();
  for (const m of source.matchAll(motif)) if (m[1] !== undefined) vus.add(m[1]);
  return vus;
}

/**
 * `@/app/[locale]/bienvenue/actions` -> le chemin réel du module.
 *
 * ⚠️ `@/lib/…/actions` COMPTE AUTANT QUE `@/app/…/actions`. Ce motif ne visait
 * d'abord que `@/app`, et il laissait donc `@/lib/commandes/actions` — les trois
 * gestes de la liste — entièrement hors de l'inventaire. Un garde qui choisit
 * où regarder finit par regarder là où le défaut n'est pas.
 */
function moduleDepuisImport(specifieur: string): string {
  return join(RACINE, "src", specifieur.slice("@/".length) + ".ts").replace(/\//g, sep);
}

interface Couple {
  readonly composant: string;
  readonly actions: readonly string[];
  /** Ce que le composant ENVOIE : champs rendus et clés posées à la main. */
  readonly envoie: Set<string>;
  /** Tout littéral de chaîne du composant, pour juger le sens 2. */
  readonly litteraux: Set<string>;
}

/**
 * Les `name=` des formulaires PILOTÉS — ceux dont l'`action` est une fonction
 * (Server Action) ou qui POSTENT vers l'un de nos route handlers.
 *
 * ⚠️ UN FORMULAIRE `GET` DE FILTRES N'ENVOIE RIEN À PERSONNE : il navigue, et
 * ses champs sont relus depuis l'URL par un tout autre contrat. Les compter
 * faisait accuser l'écran des commandes de perdre sept saisies qu'il ne perd
 * pas — et un garde qui crie à tort est un garde qu'on finit par désactiver.
 */
function champsDesFormulairesPilotes(source: string): Set<string> {
  const noms = new Set<string>();

  for (const ouverture of source.matchAll(/<form\b/g)) {
    const debut = ouverture.index;
    const finBalise = source.indexOf(">", debut);
    if (finBalise === -1) continue;

    const attributs = source.slice(debut, finBalise);

    // ⚠️ LA MÉTHODE PRIME SUR TOUT LE RESTE. Le formulaire de recherche s'écrit
    // `<form method="get" action={base}>` : son `action` EST une expression, et
    // s'arrêter là le classait parmi les formulaires pilotés. Il ne poste rien —
    // il navigue vers une URL que la page relit ensuite depuis `searchParams`.
    if (/method="get"/i.test(attributs)) continue;
    if (!/action=\{/.test(attributs) && !/method="post"/i.test(attributs)) continue;

    // La fin du formulaire, en comptant les imbrications : celui du lot enveloppe
    // tout le tableau, et s'arrêter au premier `</form>` venu lui ferait perdre
    // la case à cocher de la sélection.
    let profondeur = 1;
    let i = finBalise;
    while (profondeur > 0) {
      const ouvre = source.indexOf("<form", i + 1);
      const ferme = source.indexOf("</form>", i + 1);
      if (ferme === -1) break;
      if (ouvre !== -1 && ouvre < ferme) {
        profondeur++;
        i = ouvre;
      } else {
        profondeur--;
        i = ferme;
      }
    }

    for (const n of motifs(source.slice(finBalise, i), /\bname="([a-zA-Z_][a-zA-Z0-9_]*)"/g)) {
      noms.add(n);
    }
  }

  return noms;
}

/**
 * Un module est un RÉCEPTEUR DE FORMULAIRE s'il déclare un paramètre `FormData`.
 *
 * ⚠️ CE CRITÈRE A REMPLACÉ UNE CONVENTION DE NOM, et c'est ce qui compte ici. Le
 * motif ne visait d'abord que `@/app/…/actions` : il laissait donc
 * `@/lib/commandes/actions` — les trois gestes de la liste — entièrement hors de
 * l'inventaire, sans que rien ne le dise. **Un garde qui choisit où regarder
 * finit par regarder là où le défaut n'est pas.** Le nouveau critère suit ce que
 * le module FAIT, pas où il est rangé, et il a rattrapé du même coup
 * `@/lib/commandes/geste-liste`, qui n'existait pas quand il a été écrit.
 */
const recepteurs = new Map<string, boolean>();
function recepteurDeFormulaire(chemin: string): boolean {
  const connu = recepteurs.get(chemin);
  if (connu !== undefined) return connu;
  const reponse = existsSync(chemin) && /:\s*FormData\b/.test(code(chemin));
  recepteurs.set(chemin, reponse);
  return reponse;
}

const couples: Couple[] = [];
for (const composant of fichiers(join(RACINE, "src"), ".tsx")) {
  const source = code(composant);
  const actions = [...motifs(source, /from "(@\/[^"]*)"/g)]
    .map(moduleDepuisImport)
    .filter(recepteurDeFormulaire);
  if (actions.length === 0) continue;

  const envoie = new Set<string>([
    ...champsDesFormulairesPilotes(source),
    // Les clés posées par le CODE, hors de tout formulaire : l'identifiant du
    // compte à suspendre et la clé d'un paramètre système en sont.
    ...motifs(source, /\.set\("([a-zA-Z_][a-zA-Z0-9_]*)"/g),
  ]);

  couples.push({
    composant: relative(RACINE, composant),
    actions,
    envoie,
    litteraux: motifs(source, /"([a-zA-Z_][a-zA-Z0-9_]*)"/g),
  });
}

/** Les clés qu'une action lit dans son `FormData`. */
const lues = new Map<string, Set<string>>();
for (const couple of couples) {
  for (const action of couple.actions) {
    if (lues.has(action)) continue;
    // `getAll` AUTANT QUE `get` : la sélection d'un lot arrive en plusieurs
    // valeurs sous le même nom. Ne pas la compter rendait le champ `selection`
    // invisible à l'inventaire, donc non couvert — le trou exact que ce fichier
    // existe pour interdire.
    lues.set(action, motifs(code(action), /\.get(?:All)?\("([a-zA-Z_][a-zA-Z0-9_]*)"\)/g));
  }
}

describe("Le contrat FormData tient des deux côtés", () => {
  test("CONTRE-TEST : la sonde voit des formulaires ET des clés", () => {
    // Un ensemble vide passe tout. Si le repérage des composants ou des actions
    // cessait de trouver quoi que ce soit — un dossier renommé, un autre style
    // d'import —, ce garde deviendrait vert à vide, exactement l'état qu'il
    // existe pour empêcher.
    expect(couples.length, "aucun composant n'importe de Server Action").toBeGreaterThan(3);
    expect(lues.size, "aucune action lisant un FormData trouvée").toBeGreaterThan(2);

    const totalLues = [...lues.values()].reduce((n, s) => n + s.size, 0);
    expect(totalLues, "aucune clé lue : la comparaison ne prouverait rien").toBeGreaterThan(8);

    for (const couple of couples) {
      expect(
        couple.envoie.size + couple.actions.length,
        `${couple.composant} n'expose aucune clé : la sonde ne l'inspecte pas`,
      ).toBeGreaterThan(0);
    }
  });

  test("CONTRE-TEST : les formulaires en POST NATIF sont bien inventoriés", () => {
    /*
     * Le repérage des formulaires a DEUX branches — `action={fonction}` et
     * `method="post"` —, et rien ne dirait que la seconde a cessé de trouver
     * quoi que ce soit : les couples resteraient nombreux, les sens 1 et 2
     * resteraient verts, et les trois gestes de la liste sortiraient de
     * l'inventaire en silence. C'est précisément l'état d'où vient ce fichier.
     *
     * On ne nomme aucun composant : on part de ce que le code CONTIENT.
     */
    const enPost = fichiers(join(RACINE, "src"), ".tsx").filter((f) =>
      /method="post"/i.test(code(f)),
    );
    expect(
      enPost.length,
      "aucun formulaire en POST natif : cette branche du repérage n'est pas exercée",
    ).toBeGreaterThan(0);

    for (const fichier of enPost) {
      const nom = relative(RACINE, fichier);
      const couple = couples.find((c) => c.composant === nom);
      expect(couple, `${nom} poste un formulaire et n'est pas dans l'inventaire`).toBeDefined();
      expect(
        couple?.envoie.size ?? 0,
        `${nom} poste un formulaire sans qu'aucun champ soit relevé`,
      ).toBeGreaterThan(0);
    }
  });

  test("SENS 1 : tout champ envoyé est lu par une action du composant", () => {
    const perdus: string[] = [];

    for (const couple of couples) {
      const attendues = new Set<string>();
      for (const action of couple.actions) {
        for (const cle of lues.get(action) ?? []) attendues.add(cle);
      }
      // Un composant dont aucune action ne lit de FormData ne promet rien : le
      // bouton Google poste sans champ, et ce n'est pas un défaut.
      if (attendues.size === 0) continue;

      for (const cle of couple.envoie) {
        if (!attendues.has(cle)) {
          perdus.push(
            `${couple.composant} envoie « ${cle} », qu'aucune de ses actions ne lit ` +
              `(elles lisent : ${[...attendues].sort().join(", ")})`,
          );
        }
      }
    }

    expect(
      perdus,
      "un champ est envoyé et personne ne le reçoit : la saisie est jetée en silence.\n" +
        perdus.join("\n"),
    ).toEqual([]);
  });

  test("SENS 2 : toute clé lue est envoyée par au moins un de ses composants", () => {
    const introuvables: string[] = [];

    for (const [action, cles] of lues) {
      const emetteurs = couples.filter((c) => c.actions.includes(action));
      expect(emetteurs.length, `${action} n'a aucun émetteur : rien à comparer`).toBeGreaterThan(0);

      for (const cle of cles) {
        // On accepte tout littéral du composant, pas seulement un `name="…"` :
        // les réseaux sociaux de l'écran Marque sont rendus par une boucle sur
        // `clef: "instagram"`, et exiger la forme littérale de l'attribut
        // interdirait une écriture parfaitement correcte.
        const porte = emetteurs.some((c) => c.envoie.has(cle) || c.litteraux.has(cle));
        if (!porte) {
          introuvables.push(
            `${relative(RACINE, action)} lit « ${cle} », qu'aucun de ses composants n'envoie ` +
              `(${emetteurs.map((c) => c.composant).join(", ")})`,
          );
        }
      }
    }

    expect(
      introuvables,
      "une action attend une clé que personne n'envoie : le champ vaudra toujours vide.\n" +
        introuvables.join("\n"),
    ).toEqual([]);
  });
});
