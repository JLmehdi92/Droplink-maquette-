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
// ⚠️ CE SCRIPT COUVRE `unit`, `rls` ET — depuis le 20/09/2026 — `perf`.
//
// `perf` N EST PAS UNE PORTE, et c est precisement pourquoi il en a besoin.
// Ce jour-la, les migrations 175-176 et 181 ont borne un compte GRATUIT a 15
// commandes A VIE. Le banc en seme des milliers pour savoir si l ecran tient :
// ses quatre fichiers ont cesse de se charger, et vitest a rendu
// « 6 passed | 48 skipped ». Six sur cinquante-quatre, presente comme un succes
// partiel. Personne ne l aurait vu — le banc ne tourne pas a chaque commit, et
// c est deja comme ca qu il etait reste rouge plusieurs jours en aout.
//
// Le projet `r2` reste EXCLU : son `describe.runIf` est deliberé — il ne peut
// pas tourner sans identifiants Cloudflare, et exiger zero saut la-bas rendrait
// la commande impossible a lancer pour qui n a pas de compte tiers. Une regle
// qui ne s applique pas partout doit dire OU elle s applique, et pourquoi.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");

const projet = process.argv[2];
if (projet !== "unit" && projet !== "rls" && projet !== "perf") {
  console.error("usage : node scripts/suite.mjs <unit|rls|perf>");
  process.exit(1);
}

// Le rapport va DANS LE DOSSIER TEMPORAIRE, jamais dans le depot : un artefact
// de mesure qui traine finit par etre commite, puis lu comme une source.
const rapport = join(tmpdir(), `droplink-suite-${projet}-${process.pid}.json`);

/*
 * ⚠️ LA COUVERTURE DE `src/lib/`, ÉCRITE À CHAQUE PASSAGE DE `unit` ET DE `rls`.
 *
 * Posée le 23/09/2026. `@vitest/coverage-v8` était installé depuis des semaines
 * et n'avait JAMAIS tourné : aucune configuration, aucun script. Mesuré ce
 * jour-là en l'allumant enfin : 28 fichiers de `src/lib/` qu'AUCUN des 1 931
 * tests ne traversait — dont le secret des tâches planifiées, la garde anti-CSRF
 * et la cadence qui décide des appels payants au fournisseur de suivi.
 *
 * Le rapport part dans un dossier temporaire PAR PROJET, VIDÉ AVANT chaque
 * passage : `scripts/inventaire-couverture.mjs` fusionne ensuite les deux et
 * refuse un fichier de `lib/` que rien ne traverse. Un rapport resté d'une
 * exécution précédente décrirait un code qui n'existe plus (L-032) — d'où le
 * vidage, et d'où le refus de l'inventaire quand un rapport manque.
 *
 * `perf` n'en écrit pas : il sème des milliers de lignes pour MESURER, pas pour
 * exercer, et sa couverture n'ajouterait rien à celle des deux autres.
 */
const dossierCouverture = join(tmpdir(), "droplink-couverture", projet);
const couverture =
  projet === "perf"
    ? []
    : [
        "--coverage.enabled",
        "--coverage.provider=v8",
        "--coverage.reporter=json",
        "--coverage.include=src/lib/**",
        `--coverage.reportsDirectory=${dossierCouverture}`,
      ];
if (couverture.length > 0) rmSync(dossierCouverture, { recursive: true, force: true });

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
      ...couverture,
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
// `perf` est a 54 depuis le 17/09/2026. Le plancher est volontairement proche :
// ce banc ne grossit pas comme les autres suites, et sa facon de disparaitre est
// justement qu un fichier entier cesse de se charger — douze mesures d un coup.
const PLANCHERS = { unit: 400, rls: 600, perf: 45 };
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
