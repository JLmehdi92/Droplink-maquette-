import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  EspaceDeTraductionIntrouvable,
  restreindre,
} from "../../src/components/traductions-client";

/**
 * UNE CLÉ QUI EXISTE AU CATALOGUE EST-ELLE EXPÉDIÉE AU NAVIGATEUR ?
 *
 * DÉFAUTS RÉELS, TROUVÉS À L'AUDIT DU 26/08/2026 — deux écrans d'administration
 * cassés, et personne ne s'en était aperçu :
 *
 *   - la boîte de suspension demandait `admin.suspension` ; `TraductionsClient`
 *     indexait le catalogue À PLAT (`complet["admin.suspension"]`) alors qu'il
 *     est IMBRIQUÉ, obtenait `undefined`, et une condition
 *     `if (bloc !== undefined)` TRANSFORMAIT L'ERREUR EN ABSENCE. Le dialogue
 *     recevait un provider vide et rendait ses clés en toutes lettres — sur
 *     l'écran qui coupe les pages publiques d'un vendeur ;
 *   - l'écran des paramètres n'avait AUCUN provider. `useTranslations` hors
 *     contexte lève : l'écran était cassé au rendu.
 *
 * POURQUOI AUCUNE SONDE NE LES VOYAIT :
 *
 *   - `i18n-parite` compare les deux catalogues entre eux ;
 *   - `chaines-mortes` cherche l'inverse — une clé que plus rien n'appelle ;
 *   - `cles-demandees` prouve que la clé EXISTE au catalogue, jamais qu'elle est
 *     EXPÉDIÉE au navigateur. C'est exactement la nuance qui manquait ;
 *   - `pnpm fumee` le verrait à l'écran, mais n'interroge que les pages
 *     atteignables SANS session. Les deux écrans cassés sont derrière l'admin.
 *
 * CE CONTRÔLE-CI INVENTORIE : il part des composants CLIENTS, remonte aux pages
 * qui les rendent, et exige que l'espace demandé soit dans le `espaces={[...]}`
 * qui les enveloppe. Il ne sélectionne pas — il rend tout, et déclare ses
 * exceptions avec leur raison.
 */

const RACINE = join(process.cwd(), "src");

/**
 * Les composants clients dispensés de provider, et pourquoi.
 *
 * La raison est OBLIGATOIRE : sans elle, cette liste devient l'endroit où l'on
 * range ce qu'on ne veut pas expliquer.
 */
const DISPENSES: ReadonlyMap<string, string> = new Map();

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function fichiers(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) parcourir(chemin);
      else if (chemin.endsWith(".tsx") || chemin.endsWith(".ts")) trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

const TOUS = fichiers(RACINE).map((chemin) => ({
  chemin,
  nom: chemin.split(/[\\/]/).pop() as string,
  source: sansCommentaires(readFileSync(chemin, "utf8")),
}));

/** Les espaces qu'un composant client réclame par `useTranslations("x.y")`. */
function espacesReclames(source: string): readonly string[] {
  if (!/^\s*["']use client["']/m.test(source)) return [];
  return [...source.matchAll(/useTranslations\(\s*["']([a-zA-Z][a-zA-Z0-9_.-]*)["']/g)].map(
    (m) => m[1] as string,
  );
}

/** Les espaces qu'un fichier expédie par `<TraductionsClient espaces={[...]}>`. */
function espacesExpedies(source: string): readonly string[] {
  const trouves: string[] = [];
  for (const m of source.matchAll(/espaces=\{\[([^\]]*)\]\}/g)) {
    for (const e of (m[1] as string).matchAll(/["']([^"']+)["']/g)) trouves.push(e[1] as string);
  }
  return trouves;
}

const CONVENTIONS = ["error.tsx", "loading.tsx", "not-found.tsx", "template.tsx"] as const;

function estFichierDeConvention(chemin: string): boolean {
  const nom = chemin.split(/[\\/]/).pop() as string;
  return (CONVENTIONS as readonly string[]).includes(nom);
}

/** Les chemins sont comparés en séparateurs POSIX : ce dépôt vit sur Windows. */
function enPosix(chemin: string): string {
  return chemin.split(/[\\/]/).join("/");
}

/**
 * Les `layout.tsx` qui enveloppent un fichier, du plus proche à la racine.
 *
 * Next monte un fichier de convention À L'INTÉRIEUR des layouts de son segment
 * et de ses ancêtres : c'est donc là, et nulle part ailleurs, que peut vivre le
 * provider qui l'alimente.
 */
function layoutsAncetres(chemin: string): typeof TOUS {
  const segments = enPosix(chemin).split("/");
  const dossiers = new Set<string>();
  for (let i = segments.length - 1; i > 0; i -= 1) {
    dossiers.add(segments.slice(0, i).join("/") + "/layout.tsx");
  }
  return TOUS.filter((f) => dossiers.has(enPosix(f.chemin)));
}

/**
 * Le nom du composant exporté par un fichier, tel qu'un parent l'écrirait.
 *
 * ⚠️ `default` EST ACCEPTÉ, et c'est ce qui manquait. Le motif ne reconnaissait
 * que `export function Truc` : tous les fichiers de convention de Next
 * s'écrivent `export default function`, donc la sonde ne trouvait AUCUN
 * composant chez eux et sautait la vérification en silence. La falsification —
 * retirer le provider du layout — restait verte, et le contrôle qu'on venait
 * d'écrire pour couvrir ces fichiers ne couvrait rien du tout.
 */
function composantsExportes(source: string): readonly string[] {
  return [
    ...source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)/g),
  ].map((m) => m[1] as string);
}

describe("tout espace réclamé par un composant client lui est expédié", () => {
  const clients = TOUS.filter((f) => espacesReclames(f.source).length > 0);

  // UN ENSEMBLE VIDE PASSE TOUT. Si le motif cessait de coller — un `use client`
  // écrit autrement, un renommage de dossier — cette suite deviendrait verte et
  // muette, c'est-à-dire exactement l'état qu'elle est censée empêcher.
  test("la sonde trouve réellement des composants clients traduits", () => {
    expect(TOUS.length, "aucun fichier source lu").toBeGreaterThan(80);
    expect(clients.length, "aucun composant client traduit trouvé").toBeGreaterThanOrEqual(6);
    // Et elle trouve au moins un espace POINTÉ : c'est la forme qui a produit
    // le défaut, et celle qu'un motif naïf laisse passer.
    const tousEspaces = clients.flatMap((f) => espacesReclames(f.source));
    expect(tousEspaces.some((e) => e.includes("."))).toBe(true);
  });

  test("aucun composant client n'est rendu sans son espace", () => {
    const orphelins: string[] = [];

    for (const client of clients) {
      for (const composant of composantsExportes(client.source)) {
        const espaces = espacesReclames(client.source);

        // Les fichiers qui rendent ce composant, quels qu'ils soient : on ne
        // suppose pas que c'est « la page du même dossier ».
        //
        // ⚠️ SAUF LES FICHIERS DE CONVENTION. `error.tsx` et `loading.tsx` ne
        // sont rendus par AUCUN parent visible : c'est Next qui les invoque. Un
        // inventaire qui remonte aux appelants les saute donc en silence — et
        // un `error.tsx` traduit sans provider lèverait au moment précis où le
        // produit essaie d'afficher une erreur, c'est-à-dire au pire moment.
        // Leur provider est celui d'un `layout.tsx` ancêtre.
        const parents = estFichierDeConvention(client.chemin)
          ? layoutsAncetres(client.chemin)
          : TOUS.filter(
              (f) => f.chemin !== client.chemin && new RegExp(`<${composant}\\b`).test(f.source),
            );

        if (parents.length === 0) continue;

        for (const espace of espaces) {
          const verifierTous = !estFichierDeConvention(client.chemin);
          const predicat = (parent: (typeof TOUS)[number]): boolean => {
            const expedies = espacesExpedies(parent.source);
            // Expédier `admin` couvre `admin.suspension` : le provider rend
            // l'arbre entier. L'inverse est faux.
            return expedies.some((e) => espace === e || espace.startsWith(e + "."));
          };
          // Pour un composant ordinaire, TOUS ses parents doivent l'alimenter.
          // Pour un fichier de convention, UN SEUL layout ancêtre suffit : le
          // provider posé haut couvre tout ce qui est monté dessous.
          const couvert = verifierTous ? parents.every(predicat) : parents.some(predicat);
          if (!couvert && !DISPENSES.has(client.nom)) {
            orphelins.push(
              `${client.nom} → « ${espace} » (rendu par ${parents.map((p) => p.nom).join(", ")})`,
            );
          }
        }
      }
    }

    expect(
      [...new Set(orphelins)],
      "Composants clients dont l'espace de traduction n'est pas expédié : ils " +
        "rendent leurs clés en toutes lettres, ou lèvent au rendu.",
    ).toEqual([]);
  });

  // L'AUTRE SENS. Une dispense qui ne correspond plus à rien couvrirait tout ce
  // qu'on ajouterait ensuite dans ce fichier.
  test("chaque dispense correspond encore à un composant client", () => {
    for (const [nom, raison] of DISPENSES) {
      expect(raison.length, `${nom} : dispense sans raison`).toBeGreaterThan(30);
      expect(
        clients.some((c) => c.nom === nom),
        `${nom} : dispense devenue inutile, à retirer`,
      ).toBe(true);
    }
  });
});

describe("aucune clé de catalogue ne contient de point", () => {
  /*
   * LE DÉFAUT QUI A CASSÉ LE PRODUIT ENTIER, ET QUI N'AVAIT TOUJOURS PAS DE
   * PORTE.
   *
   * Une clé next-intl contenant un point lève `INVALID_KEY` AU CHARGEMENT du
   * catalogue — donc sur toute page appelant `getTranslations`, landing
   * comprise. C'était arrivé une fois, et l'histoire est écrite dans
   * `tests/rls/libelles-audit.test.ts` : « trouvé en lançant simplement
   * `pnpm dev`. Aucune porte ne le voyait. »
   *
   * Aucune porte ne le voyait TOUJOURS : les quatre sondes i18n existantes
   * APLATISSENT les catalogues en chemins pointés avant de les comparer, si
   * bien qu'une clé fautive s'y écrit exactement comme deux niveaux légitimes.
   *
   * Ce contrôle regarde donc l'arbre AVANT aplatissement — c'est la seule
   * position d'où le défaut est visible.
   */
  const LANGUES = ["fr", "en"] as const;

  function clefsPointees(objet: unknown, chemin = ""): readonly string[] {
    if (typeof objet !== "object" || objet === null) return [];
    const fautives: string[] = [];
    for (const [nom, valeur] of Object.entries(objet)) {
      const ici = chemin === "" ? nom : chemin + " › " + nom;
      if (nom.includes(".")) fautives.push(ici);
      fautives.push(...clefsPointees(valeur, ici));
    }
    return fautives;
  }

  function feuilles(objet: unknown): number {
    if (typeof objet !== "object" || objet === null) return 1;
    return Object.values(objet).reduce<number>((n, v) => n + feuilles(v), 0);
  }

  test.each(LANGUES)("catalogue %s", (langue) => {
    const catalogue = JSON.parse(
      readFileSync(join(process.cwd(), "messages", langue + ".json"), "utf8"),
    );

    // UN ENSEMBLE VIDE PASSE TOUT : un catalogue qu'on n'aurait pas su lire
    // rendrait zéro clé fautive, donc vert.
    expect(feuilles(catalogue), `catalogue ${langue} vide ou illisible`).toBeGreaterThan(500);

    expect(
      clefsPointees(catalogue),
      "Une clé next-intl contenant un point lève INVALID_KEY au CHARGEMENT du " +
        "catalogue : toutes les pages du produit cessent de répondre, pas " +
        "seulement celle qui l'emploie.",
    ).toEqual([]);
  });

  // CONTRE-TEST : la sonde doit reconnaître une clé fautive. Sans lui, elle
  // passerait à 100 % en ne reconnaissant jamais rien.
  test("une clé pointée EST reconnue", () => {
    expect(clefsPointees({ admin: { "comptes.liste": "x" } })).toEqual(["admin › comptes.liste"]);
    expect(clefsPointees({ admin: { comptes: { liste: "x" } } })).toEqual([]);
  });
});

describe("la restriction résout ce qu'elle prétend résoudre", () => {
  /*
   * LE DÉFAUT LUI-MÊME, ÉPROUVÉ DIRECTEMENT.
   *
   * La sonde d'inventaire ci-dessus attrape un provider ABSENT. Elle
   * n'attraperait pas un provider PRÉSENT qui expédie du vide — et c'est
   * précisément ce qui se passait : `complet["admin.suspension"]` rendait
   * `undefined` sur un catalogue imbriqué, et la condition qui suivait
   * transformait cette erreur en absence.
   *
   * On éprouve donc la résolution sur le VRAI catalogue, pas sur un objet
   * inventé : un catalogue de test aurait pu être plat, et le contrôle aurait
   * validé une hypothèse au lieu du produit.
   */
  const CATALOGUE = JSON.parse(
    readFileSync(join(process.cwd(), "messages", "fr.json"), "utf8"),
  ) as Record<string, unknown>;

  test("un espace POINTÉ est résolu, et rendu imbriqué", () => {
    const restreint = restreindre(CATALOGUE, ["admin.suspension"]);
    const bloc = (restreint.admin as Record<string, unknown>).suspension;
    expect(bloc, "l'espace pointé est vide : les clés sortiraient à l'écran").toBeTruthy();
    expect(Object.keys(bloc as object).length).toBeGreaterThan(3);
  });

  test("deux espaces frères cohabitent sans que l'un écrase l'autre", () => {
    const restreint = restreindre(CATALOGUE, ["admin.suspension", "admin.parametres"]);
    const admin = restreint.admin as Record<string, unknown>;
    expect(admin.suspension).toBeTruthy();
    expect(admin.parametres).toBeTruthy();
  });

  // CONTRE-TEST POSITIF : un espace simple doit continuer de marcher. Une
  // résolution qui ne saurait plus que faire du pointé casserait tout le reste.
  test("un espace simple est résolu comme avant", () => {
    expect(restreindre(CATALOGUE, ["marque"]).marque).toBeTruthy();
  });

  /*
   * LE SILENCE ÉTAIT LE VRAI DÉFAUT.
   *
   * Un espace introuvable doit LEVER. La condition `if (bloc !== undefined)`
   * qui l'ignorait est ce qui a permis à un écran d'administration de vivre
   * cassé : rien n'échouait, rien n'était journalisé, et la panne ne se voyait
   * qu'à l'écran de celui qui s'en servait.
   */
  test("un espace introuvable LÈVE au lieu de partir vide", () => {
    expect(() => restreindre(CATALOGUE, ["admin.nexistepas"])).toThrow(
      EspaceDeTraductionIntrouvable,
    );
    expect(() => restreindre(CATALOGUE, ["nexistepas"])).toThrow(EspaceDeTraductionIntrouvable);
  });
});
