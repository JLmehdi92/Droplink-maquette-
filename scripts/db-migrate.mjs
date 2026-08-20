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

const url = process.env.SUPABASE_DB_URL;
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
      [horodatage(), nom, [sql]],
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
