import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * L'APERÇU DE L'ÉDITEUR EST LA VRAIE PAGE CLIENT — ET IL NE DOIT RIEN ÉCRIRE.
 *
 * Depuis le 26/09/2026, la fiche commande encadre `/p/<jeton>/apercu`, qui rend
 * `PageClient`, le composant même de la page publique. C'est ce qui le rend fidèle ;
 * c'est aussi ce qui le rend dangereux : chaque îlot qui ÉCRIT au nom du client y
 * arrive avec lui. Un vendeur qui clique « Approuver » dans son aperçu validerait la
 * commande à la place de son client, et une balise de vue lui ferait lire le
 * lendemain que son client a ouvert le lien.
 *
 * INVENTAIRE, PAS SÉLECTION. Ce test ne nomme pas les îlots qui écrivent : il les
 * TROUVE — tout fichier client de la page publique dont le code envoie un `POST`. Un
 * cinquième geste ajouté demain tombera dedans sans que personne y pense, et devra
 * être soit la balise de vue (posée par la seule vraie page), soit enveloppé d'
 * `Inerte` dans `PageClient`.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS, ET IL FAUT LE DIRE (L-020). Il lit du CODE. Que
 * `inert` soit réellement servi, et au bon endroit, la fumée le lit sur le HTML
 * (« Approuver » sous une enveloppe inerte dans l'aperçu, aucune sur la vraie page) ;
 * qu'un clic n'y parte pas, la sonde navigateur l'a constaté au premier passage. Ce
 * test garde le MOYEN, et échoue dès qu'il disparaît.
 */

const RACINE = process.cwd();
const PAGE_CLIENT = join("src", "components", "publique", "page-client.tsx");
const VRAIE_PAGE = join("src", "app", "p", "[token]", "page.tsx");
const APERCU = join("src", "app", "p", "[token]", "apercu", "page.tsx");

/** Le code sans ses commentaires — L-031 : un motif se satisferait sinon du commentaire qui décrit la règle. */
function codeSeul(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function fichiers(dossier: string): string[] {
  const trouves: string[] = [];
  const descendre = (d: string): void => {
    for (const entree of readdirSync(join(RACINE, d))) {
      const chemin = join(d, entree);
      if (statSync(join(RACINE, chemin)).isDirectory()) descendre(chemin);
      else if (/\.tsx?$/.test(entree)) trouves.push(chemin);
    }
  };
  descendre(dossier);
  return trouves;
}

const normaliser = (chemin: string): string => chemin.split(sep).join("/");

/**
 * CE QUI COMPTE COMME ÉCRIRE. Pas seulement `method: "POST"` écrit en toutes lettres : la
 * revue ECC du 26/09/2026 a relevé qu'un geste passant par une Server Action importée, un
 * autre verbe ou `sendBeacon` aurait échappé à l'inventaire — un faux vert, L-020. Reste
 * hors de portée une écriture cachée derrière un utilitaire au nom neutre : c'est la limite
 * d'un contrôle qui lit du code, et la fumée comme le navigateur la complètent.
 */
const ECRIT = [
  /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i,
  /sendBeacon\s*\(/,
  /from\s+["'][^"']*actions[^"']*["']/,
];

/** Les îlots de la page publique qui ÉCRIVENT. */
function ilotsQuiEcrivent(): Array<{ readonly fichier: string; readonly composants: string[] }> {
  return fichiers(join("src", "components", "publique"))
    .map((fichier) => ({ fichier, code: codeSeul(fichier) }))
    .filter(({ code }) => /^\s*["']use client["']/.test(code) && ECRIT.some((m) => m.test(code)))
    .map(({ fichier, code }) => ({
      fichier: normaliser(relative(RACINE, join(RACINE, fichier))),
      composants: [...code.matchAll(/export function (\w+)/g)].map((m) => m[1] as string),
    }));
}

/** Les fichiers de `src/` dont le code rend `<Nom`. */
function rendusDe(nom: string): string[] {
  const motif = new RegExp(`<${nom}\\b`);
  return fichiers("src")
    .filter((f) => f.endsWith(".tsx") && motif.test(codeSeul(f)))
    .map(normaliser)
    .sort();
}

describe("L'aperçu de l'éditeur ne peut rien écrire au nom du client", () => {
  const ilots = ilotsQuiEcrivent();

  test("la sonde trouve réellement les îlots qui écrivent", () => {
    // UN ENSEMBLE VIDE PASSE TOUT : sans cette borne, un motif cassé déclarerait
    // l'aperçu sûr en n'ayant rien regardé. Il y en a trois au 26/09/2026.
    const noms = ilots.flatMap((i) => i.composants);
    expect(noms).toEqual(expect.arrayContaining(["ArbitrageQc", "CarteNotifications", "BaliseVue"]));
  });

  test("la balise de vue n'est posée que par la vraie page", () => {
    expect(rendusDe("BaliseVue")).toEqual([normaliser(VRAIE_PAGE)]);
  });

  test("tout autre îlot qui écrit n'est rendu que par PageClient, et toujours sous Inerte", () => {
    const code = codeSeul(PAGE_CLIENT);
    const fautes: string[] = [];
    for (const { fichier, composants } of ilots) {
      for (const nom of composants) {
        if (nom === "BaliseVue") continue;
        const rendus = rendusDe(nom);
        // Rendu AILLEURS que dans PageClient, il échapperait au drapeau `apercu`.
        if (rendus.join() !== normaliser(PAGE_CLIENT)) {
          fautes.push(`${nom} (${fichier}) est rendu par : ${rendus.join(", ") || "rien"}`);
          continue;
        }
        for (const occurrence of code.matchAll(new RegExp(`<${nom}\\b`, "g"))) {
          const avant = code.slice(0, occurrence.index);
          const ouverture = avant.lastIndexOf("<Inerte si={apercu}>");
          const fermeture = avant.lastIndexOf("</Inerte>");
          if (ouverture < 0 || fermeture > ouverture) fautes.push(`${nom} est rendu hors d'Inerte`);
        }
      }
    }
    expect(fautes).toEqual([]);
  });

  test("Inerte pose bien `inert` quand l'aperçu le demande, et rien sinon", () => {
    const code = codeSeul(PAGE_CLIENT);
    const corps = /function Inerte\([\s\S]*?\n\}/.exec(code)?.[0] ?? "";
    expect(corps, "Inerte est introuvable dans PageClient").not.toBe("");
    expect(corps).toMatch(/si \?\s*\(\s*<div inert className="contents">/);
  });

  test("l'aperçu rend PageClient en mode aperçu, la vraie page en mode normal", () => {
    expect(codeSeul(APERCU)).toMatch(/<PageClient\b[^>]*\bapercu\s*\/>/);
    expect(codeSeul(VRAIE_PAGE)).toMatch(/<PageClient\b[^>]*\bapercu=\{false\}/);
  });

  test("l'aperçu ne compte aucun rendu", () => {
    // Le rendu est émis vers l'analytics par la vraie page seulement.
    expect(codeSeul(APERCU)).not.toMatch(/emettre|EVENEMENTS/);
    const emetteurs = fichiers("src")
      // L'APPEL, pas la mention : le catalogue des événements la nomme aussi.
      .filter((f) => /emettre\w*\(\s*EVENEMENTS\.PAGE_PUBLIQUE_RENDUE/.test(codeSeul(f)))
      .map(normaliser);
    expect(emetteurs).toEqual([normaliser(VRAIE_PAGE)]);
  });

  test("le motif d'écriture reconnaît les formes qu'il doit attraper", () => {
    // CONTRE-TEST : un motif cassé ne reconnaîtrait plus rien, et l'inventaire serait
    // réduit aux îlots qui écrivent `method: "POST"` en toutes lettres.
    for (const forme of [
      'fetch(u, { method: "POST" })',
      "fetch(u, { method: 'put' })",
      "navigator.sendBeacon(u, corps)",
      'import { approuver } from "@/lib/commandes/actions-client";',
    ]) {
      expect(ECRIT.some((m) => m.test(forme)), forme).toBe(true);
    }
    expect(ECRIT.some((m) => m.test('fetch("/p/x/media/y")')), "une lecture n'écrit pas").toBe(false);
  });

  test("le lien mort ouvre l'accueil dans l'onglet ENTIER, jamais dans le cadre de l'aperçu", () => {
    // L'aperçu d'un lien bloqué encadre cet écran ; l'accueil refuse d'être encadré. Chaque
    // lien vers l'accueil doit donc porter `target="_top"` (ou un nouvel onglet).
    const code = codeSeul(join("src", "app", "p", "[token]", "not-found.tsx"));
    const liens = [...code.matchAll(/<(?:Link|a)\b[^>]*>/g)].map((m) => m[0]);
    expect(liens.length, "aucun lien lu dans l'écran du lien mort").toBeGreaterThanOrEqual(2);
    const pieges = liens.filter((l) => !/target="(?:_top|_blank)"/.test(l));
    expect(pieges, "liens qui s'ouvriraient dans le cadre de l'aperçu").toEqual([]);
  });

  test("l'aperçu est freiné comme la vraie page : quota AVANT la lecture, jeton inconnu compté", () => {
    const code = codeSeul(APERCU);
    const corps = code.slice(code.indexOf("export default"));
    const quota = corps.indexOf("verifierQuotaPublique()");
    const lecture = corps.indexOf("lireCommandePublique(");
    expect(quota, "le quota manque").toBeGreaterThanOrEqual(0);
    expect(lecture, "la lecture manque").toBeGreaterThan(quota);
    expect(corps).toContain("signalerJetonInconnu()");
    expect(corps).toContain("notFound()");
  });
});
