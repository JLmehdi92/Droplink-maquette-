#!/usr/bin/env node
/**
 * Applique les migrations non encore appliquées, dans l'ordre lexicographique
 * des noms de fichiers.
 *
 * L'ordre lexicographique EST l'ordre d'application. Une migration appliquée
 * n'est JAMAIS rouverte : modifier un fichier déjà appliqué fait diverger les
 * environnements en silence, puisque la base ne rejouera pas le fichier modifié.
 * Les correctifs sont de NOUVELLES migrations.
 *
 * Le registre est celui de Supabase (`supabase_migrations.schema_migrations`),
 * pas un second registre maison : deux registres concurrents finiraient par se
 * contredire, et c'est celui que l'outillage Supabase consulte.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import pg from "pg";

/**
 * ⚠️ DEUX CIBLES, ET UNE SEULE EST ATTEIGNABLE PAR DEFAUT.
 *
 * Sans argument, ce script applique les migrations a la PRODUCTION : c est
 * `.env.local` qui porte `SUPABASE_DB_URL`, et c est la base qui sert les
 * clients. Ce geste n est JAMAIS en pilote automatique — il est dans la courte
 * liste des choses que Wassim decide lui-meme.
 *
 * `--tests` vise la base jetable, et c est le chemin que l outillage de mesure
 * emprunte : `.env.test.local` est charge EN PREMIER, et dotenv ne remplace pas
 * une variable deja posee — le meme ordre que `build-contre-tests`, pour la
 * meme raison. Le garde ci-dessous refuse de continuer si l URL resolue n est
 * pas celle du projet de tests : un ordre de chargement est une convention, un
 * refus est une protection.
 */
const VERS_TESTS = process.argv.includes("--tests");
const REF_TESTS = "djvjaocvndqhqqgilrof";

if (VERS_TESTS) config({ path: ".env.test.local", quiet: true });
config({ path: ".env.local", quiet: true });

const DOSSIER = join(process.cwd(), "supabase", "migrations");

function fichiersMigration() {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographique — c'est le contrat
}

/** `001_socle_identite.sql` -> `001_socle_identite` */
function nomDe(fichier) {
  return fichier.replace(/\.sql$/, "");
}

function horodatage() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/**
 * Rend une version STRICTEMENT CROISSANTE.
 *
 * L horodatage seul est a la seconde pres. Deux migrations appliquees dans la
 * meme seconde produisent donc la MEME cle primaire : la seconde echoue sur une
 * violation d unicite, avec un message qui parle du registre et ne designe pas
 * la vraie cause. C est arrive des la premiere fois ou deux fichiers ont ete
 * appliques d affilee.
 *
 * Au-dela de la collision, la propriete qui compte est l ORDRE : la version est
 * la cle de tri du registre, et il doit refleter l ordre lexicographique des
 * fichiers, qui EST le contrat d application. Une version qui n augmente pas
 * strictement laisserait le registre raconter un ordre different de celui dans
 * lequel les migrations ont reellement tourne.
 */
function versionSuivante(derniere) {
  const candidate = horodatage();
  if (derniere === null || candidate > derniere) return candidate;
  // Meme seconde, ou horloge qui recule : on avance d une unite plutot que de
  // faire echouer une migration parfaitement valide.
  return String(BigInt(derniere) + 1n);
}

const url = process.env.SUPABASE_DB_URL;
if (VERS_TESTS && url !== undefined && !url.includes(REF_TESTS)) {
  console.error(
    "ARRET : --tests demande la base de tests, et l URL resolue ne la designe " +
      "pas. Rien n a ete applique.\n" +
      "C est probablement `.env.test.local` qui manque ou qui ne porte pas " +
      "`SUPABASE_DB_URL` : sans elle, c est `.env.local` qui gagne, donc la " +
      "PRODUCTION.",
  );
  process.exit(1);
}
if (!url) {
  console.error(
    "SUPABASE_DB_URL absente. Refus d'exécuter : appliquer des migrations sur " +
      "une cible indéterminée est le pire résultat possible.",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
console.log(
  VERS_TESTS
    ? `cible : la base de TESTS (${REF_TESTS}).`
    : "cible : la PRODUCTION. Ce geste n est jamais automatique.",
);

await client.query("create schema if not exists supabase_migrations");
await client.query(
  `create table if not exists supabase_migrations.schema_migrations (
     version text primary key,
     name text,
     statements text[]
   )`,
);

const { rows: dejaAppliquees } = await client.query(
  "select name from supabase_migrations.schema_migrations where name is not null",
);
const appliquees = new Set(dejaAppliquees.map((r) => r.name));

// On repart de la version la plus haute deja inscrite : une nouvelle migration
// doit se ranger APRES tout ce qui existe, y compris si l horloge de cette
// machine est en retard sur celle qui a applique la precedente.
const { rows: [{ maxi } = { maxi: null }] } = await client.query(
  "select max(version) as maxi from supabase_migrations.schema_migrations",
);
let derniereVersion = maxi;

const aFaire = fichiersMigration().filter((f) => !appliquees.has(nomDe(f)));

if (aFaire.length === 0) {
  console.log(`Rien à appliquer. ${appliquees.size} migration(s) déjà en base.`);
  await client.end();
  process.exit(0);
}

console.log(`${aFaire.length} migration(s) à appliquer :`);

for (const fichier of aFaire) {
  const sql = readFileSync(join(DOSSIER, fichier), "utf8");
  const nom = nomDe(fichier);
  process.stdout.write(`  ${nom} ... `);
  try {
    // Une migration et son inscription au registre dans la MÊME transaction :
    // une migration appliquée mais non inscrite serait rejouée au passage
    // suivant, et la plupart des DDL ne sont pas idempotentes.
    await client.query("begin");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
      [(derniereVersion = versionSuivante(derniereVersion)), nom, [sql]],
    );
    await client.query("commit");
    console.log("ok");
  } catch (erreur) {
    await client.query("rollback");
    console.log("ÉCHEC");
    console.error(`\n${erreur.message}\n`);
    console.error(
      "Transaction annulée. La base est dans l'état d'avant cette migration. " +
        "Corriger dans une NOUVELLE migration si celle-ci a déjà été appliquée " +
        "ailleurs, sinon corriger le fichier tant qu'il n'est parti nulle part.",
    );
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("Terminé.");
