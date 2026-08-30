import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * LE FALSIFICATEUR RÉPARE-T-IL VERS LE PRODUIT D'AUJOURD'HUI ?
 *
 * DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026, ET IL ÉTAIT DOUBLE.
 *
 * Trois cibles réparaient `lire_commande_publique` en rejouant la migration
 * 035. La 085 avait redéfini cette fonction depuis — trois colonnes de plus.
 * Casser puis réparer RAMENAIT donc le produit à une version antérieure, sans
 * un mot : les réseaux du vendeur disparaissaient de la page de ses clients, et
 * la base ne divergeait du dépôt qu'à partir de ce moment-là.
 *
 * Et la borne de découpe s'arrêtait au `comment on function`, donc la
 * réparation recréait la fonction SANS son `revoke all from public` ni son
 * `grant execute to anon`. Les droits ne survivent pas à un `drop` : le produit
 * repartait avec une lecture publique exécutable par PUBLIC. Une falsification
 * dont la RÉPARATION ouvre un droit est pire qu'une falsification absente.
 *
 * CE CONTRÔLE INTERROGE LE DÉPÔT, PAS LA BASE. Il vérifie trois choses :
 *
 *  1. chaque fichier de migration cité existe ;
 *  2. chaque ancre `depuis` s'y trouve encore ;
 *  3. AUCUNE migration POSTÉRIEURE ne redéfinit la même fonction.
 *
 * Le troisième point est le seul qui attrape la dérive : les deux premiers
 * restaient verts pendant que la 085 périmait la citation de la 035.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FALSIFICATEUR = join(process.cwd(), "scripts", "falsifier.mjs");

interface Citation {
  readonly cible: string;
  readonly fichier: string;
  readonly depuis: string;
}

/**
 * Relit les citations du falsificateur.
 *
 * PAR EXPRESSION RÉGULIÈRE ET NON PAR IMPORT : le script s'exécute dès qu'on
 * l'importe — il se connecte à la base et lit `process.argv`. Le lire comme du
 * TEXTE est la seule façon de l'inspecter sans le lancer.
 */
function citations(): readonly Citation[] {
  const source = readFileSync(FALSIFICATEUR, "utf8");
  const trouvees: Citation[] = [];

  // Chaque bloc `reparerDepuisMigration` est précédé, dans le même objet, du
  // nom de la cible. On remonte au nom de cible le plus proche en amont.
  const motif = /reparerDepuisMigration:\s*\{\s*fichier:\s*"([^"]+)",\s*depuis:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) {
    const avant = source.slice(0, m.index);
    const cible = /"([a-z0-9-]+)":\s*\{[^{]*$/.exec(avant)?.[1] ?? "cible inconnue";
    trouvees.push({ cible, fichier: m[1] as string, depuis: m[2] as string });
  }
  return trouvees;
}

/** Le nom de fonction cité par une ancre, quand il y en a un. */
function fonctionCitee(depuis: string): string | null {
  return /public\.([a-z_0-9]+)/.exec(depuis)?.[1] ?? null;
}

describe("Le falsificateur répare vers le produit d'aujourd'hui", () => {
  const toutes = citations();

  // UN ENSEMBLE VIDE PASSE TOUT. Si l'expression régulière cessait de coller à
  // la forme du script, ce fichier deviendrait vert et muet — c'est-à-dire
  // exactement ce qu'il est censé empêcher.
  test("les citations sont réellement relues", () => {
    expect(toutes.length, "aucune citation trouvée : la lecture est fausse").toBeGreaterThan(10);
    expect(toutes.every((c) => c.fichier.endsWith(".sql"))).toBe(true);
  });

  test("chaque migration citée existe et porte encore son ancre", () => {
    const fichiers = new Set(readdirSync(MIGRATIONS));
    const defauts: string[] = [];

    for (const c of toutes) {
      if (!fichiers.has(c.fichier)) {
        defauts.push(`${c.cible} cite ${c.fichier}, qui n'existe pas`);
        continue;
      }
      const contenu = readFileSync(join(MIGRATIONS, c.fichier), "utf8");
      if (!contenu.includes(c.depuis)) {
        defauts.push(`${c.cible} : « ${c.depuis} » a disparu de ${c.fichier}`);
      }
    }

    expect(defauts, defauts.join(" | ")).toEqual([]);
  });

  /*
   * LE CONTRÔLE QUI COMPTE.
   *
   * Une citation peut rester parfaitement valide — fichier présent, ancre
   * trouvée — et pointer vers une définition que trois migrations ultérieures
   * ont remplacée. C'est ce qui s'est produit.
   */
  test("aucune migration postérieure ne redéfinit la fonction citée", () => {
    const tous = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const defauts: string[] = [];

    for (const c of toutes) {
      const fonction = fonctionCitee(c.depuis);
      if (fonction === null) continue;

      const posterieures = tous.filter((f) => f > c.fichier);
      for (const f of posterieures) {
        const contenu = readFileSync(join(MIGRATIONS, f), "utf8");
        const redefinit = new RegExp(
          `create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fonction}\\b`,
        ).test(contenu);
        if (redefinit) {
          defauts.push(
            `${c.cible} répare « ${fonction} » depuis ${c.fichier}, mais ${f} la redéfinit ` +
              "après : la réparation ramènerait le produit en arrière",
          );
        }
      }
    }

    expect(defauts, defauts.join(" | ")).toEqual([]);
  });

  /*
   * L'AUTRE MOITIÉ DU DÉFAUT : les droits.
   *
   * Un `drop function` emporte ses droits. Toute réparation qui rejoue un
   * `drop` doit donc reposer le `revoke`/`grant` — sinon elle recrée la
   * fonction avec le défaut de Postgres, c'est-à-dire EXECUTE pour PUBLIC.
   */
  test("une réparation qui rejoue un drop repose aussi les droits", () => {
    const source = readFileSync(FALSIFICATEUR, "utf8");
    const defauts: string[] = [];

    const motif =
      /reparerDepuisMigration:\s*\{\s*fichier:\s*"([^"]+)",\s*depuis:\s*"([^"]+)",(?:[\s\S]*?)jusqua:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    let inspectees = 0;

    while ((m = motif.exec(source)) !== null) {
      const [, fichier, depuis, jusqua] = m as unknown as [string, string, string, string];
      if (!depuis.startsWith("drop function")) continue;
      inspectees += 1;

      const contenu = readFileSync(join(MIGRATIONS, fichier), "utf8");
      const debut = contenu.indexOf(depuis);
      const fin = contenu.indexOf(jusqua, debut);
      const extrait = contenu.slice(debut, fin === -1 ? undefined : fin);

      const fonction = fonctionCitee(depuis);
      if (fonction === null) continue;

      if (!new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fonction}`).test(extrait)) {
        defauts.push(
          `${fichier} : la découpe de « ${fonction} » s'arrête avant son revoke — ` +
            "la réparation la recréerait exécutable par PUBLIC",
        );
      }
      if (!new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fonction}`).test(extrait)) {
        defauts.push(
          `${fichier} : la découpe de « ${fonction} » s'arrête avant son grant — ` +
            "la réparation la laisserait inaccessible à qui doit l'appeler",
        );
      }
    }

    // UN ENSEMBLE VIDE PASSE TOUT, ici aussi : si plus aucune cible ne rejouait
    // un `drop`, ce contrôle deviendrait décoratif sans que rien ne le dise.
    expect(inspectees, "aucune réparation par drop à inspecter").toBeGreaterThan(0);
    expect(defauts, defauts.join(" | ")).toEqual([]);
  });
});

/**
 * LE SECOND REGISTRE : LES CIBLES QUI AGISSENT SUR LE DÉPÔT.
 *
 * Les soixante-cinq cibles SQL cassent la base. Le second registre casse des
 * FICHIERS — la signature des URL de dépôt, la forme canonique des clés, le
 * refus du SVG, la neutralisation des formules de l'export, le filtre du
 * middleware, la vérification de signature du point de réception.
 *
 * SON MODE DE DÉFAILLANCE EST LE PIRE QUI SOIT : une cible dont le motif ne se
 * trouve plus dans le fichier — parce qu'une refonte a déplacé la ligne —
 * annoncerait « cassé » sans rien avoir cassé, et la suite restée verte se
 * lirait comme une preuve que la garde tient. C'est exactement ce qui s'est
 * produit deux fois pendant cette session avec des remplacements scriptés qui
 * n'ont rien remplacé.
 *
 * Le script se protège lui-même en refusant un motif qui n'apparaît pas
 * exactement une fois. Ce contrôle-ci le vérifie SANS EXÉCUTER le falsificateur,
 * donc sans jamais toucher au dépôt : il rougit à l'intégration, pas au moment
 * où quelqu'un croit falsifier.
 */
describe("Second registre du falsificateur — les cibles du dépôt", () => {
  const source = readFileSync(FALSIFICATEUR, "utf8");

  /**
   * Relit les cibles du dépôt par expression régulière, pour la même raison que
   * ci-dessus : importer le script le ferait s'exécuter.
   */
  function ciblesDuDepot(): readonly { cible: string; fichier: string; remplacer: string }[] {
    const debut = source.indexOf("const DEPOT = {");
    expect(debut, "le registre DEPOT a disparu du falsificateur").toBeGreaterThan(-1);
    const bloc = source.slice(debut);

    const trouvees: { cible: string; fichier: string; remplacer: string }[] = [];
    const motif =
      /"([a-z0-9-]+)":\s*\{[\s\S]*?fichier:\s*"([^"]+)",[\s\S]*?remplacer:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    for (const t of bloc.matchAll(motif)) {
      const brut = t[3] ?? t[4] ?? "";
      // Le motif est écrit comme un littéral JavaScript : on rétablit les
      // échappements pour comparer aux octets réels du fichier visé.
      /*
       * ⚠️ UN SEUL PASSAGE, DE GAUCHE À DROITE. Une première version enchaînait
       * six `replace` : sur `[=+\\-@\\t\\r]` — dont la valeur réelle contient
       * un antislash SUIVI d'un `t`, pas une tabulation — le remplacement de
       * `\t` mordait sur le second antislash et produisait une tabulation là où
       * il n'y en avait pas. La cible était alors déclarée introuvable, c'est-
       * à-dire qu'un contrôle destiné à repérer les cibles périmées inventait
       * lui-même sa propre péremption.
       */
      const remplacer = brut.replace(/\\(.)/g, (_, c: string) =>
        c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c,
      );
      trouvees.push({ cible: t[1] ?? "", fichier: t[2] ?? "", remplacer });
    }
    return trouvees;
  }

  test("les cibles du dépôt sont réellement relues", () => {
    expect(
      ciblesDuDepot().length,
      "Aucune cible de dépôt relue : le motif vise à côté, et tout ce bloc " +
        "passerait au vert sur un ensemble vide.",
    ).toBeGreaterThan(3);
  });

  test("chaque cible désigne un fichier qui existe et un motif présent UNE FOIS", () => {
    const defauts: string[] = [];

    for (const { cible, fichier, remplacer } of ciblesDuDepot()) {
      const chemin = join(process.cwd(), fichier);
      let contenu: string;
      try {
        contenu = readFileSync(chemin, "utf8");
      } catch {
        defauts.push(`${cible} : ${fichier} n'existe plus`);
        continue;
      }

      const occurrences = contenu.split(remplacer).length - 1;
      if (occurrences !== 1) {
        defauts.push(
          `${cible} : son motif apparaît ${occurrences} fois dans ${fichier}, ` +
            "il en faut exactement une. À zéro, la cible annoncerait casser ce " +
            "qu'elle ne casse plus ; au-delà d'une, elle casserait autre chose " +
            "que ce qu'elle décrit.",
        );
      }
    }

    expect(defauts, defauts.join("\n")).toEqual([]);
  });

  test("aucune cible du dépôt ne porte le nom d'une cible SQL", () => {
    /*
     * Les deux registres partagent le même argument de ligne de commande, et le
     * dépôt est consulté EN PREMIER. Un nom présent des deux côtés rendrait la
     * cible SQL inatteignable — sans erreur, sans message : `pnpm falsifier
     * casser X` casserait un fichier en croyant casser la base, et la
     * réparation restaurerait ce fichier en laissant la base intacte.
     */
    const noms = new Set(ciblesDuDepot().map((c) => c.cible));
    expect(noms.size, "aucune cible de dépôt : rien à comparer").toBeGreaterThan(0);

    const debutSql = source.indexOf("const SQL = {");
    const finSql = source.indexOf("const DEPOT = {");
    expect(debutSql, "le registre SQL a disparu").toBeGreaterThan(-1);
    expect(finSql).toBeGreaterThan(debutSql);

    const nomsSql = new Set(
      [...source.slice(debutSql, finSql).matchAll(/^\s{2}"?([a-z][a-z0-9-]+)"?:\s*\{/gm)].map(
        (t) => t[1] ?? "",
      ),
    );
    expect(nomsSql.size, "aucune cible SQL relue : la comparaison serait vide").toBeGreaterThan(10);

    const collisions = [...noms].filter((n) => nomsSql.has(n));
    expect(
      collisions,
      `Noms présents dans les DEUX registres : ${collisions.join(", ")}. La cible ` +
        "SQL du même nom est devenue inatteignable, en silence.",
    ).toEqual([]);
  });
});

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE FALSIFICATION QUI CASSE PLUS QUE CE QU'ELLE ANNONCE NE PROUVE RIEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DÉFAUT RÉEL, TROUVÉ LE 30/08/2026 EN EXÉCUTANT LE FALSIFICATEUR — pas en le
 * relisant.
 *
 * La cible `suspension-ne-coupe-pas` recrée `lire_commande_publique` sans son
 * filtre `p.status = 'active'`. Son corps avait été écrit avant la migration
 * 085 : il rendait quinze colonnes là où la fonction réelle en rend dix-huit,
 * les trois réseaux du vendeur en moins. Casser cette cible retirait donc le
 * filtre de suspension ET amputait la page de son bloc de réseaux. La sonde de
 * fumée signalait DEUX échecs, et le second brouillait l'attribution du
 * premier : on ne savait plus laquelle des deux ruptures l'avait fait rougir.
 *
 * Le registre existant vérifie que la RÉPARATION vise le produit d'aujourd'hui.
 * Personne ne vérifiait que la CASSE, elle, part du produit d'aujourd'hui — et
 * c'est pourtant elle qui définit ce que la falsification prouve.
 *
 * Ce contrôle compare donc, pour chaque cible qui recrée une fonction à
 * `returns table`, la liste de colonnes du corps CASSÉ à celle de la migration
 * qu'il répare. Il échoue dans les deux sens : une colonne oubliée comme une
 * colonne en trop.
 */

interface Recreation {
  readonly cible: string;
  readonly fonction: string;
  readonly colonnesCassees: readonly string[];
  readonly fichier: string;
}

/** Les noms de colonnes d'un bloc `returns table ( ... )`. */
function colonnesDe(bloc: string): readonly string[] {
  return bloc
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0] ?? "")
    .filter((c) => c !== "");
}

/**
 * Les cibles qui RECRÉENT une fonction à `returns table`, avec les colonnes que
 * leur version cassée déclare.
 */
function recreations(): readonly Recreation[] {
  const source = readFileSync(FALSIFICATEUR, "utf8");
  const trouvees: Recreation[] = [];

  const motif =
    /create function public\.([a-z_0-9]+)\s*\([^)]*\)\s*\n?\s*returns table\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) {
    const avant = source.slice(0, m.index);
    const cible = /"([a-z0-9-]+)":\s*\{[^{]*$/.exec(avant)?.[1] ?? null;
    if (cible === null) continue;

    // Le fichier de migration cité par la réparation de CETTE cible : on
    // repart du nom de cible pour ne pas confondre deux blocs voisins.
    const apres = source.slice(m.index);
    const fichier = /reparerDepuisMigration:\s*\{\s*fichier:\s*"([^"]+)"/.exec(apres)?.[1] ?? null;
    if (fichier === null) continue;

    trouvees.push({
      cible,
      fonction: m[1] as string,
      colonnesCassees: colonnesDe(m[2] as string),
      fichier,
    });
  }
  return trouvees;
}

describe("Le falsificateur CASSE aussi le produit d'aujourd'hui", () => {
  const RECREATIONS = recreations();

  test("la sonde trouve réellement des recréations de fonction", () => {
    // Un ensemble vide passe tout : si le format du script changeait, ce bloc
    // deviendrait vert en ne comparant plus rien.
    expect(
      RECREATIONS.length,
      "aucune cible qui recrée une fonction à `returns table` : la sonde vise à côté",
    ).toBeGreaterThan(0);
  });

  test("chaque version cassée déclare EXACTEMENT les colonnes de la vraie", () => {
    const ecarts: string[] = [];

    for (const r of RECREATIONS) {
      const sql = readFileSync(join(MIGRATIONS, r.fichier), "utf8");
      const vraie = new RegExp(
        `create (?:or replace )?function public\\.${r.fonction}\\s*\\([^)]*\\)\\s*\\n?\\s*returns table\\s*\\(([^)]*)\\)`,
      ).exec(sql);

      if (vraie === null) {
        ecarts.push(
          `${r.cible} : ${r.fonction} introuvable dans ${r.fichier} — la citation ne pointe plus sur la définition`,
        );
        continue;
      }

      const attendues = colonnesDe(vraie[1] as string);
      const manquantes = attendues.filter((c) => !r.colonnesCassees.includes(c));
      const enTrop = r.colonnesCassees.filter((c) => !attendues.includes(c));

      if (manquantes.length > 0 || enTrop.length > 0) {
        ecarts.push(
          `${r.cible} → ${r.fonction} : ` +
            (manquantes.length > 0 ? `manquent [${manquantes.join(", ")}] ` : "") +
            (enTrop.length > 0 ? `en trop [${enTrop.join(", ")}]` : ""),
        );
      }
    }

    expect(
      ecarts,
      "La version CASSÉE de ces fonctions ne rend plus les mêmes colonnes que la " +
        "vraie. La falsification casse donc autre chose EN PLUS de ce qu'elle " +
        "annonce, et l'échec supplémentaire brouille l'attribution de celui qu'on " +
        "cherchait à provoquer.",
    ).toEqual([]);
  });
});
