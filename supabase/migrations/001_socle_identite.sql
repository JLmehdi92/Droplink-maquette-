-- 001 — Socle d'identité : profiles + shops.
--
-- Cette migration porte les invariants de sécurité les plus profonds du produit.
-- Elle n'est jamais rouverte : tout correctif est une NOUVELLE migration.
--
-- Deux propriétés ne sont visibles dans aucune relecture de code, seulement dans
-- le catalogue Postgres, et sont donc vérifiées par sonde (L-028) :
--   1. RLS activée sur chaque table — Supabase accorde SELECT/INSERT/UPDATE/DELETE
--      à `anon` par défaut, donc une table sans RLS est grande ouverte.
--   2. EXECUTE révoqué à PUBLIC — Postgres l'accorde par défaut, et un droit ne
--      s'écrit pas dans le corps d'une fonction.

create extension if not exists unaccent;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.account_type as enum ('supplier', 'reseller');
create type public.user_role as enum ('user', 'admin');
create type public.account_status as enum ('active', 'suspended');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  email        text not null,
  -- NULLABLE ET SANS DÉFAUT, volontairement. Un défaut à 'reseller' aurait
  -- classé tous les fournisseurs comme revendeurs et faussé irrémédiablement la
  -- segmentation d'usage, qui est le livrable réel de la phase de validation.
  -- La nullité rend le manque visible plutôt que silencieux.
  account_type public.account_type,
  role         public.user_role not null default 'user',
  status       public.account_status not null default 'active',
  locale       text not null default 'fr',
  created_at   timestamptz not null default now(),

  constraint profiles_locale_supporte check (locale in ('fr', 'en'))
);

create index profiles_user_id_idx on public.profiles (user_id);

-- ---------------------------------------------------------------------------
-- shops — un shop par compte. `owner_id` UNIQUE est le pivot unique de
-- l'isolation : toute règle d'appartenance du produit remonte jusqu'ici.
-- ---------------------------------------------------------------------------

create table public.shops (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null unique references public.profiles (id) on delete cascade,
  -- NULLABLE SANS DÉFAUT : la ligne est créée à l'inscription, donc avant
  -- l'onboarding. Un vendeur peut envoyer un lien sans avoir rien configuré —
  -- c'est le cas le plus fréquent en début de vie d'un compte, et la page
  -- publique OMET alors l'en-tête plutôt que d'afficher une barre vide.
  name              text,
  slug              text unique,
  logo_url          text,
  -- NON NULLE AVEC DÉFAUT : il n'existe donc aucun état « couleur non
  -- configurée » à détecter. La valeur stockée fait foi, elle n'est jamais
  -- réécrite.
  accent_color      text not null default '#0058be',
  default_language  text not null default 'fr',
  watermark_enabled boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint shops_accent_color_hex check (accent_color ~* '^#[0-9a-f]{6}$'),
  constraint shops_langue_supportee check (default_language in ('fr', 'en'))
);

create index shops_owner_id_idx on public.shops (owner_id);

-- ---------------------------------------------------------------------------
-- RLS — activée AVANT toute policy, et sur les deux tables.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.shops enable row level security;

-- `force` : le propriétaire de la table lui-même reste soumis à la RLS. Sans
-- cela une fonction SECURITY DEFINER appartenant au propriétaire contournerait
-- silencieusement l'isolation.
alter table public.profiles force row level security;
alter table public.shops force row level security;

create policy profiles_lecture_de_soi on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy profiles_maj_de_soi on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy shops_lecture_du_sien on public.shops
  for select to authenticated
  using (owner_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())));

create policy shops_maj_du_sien on public.shops
  for update to authenticated
  using (owner_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())))
  with check (owner_id in (select p.id from public.profiles p where p.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- Privilèges de COLONNE — la seule protection correcte contre l'auto-promotion.
--
-- Une policy sur `profiles` qui lit `profiles` produit une récursion infinie
-- (L-002). Les privilèges de colonne sont évalués AVANT les policies : même si
-- une policy future autorisait trop largement, `role` et `status` resteraient
-- hors de portée. Un seul `grant update (role)` suffirait à produire une
-- escalade complète.
-- ---------------------------------------------------------------------------

revoke all on public.profiles from anon, authenticated;
revoke all on public.shops from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (account_type, locale) on public.profiles to authenticated;

grant select on public.shops to authenticated;
grant update (name, slug, logo_url, accent_color, default_language, watermark_enabled)
  on public.shops to authenticated;

-- INSERT et DELETE ne sont accordés à personne : les lignes naissent par le
-- déclencheur d'inscription ci-dessous et meurent avec le compte auth.

-- ---------------------------------------------------------------------------
-- Création du profil et du shop à l'inscription.
-- ---------------------------------------------------------------------------

create function public.creer_profil_et_shop()
  returns trigger
  language plpgsql
  security definer
  -- `search_path` épinglé : sans lui, un schéma placé en tête par l'appelant
  -- pourrait faire résoudre `profiles` vers une table qu'il contrôle.
  set search_path = ''
as $$
declare
  nouveau_profil_id uuid;
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  returning id into nouveau_profil_id;

  insert into public.shops (owner_id)
  values (nouveau_profil_id);

  return new;
end;
$$;

create trigger creer_profil_et_shop_a_l_inscription
  after insert on auth.users
  for each row execute function public.creer_profil_et_shop();

-- ---------------------------------------------------------------------------
-- Droits d'exécution — Postgres accorde EXECUTE à PUBLIC par défaut (L-027).
-- On révoque explicitement, puis on ferme la porte pour les objets SUIVANTS.
-- ---------------------------------------------------------------------------

revoke execute on function public.creer_profil_et_shop() from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
