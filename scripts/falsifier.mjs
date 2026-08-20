// Casse le PRODUIT en base, pas les tests. Puis remet en etat.
// Usage : node falsifier.mjs <casser|reparer> <role|table>
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const [, , action, cible] = process.argv;

const SQL = {
  // Falsification 1 — LE cas motivant : l'auto-promotion en admin.
  role: {
    casser: "grant update (role) on public.profiles to authenticated;",
    reparer: "revoke update (role) on public.profiles from authenticated;",
  },
  // Falsification 2 — HORS du cas motivant : une table future creee sans RLS.
  // Le defaut d'origine ne portait pas la-dessus ; c'est exactement pour ca
  // qu'elle vaut la peine (L-025).
  table: {
    casser:
      "create table public.table_piege (id uuid primary key default gen_random_uuid(), secret text);",
    reparer: "drop table if exists public.table_piege;",
  },
};

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();
await client.query(SQL[cible][action]);
console.log(`${action} ${cible} : fait`);
await client.end();
