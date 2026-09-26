#!/usr/bin/env node
/**
 * Régénère les types TypeScript depuis le schéma RÉEL de la base.
 *
 * À lancer après toute migration : des types périmés décrivent un schéma qui
 * n'existe plus, et `tsc` valide alors du code contre une base imaginaire. Le
 * désaccord ne se manifeste qu'à l'exécution, sur une colonne absente.
 *
 * POURQUOI PAS `supabase gen types --db-url` : la CLI démarre un conteneur pour
 * introspecter, et Docker n'est pas installé sur la machine de développement
 * (Windows sans WSL). La commande se connecte bien à la base, puis échoue sur
 * `LegacyContainerRuntimeNotFoundError`. On passe donc par l'API de gestion, qui
 * lit le schéma côté Supabase et ne demande aucun conteneur.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

/**
 * ⚠️ DEUX CIBLES, COMME `db-migrate`. Sans argument, les types viennent de la
 * PRODUCTION. `--tests` les prend sur la base jetable — le seul cas ou c est
 * la bonne source : quand une migration est ecrite et appliquee aux tests mais
 * PAS ENCORE a la production, la production ne connait pas encore les
 * fonctions, et regenerer depuis elle effacerait les types du code qu on vient
 * d ecrire.
 *
 * La reference du projet se DEDUIT de l URL, parce que `.env.test.local` ne
 * porte pas `SUPABASE_PROJECT_REF` : cette variable-la designe la production
 * partout ailleurs dans l outillage, et lui donner deux sens serait le meilleur
 * moyen de viser la mauvaise base un jour.
 */
const VERS_TESTS = process.argv.includes("--tests");

if (VERS_TESTS) config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const jeton = process.env.SUPABASE_ACCESS_TOKEN;
const projet = VERS_TESTS
  ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([a-z]+)\./)?.[1]
  : process.env.SUPABASE_PROJECT_REF;

if (!jeton || !projet) {
  console.error(
    "SUPABASE_ACCESS_TOKEN ou SUPABASE_PROJECT_REF absent.\n\n" +
      "Le jeton se crée une fois sur https://supabase.com/dashboard/account/tokens\n" +
      "puis se colle dans .env.local. Il ne sert QUE localement : il n'est jamais\n" +
      "lu par l'application et ne doit jamais partir en production.",
  );
  process.exit(1);
}

const sortie = join(process.cwd(), "src", "lib", "supabase", "types-base.ts");

const reponse = await fetch(
  `https://api.supabase.com/v1/projects/${projet}/types/typescript?included_schemas=public`,
  { headers: { Authorization: `Bearer ${jeton}` } },
);

if (!reponse.ok) {
  console.error(
    `L'API de gestion a répondu ${reponse.status} : ${(await reponse.text()).slice(0, 400)}`,
  );
  process.exit(1);
}

const charge = await reponse.json();
const contenu = typeof charge === "string" ? charge : charge.types;

// « Il répond » est la propriété que tous les résidus possèdent : une réponse
// 200 portant un objet vide produirait un fichier syntaxiquement valide et
// sémantiquement creux, que `tsc` accepterait sans rien vérifier.
if (typeof contenu !== "string" || !contenu.includes("export type Database")) {
  console.error(
    "La réponse ne contient pas `export type Database`. Écrire ce contenu " +
      "produirait des types vides que le typage accepterait en silence.",
  );
  process.exit(1);
}

const tables = [...contenu.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
if (tables.length === 0) {
  console.error("Aucune table décrite dans la réponse : régénération refusée.");
  process.exit(1);
}

/**
 * LES ARGUMENTS DE FONCTION QUI ACCEPTENT `null` — déclarés ICI, jamais
 * retouchés à la main dans le fichier généré.
 *
 * ⚠️ LE GÉNÉRATEUR TYPE TOUT ARGUMENT DE FONCTION COMME NON NUL, alors qu'en
 * PL/pgSQL tout argument peut l'être. Le fichier généré portait donc des
 * `| null` ajoutés À LA MAIN, malgré l'en-tête qui l'interdit : la régénération
 * du 27/09/2026 les a effacés et le typage du webhook de paiement a cassé. La
 * correction vit désormais dans ce script, avec sa raison, et la génération
 * reste reproductible.
 *
 * ÉCHEC DANS LES DEUX SENS : une fonction ou un argument déclaré qui n'existe
 * plus fait REFUSER la régénération — sinon cette liste garderait des noms morts
 * et finirait par ne plus rien dire.
 */
const ARGUMENTS_NULLABLES = new Map([
  [
    "appliquer_abonnement",
    {
      args: ["p_renews_at", "p_ends_at"],
      raison:
        "Le webhook Lemon Squeezy transmet null quand un abonnement n'a pas (encore) de date de " +
        "renouvellement ou de fin — un abonnement résilié perd sa date de renouvellement.",
    },
  ],
]);

function rendreNullables(source) {
  let resultat = source;
  for (const [fonction, { args }] of ARGUMENTS_NULLABLES) {
    const entete = `\n      ${fonction}: {\n        Args: {\n`;
    const debut = resultat.indexOf(entete);
    if (debut === -1) throw new Error(`${fonction} : fonction introuvable dans les types générés`);
    const corps = debut + entete.length;
    const fin = resultat.indexOf("\n        }", corps);
    if (fin === -1) throw new Error(`${fonction} : bloc Args non refermé`);
    const lignes = resultat.slice(corps, fin).split("\n");
    for (const arg of args) {
      const i = lignes.findIndex(
        (l) => l.startsWith(`          ${arg}: `) || l.startsWith(`          ${arg}?: `),
      );
      if (i === -1) throw new Error(`${fonction}.${arg} : argument introuvable — la déclaration est morte`);
      if (!lignes[i].endsWith(" | null")) lignes[i] += " | null";
    }
    resultat = resultat.slice(0, corps) + lignes.join("\n") + resultat.slice(fin);
  }
  return resultat;
}

let final;
try {
  final = rendreNullables(contenu);
} catch (erreur) {
  console.error("Régénération refusée : " + (erreur instanceof Error ? erreur.message : String(erreur)));
  process.exit(1);
}

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(
  sortie,
  "// GÉNÉRÉ PAR `pnpm db:types` — NE PAS MODIFIER À LA MAIN.\n" +
    "// Source de vérité : le schéma réellement appliqué en base. Les arguments\n" +
    "// qui acceptent null sont DÉCLARÉS dans scripts/db-types.mjs.\n\n" +
    final,
  "utf8",
);

console.log(`Types régénérés dans src/lib/supabase/types-base.ts.`);
console.log(`Objets décrits : ${[...new Set(tables)].join(", ")}`);
