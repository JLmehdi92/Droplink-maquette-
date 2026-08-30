#!/usr/bin/env node
/**
 * Purge les comptes de test abandonnés et rend l'espace au système de fichiers.
 *
 * POURQUOI CET OUTIL EXISTE. Le 21/08/2026, la base est passée en LECTURE SEULE :
 * 930 Mo occupés, quota atteint, plus aucune écriture possible. L'échec se
 * présentait comme « Database error creating new user » — un message qui ne dit
 * rien de sa cause, et qui apparaît dans les fichiers qu'on vient de toucher,
 * donc on cherche la régression au mauvais endroit. La cause réelle :
 * 47 comptes de test survivants, portant 288 001 commandes, 2 112 000 événements
 * et 1 061 430 vues — le résidu de jeux de mesure successifs.
 *
 * `afterAll` NE S'EXÉCUTE PAS QUAND `beforeAll` ÉCHOUE. Les suites nettoient
 * pourtant derrière elles ; c'est la mise en place qui échouait, sur le quota
 * d'authentification. La prévention vit désormais dans `tests/aide/amorcage.ts`,
 * à l'ENTRÉE des suites. Cet outil-ci sert au rattrapage : il rend l'espace
 * qu'une purge à l'entrée ne peut plus libérer une fois la base bloquée en
 * lecture seule — puisqu'elle aurait, elle aussi, besoin d'écrire.
 *
 * TROIS GARDES, DANS CET ORDRE :
 *  1. Il REFUSE si un seul compte hors du domaine de test existe. Le domaine
 *     `@droplink-test.invalid` est réservé par la RFC 2606 : il ne peut pas être
 *     enregistré, donc aucun compte réel ne peut y appartenir par accident.
 *  2. Il ANNONCE ce qu'il va supprimer, et exige `--confirmer`. Une purge est
 *     irréversible : la voir avant de la faire est le seul moment où l'on peut
 *     encore changer d'avis.
 *  3. Il NE TOUCHE QUE `auth.users`. Tout le reste part par cascade, donc il n'y
 *     a aucun ordre de suppression à respecter — ni, par conséquent, aucun ordre
 *     à se tromper.
 *
 * Usage : node scripts/purger-residus-de-test.mjs [--confirmer]
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const DOMAINE_DE_TEST = "@droplink-test.invalid";
const confirmer = process.argv.includes("--confirmer");

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30_000,
});

await client.connect();

// La lecture seule est le SYMPTÔME qu'on vient soigner : la lever pour cette
// session est le seul moyen de libérer la place. Le réglage est propre à la
// connexion et disparaît avec elle.
await client.query("set session default_transaction_read_only = off");
// Un `vacuum full` sur des centaines de mégaoctets dépasse tout délai par défaut.
await client.query("set statement_timeout = 0");

const avant = await client.query(
  "select pg_size_pretty(pg_database_size(current_database())) as t",
);
console.log(`Taille de la base : ${avant.rows[0].t}`);

/*
 * GARDE 1 — LA PORTÉE, PAS LE REFUS.
 *
 * ⚠️ CETTE GARDE REFUSAIT DE S'EXÉCUTER dès qu'un seul compte hors du domaine
 * de test existait. L'intention était juste — ne jamais supprimer un compte
 * réel — mais le moyen rendait l'outil INUTILISABLE sur la seule base où il
 * sert : celle qui porte le compte de test de Wassim.
 *
 * CONSTATÉ LE 30/08/2026, UNE SECONDE FOIS. La base est repassée en lecture
 * seule à 753 Mo — même symptôme qu'au 21/08 raconté en tête de ce fichier —
 * et l'outil bâti pour s'en remettre a répondu « ARRÊT : 1 compte hors du
 * domaine de test. Rien n'a été supprimé. » Il a fallu écrire la suppression à
 * la main, au moment précis où l'on voulait une procédure éprouvée.
 *
 * UN OUTIL DE RATTRAPAGE QUI REFUSE DE SERVIR N'EST PAS UN OUTIL PRUDENT,
 * c'est un outil ABSENT — et son absence se découvre en situation d'incident,
 * quand elle coûte le plus cher.
 *
 * La sécurité ne vient pas du refus, elle vient de la PORTÉE. Le domaine
 * `@droplink-test.invalid` est réservé par la RFC 2606 : il ne peut être
 * enregistré par personne, donc aucun compte réel ne peut y appartenir. La
 * suppression y est bornée, et les comptes réels sont NOMMÉS pour qu'on voie
 * qu'ils sont laissés intacts — se taire sur eux serait moins rassurant.
 */
const horsTest = await client.query(
  "select email from auth.users where email not like $1",
  [`%${DOMAINE_DE_TEST}`],
);
if (horsTest.rowCount > 0) {
  console.log(
    `${horsTest.rowCount} compte(s) hors du domaine de test — LAISSÉS INTACTS :\n` +
      horsTest.rows.map((r) => `  - ${r.email}`).join("\n"),
  );
}

/*
 * ⚠️ LE DÉCOMPTE DES CASCADES DOIT ÊTRE CELUI DES CIBLES, PAS DE LA TABLE.
 *
 * Il comptait TOUTES les commandes, tous les événements et toutes les vues de
 * la base — y compris ceux des comptes réels, qui ne seront pas supprimés. Le
 * message de confirmation annonçait donc une destruction plus large que la
 * suppression réelle.
 *
 * Or c'est précisément l'instant où l'on décide. Un chiffre faux et alarmant
 * ici pousse soit à renoncer à une purge inoffensive, soit — plus grave — à
 * apprendre que ce message exagère, donc à ne plus le lire.
 */
const cibles = await client.query(
  `with vises as (
     select p.id from public.profiles p
     join auth.users u on u.id = p.user_id
     where u.email like $1
   ), boutiques as (
     select s.id from public.shops s join vises v on v.id = s.owner_id
   ), commandes as (
     select o.id from public.orders o join boutiques b on b.id = o.shop_id
   )
   select (select count(*) from auth.users where email like $1) as comptes,
          (select count(*) from commandes) as commandes,
          (select count(*) from public.order_events e join commandes c on c.id = e.order_id) as evenements,
          (select count(*) from public.link_views v join commandes c on c.id = v.order_id) as vues,
          (select count(*) from public.order_media m join commandes c on c.id = m.order_id) as medias`,
  [`%${DOMAINE_DE_TEST}`],
);
const c = cibles.rows[0];

console.log(
  `À supprimer : ${c.comptes} compte(s) de test, et par cascade ` +
    `${c.commandes} commande(s), ${c.evenements} événement(s), ` +
    `${c.vues} vue(s), ${c.medias} média(s).`,
);

if (Number(c.comptes) === 0) {
  console.log("Rien à purger.");
  await client.end();
  process.exit(0);
}

// GARDE 2 — voir avant de faire.
if (!confirmer) {
  console.log("\nRien n'a été supprimé. Relancer avec --confirmer pour exécuter.");
  await client.end();
  process.exit(0);
}

console.time("suppression");
const supprimes = await client.query("delete from auth.users where email like $1", [
  `%${DOMAINE_DE_TEST}`,
]);
console.timeEnd("suppression");
console.log(`${supprimes.rowCount} compte(s) supprimé(s).`);

// `delete` rend l'espace à la table, pas au système de fichiers : sans
// `vacuum full`, la base resterait à sa taille et donc en lecture seule. C'est
// exactement le genre d'étape qu'on oublie, et dont l'oubli laisse croire que la
// purge n'a servi à rien.
for (const table of ["order_events", "orders", "link_views", "order_media", "tracked_parcels"]) {
  console.time(`vacuum full ${table}`);
  await client.query(`vacuum full public.${table}`);
  console.timeEnd(`vacuum full ${table}`);
}

const apres = await client.query(
  "select pg_size_pretty(pg_database_size(current_database())) as t",
);
console.log(`Taille de la base après purge : ${apres.rows[0].t}`);

await client.end();
