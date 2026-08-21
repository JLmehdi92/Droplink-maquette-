-- 018 — Le comptage des vues de lien.
--
-- Ce n'est pas un compteur de confort : « vues de lien par commande > 3 » est
-- une MÉTRIQUE DE VERDICT. Ce qui suit en est donc la définition, pas une
-- implémentation. Une métrique de verdict légèrement faussée est pire qu'une
-- métrique cassée, parce qu'elle reste crédible — et une métrique fausse qui
-- confirme ce qu'on espère ne se remet jamais en question.
--
-- UNE LIGNE = UN VISITEUR, UN JOUR. Un comptage brut mesurerait la nervosité du
-- réseau autant que l'intérêt du client : un client qui remonte sa conversation
-- quatre fois dans l'après-midi n'a pas consulté quatre fois, il a consulté. La
-- déduplication est donc une CONTRAINTE D'UNICITÉ, pas un filtre appliqué à la
-- lecture — un filtre s'oublie dans le prochain écran qui lira la table.
--
-- `viewed_on` est GÉNÉRÉE et non écrite par l'appelant : c'est elle qui porte la
-- déduplication, et une colonne de déduplication qu'un appelant fournit est une
-- colonne qu'un appelant peut faire diverger.
--
-- LES EMPREINTES SONT SALÉES, côté application. Sans sel, une IPv4 se retrouve
-- par force brute en quelques secondes — quatre milliards de valeurs contre des
-- milliards de sha256 par seconde. Une empreinte non salée n'est pas une
-- pseudonymisation, c'est un encodage.

create table public.link_views (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  -- Immutable, donc indexable : `at time zone 'UTC'` fige le fuseau. Sans lui,
  -- le jour dépendrait du `TimeZone` de la session qui écrit, et deux instances
  -- réglées différemment dédupliqueraient sur deux jours distincts.
  viewed_on date generated always as (((viewed_at at time zone 'UTC'))::date) stored,
  ip_hash text not null,
  user_agent_hash text not null,
  country text,
  unique (order_id, ip_hash, user_agent_hash, viewed_on)
);

comment on table public.link_views is
  'Une ligne = un visiteur, un JOUR. La déduplication est la définition de la métrique, pas un détail.';

-- Le dashboard affiche un compteur de vues et un indicateur « jamais ouvert »
-- PAR COMMANDE, sur des listes de plusieurs milliers de lignes. Sans cet index,
-- le compteur lirait toute la table à chaque page.
create index link_views_order_idx on public.link_views (order_id, viewed_at desc);

alter table public.link_views enable row level security;

-- Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : une table
-- créée sans ce retrait est grande ouverte, et le fichier de migration ne le
-- dirait pas. Ici l'écriture passe UNIQUEMENT par la fonction ci-dessous —
-- laisser `anon` insérer permettrait de gonfler les vues de n'importe quelle
-- commande dont on détient le lien, c'est-à-dire de fausser le verdict.
revoke all on public.link_views from anon, authenticated;
grant select on public.link_views to authenticated;

-- Le vendeur lit les vues de SES commandes, et rien d'autre. Aucune policy
-- d'écriture : il n'y a aucun chemin d'écriture pour un humain.
create policy "vendeur lit les vues de ses commandes"
  on public.link_views for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.shops s on s.id = o.shop_id
      join public.profiles p on p.id = s.owner_id
      where o.id = link_views.order_id
        and p.user_id = (select auth.uid())
    )
  );

/*
 * Enregistre une vue. Rend `true` SI ET SEULEMENT SI une ligne a été créée.
 *
 * APPELÉE APRÈS LE RENDU, jamais pendant. WhatsApp, Snap et Discord chargent
 * les liens qu'on leur colle pour en composer un aperçu : compter au rendu
 * gonflerait PAR CONSTRUCTION la métrique, du côté rassurant.
 *
 * LE VENDEUR QUI OUVRE SA PROPRE PAGE EST EXCLU, ICI, EN BASE. L'exclusion
 * pourrait s'écrire dans la route qui appelle — et serait oubliée le jour où une
 * seconde route appellera. Le profil est passé en argument parce que cette
 * fonction n'a pas de session : elle est appelée par le rôle système.
 *
 * REFAIT LE FILTRE DE SUSPENSION. Un compte suspendu dont on continuerait de
 * compter les vues laisserait croire à une audience sur une page qui ne répond
 * plus.
 */
create function public.enregistrer_vue(
  p_jeton text,
  p_ip_hash text,
  p_ua_hash text,
  p_pays text,
  p_profil uuid
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_proprietaire uuid;
  v_insere uuid;
begin
  select o.id, p.id
    into v_order, v_proprietaire
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active';

  if v_order is null then
    return false;
  end if;

  if p_profil is not null and p_profil = v_proprietaire then
    return false;
  end if;

  insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
  values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
  on conflict (order_id, ip_hash, user_agent_hash, viewed_on) do nothing
  returning id into v_insere;

  -- `false` sur conflit : la deuxième ouverture du même jour n'est pas une vue
  -- de plus. C'est ce retour qui décide si l'événement d'usage part, et c'est là
  -- que se joue l'exactitude du dénominateur.
  return v_insere is not null;
end;
$$;

comment on function public.enregistrer_vue(text, text, text, text, uuid) is
  'Enregistre une vue dédupliquée par jour. Exclut le vendeur. Rend true seulement si une ligne a été créée.';

-- Postgres accorde EXECUTE à PUBLIC par défaut, et ce droit ne s'écrit pas dans
-- le corps de la fonction : aucune relecture de code ne peut le voir. Une
-- fonction d'écriture de vues appelable anonymement rendrait la métrique de
-- verdict falsifiable par quiconque détient un lien.
revoke execute on function public.enregistrer_vue(text, text, text, text, uuid)
  from public, anon, authenticated;
