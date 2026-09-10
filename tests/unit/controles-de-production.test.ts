import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * LA SUITE DE CONTRÔLES DE PRODUCTION EXISTE, ET ELLE LIT SANS ÉCRIRE.
 *
 * ⚠️ ELLE COMBLE UN TROU QUE `CLAUDE.md` ANNONÇAIT DEPUIS LE 06/09/2026. Le jour
 * où les suites ont cessé de viser la production — décision juste, elles y
 * effaçaient de vrais colis —, plus aucun contrôle n'a regardé la base qui sert
 * les clients.
 *
 * ⚠️ CE CONTRÔLE-CI NE VÉRIFIE PAS LA PRODUCTION. Il n'en a pas le droit : les
 * six portes partagent un environnement, et c'est la base de TESTS. Il vérifie
 * que l'OUTIL existe, qu'il déclare sa lecture seule, et qu'il PROUVE son
 * refus — c'est-à-dire les trois choses dont la disparition rendrait
 * `pnpm verif:prod` vert sans rien garantir.
 */
const SCRIPT = join(process.cwd(), "scripts/verifier-production.mjs");

/** Le code sans ses commentaires — L-031 : une garde ne lit pas sa description. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("les contrôles de production", () => {
  const source = readFileSync(SCRIPT, "utf8");
  const code = codeSeul(source);

  test("CONTRE-TEST : le script est bien lu, et il reste du code apres les commentaires", () => {
    expect(source.length, "`scripts/verifier-production.mjs` est vide").toBeGreaterThan(2000);
    expect(
      code.replace(/\s/g, "").length,
      "il ne reste que des commentaires : le contrôle inspecterait une description",
    ).toBeGreaterThan(1500);
  });

  /**
   * ⚠️ LA LECTURE SEULE DOIT ÊTRE IMPOSÉE À POSTGRES, PAS PROMISE PAR LE STYLE
   * D'ÉCRITURE DU SCRIPT. Un script qui « ne fait que des SELECT » le fait
   * jusqu'au jour où quelqu'un ajoute une ligne. Une transaction `READ ONLY`
   * refuse, et le refus ne dépend de la vigilance de personne.
   */
  test("il enferme ses lectures dans une transaction READ ONLY", () => {
    expect(
      /set transaction read only/.test(code),
      "Le script n'impose plus `set transaction read only` : rien n'empêcherait " +
        "plus une écriture sur la base qui sert les clients.",
    ).toBe(true);
  });

  /**
   * ⚠️ ET IL DOIT AVOIR VU LE REFUS. Une transaction déclarée en lecture seule
   * qui ne le serait pas — pooler mal configuré, `set` avalé, transaction
   * rouverte sans la clause — laisserait le script s'exécuter sans filet en le
   * croyant protégé. C'est L-006 : un garde qui n'a jamais échoué ne prouve
   * rien.
   */
  test("il EPROUVE le refus d ecriture avant d interroger quoi que ce soit", () => {
    expect(
      /create temp table/.test(code),
      "Le script ne tente plus d'écriture au démarrage : sa lecture seule " +
        "n'est plus qu'une déclaration.",
    ).toBe(true);
    expect(
      /25006/.test(code),
      "Le script ne vérifie plus le SQLSTATE du refus. Une erreur QUELCONQUE " +
        "passerait alors pour la preuve du refus — une faute de frappe SQL " +
        "suffirait à faire croire que la transaction est protégée.",
    ).toBe(true);
  });

  /**
   * ⚠️ IL COMPARE LES DEUX BASES, DONC IL DOIT REFUSER QU'ELLES SOIENT LA MÊME.
   * Deux connexions vers la même base se compareraient sans rien dire : c'est
   * la forme la plus pure de l'ensemble vide qui passe tout.
   */
  test("il refuse de comparer une base avec elle-meme", () => {
    expect(
      /urlProd === urlTests/.test(code),
      "Le script ne vérifie plus que les deux environnements diffèrent : " +
        "pointés sur la même base, tous ses contrôles seraient verts.",
    ).toBe(true);
  });

  test("`pnpm verif:prod` est declare dans package.json", () => {
    const paquet = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      readonly scripts: Record<string, string>;
    };
    expect(paquet.scripts["verif:prod"], "la commande n'est plus déclarée").toBe(
      "node scripts/verifier-production.mjs",
    );
  });

  /**
   * ⚠️ ET `CLAUDE.md` NE DOIT PLUS DIRE QUE CETTE SUITE N'EXISTE PAS. C'est
   * L-014 dans sa forme exacte — un document qui affirme un état que personne
   * n'a exécuté —, et il visait précisément ce trou-là pendant quatre jours.
   */
  test("CLAUDE.md n annonce plus l absence de cette suite", () => {
    const claude = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf8");
    expect(
      claude.includes("verif:prod"),
      "`CLAUDE.md` ne mentionne pas `pnpm verif:prod` : l'outil existerait sans " +
        "que rien ne dise de le lancer.",
    ).toBe(true);
    expect(
      /lecture seule qui \*\*n'existe pas encore\*\*/.test(claude),
      "`CLAUDE.md` annonce encore que la suite de contrôles de production " +
        "n'existe pas. Elle existe depuis le 10/09/2026.",
    ).toBe(false);
  });
});
