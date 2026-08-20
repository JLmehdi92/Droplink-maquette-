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

config({ path: ".env.local", quiet: true });

const jeton = process.env.SUPABASE_ACCESS_TOKEN;
const projet = process.env.SUPABASE_PROJECT_REF;

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

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(
  sortie,
  "// GÉNÉRÉ PAR `pnpm db:types` — NE PAS MODIFIER À LA MAIN.\n" +
    "// Source de vérité : le schéma réellement appliqué en base.\n\n" +
    contenu,
  "utf8",
);

console.log(`Types régénérés dans src/lib/supabase/types-base.ts.`);
console.log(`Objets décrits : ${[...new Set(tables)].join(", ")}`);
