/*
 * 162 — La croissance se compte en un passage par table.
 *
 * MESURÉE LE 14/09/2026 SUR LE BANC À MILLE VENDEURS (219 200 commandes) :
 * `croissance_admin` rendait ses neuf mois en 1 118 ms, au-dessus du seuil de
 * 1 000 ms écrit avant la mesure. Les trois autres fonctions de la 161 tenaient
 * entre 5 et 474 ms.
 *
 * ⚠️ IL NE MANQUAIT PAS D'INDEX (L-017) : LA REQUÊTE DEMANDAIT TRENTE-SIX
 * PARCOURS. La 161 posait, pour CHAQUE mois de la grille, une sous-requête
 * corrélée par table — profils, commandes, colis, médias —, soit neuf fois
 * quatre comptages, chacun relisant sa table depuis la borne de départ. Un index
 * n'aurait accéléré aucun d'eux : ils lisaient tous les mêmes lignes neuf fois.
 *
 * Chaque table est désormais lue UNE fois, regroupée par mois, puis jointe à la
 * grille. Même borne, mêmes colonnes, mêmes mois vides à zéro : la définition
 * ne change pas, seul le nombre de passages.
 *
 * `create or replace` suffit ici : ni les arguments ni la table de retour ne
 * changent, donc aucune seconde fonction ne peut naître à côté de la première.
 */

create or replace function public.croissance_admin()
  returns table (
    mois date,
    comptes bigint,
    commandes bigint,
    colis bigint,
    photos bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_fin date := date_trunc('month', now() at time zone 'UTC')::date;
  v_debut date := (date_trunc('month', now() at time zone 'UTC') - interval '8 months')::date;
  v_borne timestamptz := v_debut::timestamp at time zone 'UTC';
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  with grille as (
    select g::date as mois from generate_series(v_debut, v_fin, interval '1 month') g
  ),
  c as (
    select date_trunc('month', p.created_at at time zone 'UTC')::date as mois, count(*) as n
      from public.profiles p where p.created_at >= v_borne group by 1
  ),
  o as (
    select date_trunc('month', x.first_content_at at time zone 'UTC')::date as mois, count(*) as n
      from public.orders x where x.first_content_at >= v_borne group by 1
  ),
  t as (
    select date_trunc('month', tp.registered_at at time zone 'UTC')::date as mois, count(*) as n
      from public.tracked_parcels tp where tp.registered_at >= v_borne group by 1
  ),
  m as (
    select date_trunc('month', md.created_at at time zone 'UTC')::date as mois, count(*) as n
      from public.order_media md where md.type = 'photo' and md.created_at >= v_borne group by 1
  )
  select
    g.mois,
    coalesce(c.n, 0),
    coalesce(o.n, 0),
    coalesce(t.n, 0),
    coalesce(m.n, 0)
  from grille g
  left join c on c.mois = g.mois
  left join o on o.mois = g.mois
  left join t on t.mois = g.mois
  left join m on m.mois = g.mois
  order by g.mois;
end;
$$;

comment on function public.croissance_admin() is
  'Volumes mensuels de la plateforme sur neuf mois, MOIS VIDES COMPRIS, une lecture par table. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';

revoke all on function public.croissance_admin() from public;
grant execute on function public.croissance_admin() to authenticated;
