#!/usr/bin/env node
/**
 * Casse le PRODUIT en base, pas les tests. Puis remet en état.
 *
 * Falsifier en cassant les tests ne prouve que la capacité des tests à échouer.
 * Ce qu'on veut savoir, c'est si une protection RETIRÉE est DÉTECTÉE — et
 * surtout hors du cas qui a motivé son écriture, parce qu'un garde écrit après
 * coup hérite du champ de vision de la correction, pas du problème.
 *
 * Usage : node scripts/falsifier.mjs <casser|reparer> <cible>
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

const POLICY_LECTURE_SHOPS = `create policy shops_lecture_du_sien on public.shops
  for select to authenticated
  using (owner_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())));`;

const POLICY_MAJ_PROFILS = `create policy profiles_maj_de_soi on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));`;

const SQL = {
  /** LE cas motivant : l'auto-promotion en admin. */
  role: {
    casser: "grant update (role) on public.profiles to authenticated;",
    reparer: "revoke update (role) on public.profiles from authenticated;",
  },

  /** HORS du cas motivant : une table future créée sans RLS. */
  table: {
    casser:
      "create table public.table_piege (id uuid primary key default gen_random_uuid(), secret text);",
    reparer: "drop table if exists public.table_piege;",
  },

  /** La policy de lecture retirée : chacun voit alors tout. */
  "policy-lecture": {
    casser: "drop policy if exists shops_lecture_du_sien on public.shops;",
    reparer: POLICY_LECTURE_SHOPS,
  },

  /** RLS désactivée sur une table qui en a une : le cas le plus grossier. */
  "rls-off": {
    casser: "alter table public.shops disable row level security;",
    reparer: "alter table public.shops enable row level security;",
  },

  /** RLS non FORCÉE : subtil, car la table reste « protégée » en apparence. */
  "rls-non-forcee": {
    casser: "alter table public.shops no force row level security;",
    reparer: "alter table public.shops force row level security;",
  },

  /** La policy de mise à jour trop large : chacun modifie le profil de chacun. */
  "policy-maj-large": {
    casser:
      "drop policy if exists profiles_maj_de_soi on public.profiles;\n" +
      "create policy profiles_maj_de_soi on public.profiles for update to authenticated using (true) with check (true);",
    reparer: "drop policy if exists profiles_maj_de_soi on public.profiles;\n" + POLICY_MAJ_PROFILS,
  },

  /** Droit d'écriture direct accordé à anon : ce que Supabase fait par défaut. */
  "anon-lecture": {
    casser: "grant select on public.shops to anon;",
    reparer: "revoke select on public.shops from anon;",
  },

  /** Une fonction de public ouverte à tous. */
  "execute-ouvert": {
    casser: "grant execute on function public.toucher_updated_at() to anon, authenticated;",
    reparer: "revoke execute on function public.toucher_updated_at() from anon, authenticated;",
  },
};

const [, , action, cible] = process.argv;

if (!SQL[cible] || !["casser", "reparer"].includes(action)) {
  console.error(`Usage : node scripts/falsifier.mjs <casser|reparer> <${Object.keys(SQL).join("|")}>`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
await client.query(SQL[cible][action]);
console.log(`${action} ${cible} : fait`);
await client.end();
