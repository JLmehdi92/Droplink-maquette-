// Lance une suite de tests ET REFUSE une exécution qui n'a rien prouvé.
//
// ═══════════════════════════════════════════════════════════════════════════
// POURQUOI CE SCRIPT EXISTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ UNE EXECUTION A RENDU `589 passed | 22 skipped` LA OU LES 611 PASSENT.
// Aucun echec, statut de sortie 0, porte verte. Vingt-deux controles n avaient
// pas tourne, et rien ne le disait — ni le statut, ni la couleur.
//
// C est le meme defaut que celui qu on traque partout ailleurs dans ce projet :
// UN ENSEMBLE VIDE PASSE TOUT. Un test saute n est pas un test qui passe, et
// une porte qui ne fait pas la difference n est pas une porte. Les suites
// d isolation, le 404 admin et l immuabilite du jeton sont declarees JAMAIS
// DESACTIVABLES : un saut silencieux les desactive une execution durant.
//
// Vitest ne sait pas echouer sur un test saute — il n existe aucun drapeau pour
// ca. On lui demande donc son rapport en JSON, et on tranche nous-memes.
//
// ⚠️ CE SCRIPT NE COUVRE QUE LES SUITES DES PORTES (`unit` et `rls`). Le projet
// `r2` porte un `describe.runIf` deliberé — il ne peut pas tourner sans
// identifiants Cloudflare, et exiger zero saut la-bas rendrait la commande
// impossible a lancer pour qui n a pas de compte tiers. Une regle qui ne
// s applique pas partout doit dire OU elle s applique, et pourquoi.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

const projet = process.argv[2];
if (projet !== "unit" && projet !== "rls") {
  console.error("usage : node scripts/suite.mjs <unit|rls>");
  process.exit(1);
}

// Le rapport va DANS LE DOSSIER TEMPORAIRE, jamais dans le depot : un artefact
// de mesure qui traine finit par etre commite, puis lu comme une source.
const rapport = join(tmpdir(), `droplink-suite-${projet}-${process.pid}.json`);

const code = await new Promise((resoudre) => {
  const enfant = spawn(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--project",
      projet,
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${rapport}`,
    ],
    { cwd: racine, shell: true, stdio: "inherit" },
  );
  enfant.on("close", (c) => resoudre(c ?? 1));
});

if (!existsSync(rapport)) {
  console.error(
    `\nECHEC la suite « ${projet} » n a produit AUCUN rapport. On ne peut pas ` +
      "affirmer qu elle a tourne, et « pas de rapport » n est pas « tout va bien ».",
  );
  process.exit(code === 0 ? 1 : code);
}

let resume;
try {
  resume = JSON.parse(readFileSync(rapport, "utf8"));
} finally {
  rmSync(rapport, { force: true });
}

const total = resume.numTotalTests ?? 0;
const echecs = resume.numFailedTests ?? 0;
const sautes = resume.numPendingTests ?? 0;
const aFaire = resume.numTodoTests ?? 0;
const passes = resume.numPassedTests ?? 0;

const griefs = [];

// CONTRE-TEST : une suite qui ne trouve AUCUN test passe a 100 % sans rien
// prouver. C est l etat qu on redoute le plus, et le seul que le statut de
// sortie de vitest ne signale pas du tout.
if (total === 0) griefs.push("la suite n a trouve AUCUN test : elle ne prouve rien");

/*
 * ⚠️ CE SCRIPT COUVRAIT LE SAUT, PAS LA DISPARITION.
 *
 * DEFAUT REEL, TROUVE A L AUDIT DU 31/08/2026. `total === 0` est le seul
 * plancher : entre « aucun test » et « tous les tests », rien n etait borne.
 * Renommer `tests/unit/quelque-chose.test.ts` en `.ts`, deplacer trois fichiers
 * hors de `tests/rls/`, ou retirer tous les `test()` d un `describe` faisait
 * disparaitre des controles SANS aucun grief : zero echec, zero saut, statut 0,
 * et un decompte plus faible que personne ne releve.
 *
 * C est exactement le defaut que ce script existe pour empecher, dans sa
 * variante silencieuse : « 589 passed » a la place de « 611 passed » ne se voit
 * pas plus que « 22 skipped » ne se voyait.
 *
 * LE PLANCHER EST UN NOMBRE ECRIT, DONC IL SE PERIME — et c est voulu : le
 * message dit quoi faire, et l abaisser est un geste DELIBERE, inscrit dans un
 * commit. Un plancher qu on met a jour sans y penser ne borne rien.
 */
const PLANCHERS = { unit: 400, rls: 600 };
const plancher = PLANCHERS[projet];
if (plancher !== undefined && total < plancher) {
  griefs.push(
    `${total} test(s) collecte(s) pour un plancher de ${plancher} : des controles ont ` +
      "DISPARU. Un fichier renomme, deplace, ou un describe vide de ses test() ne " +
      "produit ni echec ni saut. Retrouver ce qui manque, ou abaisser le plancher " +
      "dans scripts/suite.mjs EN LE DISANT dans le commit.",
  );
}
if (echecs > 0) griefs.push(`${echecs} test(s) en echec`);
if (sautes > 0) {
  griefs.push(
    `${sautes} test(s) SAUTE(S) — un test saute n est pas un test qui passe. ` +
      "Aucune suite de porte n a le droit d etre desactivee, meme une execution durant",
  );
}
if (aFaire > 0) griefs.push(`${aFaire} test(s) marque(s) « todo »`);

if (griefs.length > 0) {
  console.error(`\nECHEC suite « ${projet} » : ${passes}/${total} passes.`);
  for (const grief of griefs) console.error(`      - ${grief}`);
  process.exit(1);
}

if (code !== 0) {
  // Le rapport ne voit pas tout : une erreur de mise en place, un fichier qui ne
  // se charge pas. Le statut de vitest reste souverain.
  console.error(`\nECHEC suite « ${projet} » : vitest a rendu le statut ${code}.`);
  process.exit(code);
}

console.log(`\nsuite « ${projet} » : ${passes}/${total} passes, 0 saute, 0 todo.`);
