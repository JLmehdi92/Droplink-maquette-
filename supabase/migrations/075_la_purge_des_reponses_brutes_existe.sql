-- 075 — LA PURGE À 90 JOURS EXISTE VRAIMENT.
--
-- La migration qui a créé `tracking_snapshots` l'affirmait déjà, en commentaire :
-- « PURGÉES 90 JOURS APRÈS LE DERNIER MOUVEMENT ». Aucune fonction ne le faisait,
-- aucune tâche ne l'appelait, et `pg_cron` n'est même pas installé — vérifié au
-- catalogue, zéro extension de planification.
--
-- C'est L-014 dans sa forme pure : UN DOCUMENT AFFIRME UN ÉTAT QUE PERSONNE N'A
-- EXÉCUTÉ. Le commentaire était assez précis pour être cru et assez discret pour
-- n'être jamais vérifié. Combiné au rejeu de notifications corrigé en 071, la
-- table croissait sans borne — et cette base est déjà passée en LECTURE SEULE
-- une fois, au quota disque.
--
-- LE CRITÈRE EST BIEN LE DERNIER MOUVEMENT, PAS LA CRÉATION. Un colis bloqué en
-- douane depuis quatre mois est exactement celui pour lequel la réponse brute
-- sert le plus : purger sur la création l'effacerait juste avant qu'on en ait
-- besoin. `coalesce(last_movement_at, created_at)` couvre le colis qui n'a
-- jamais bougé — sans le `coalesce`, il ne serait JAMAIS purgé, et un colis qui
-- n'a jamais rien dit est précisément celui dont les instantanés vides
-- s'accumulent.
--
-- ELLE EST BORNÉE PAR PASSAGE. Une purge non bornée s'exécute correctement les
-- cent premiers jours puis, le jour où elle a du retard, tente de supprimer des
-- millions de lignes en une transaction — c'est-à-dire échoue exactement quand
-- elle est nécessaire.
--
-- PAS DE PLANIFICATEUR EN BASE : elle est appelée par la tâche de cadence, qui
-- passe déjà régulièrement. Un second mécanisme de planification serait un
-- second mécanisme à surveiller, et le brief impose déjà que le veilleur soit
-- hors de ce qu'il veille.

-- Sans lui, la purge balaie `tracked_parcels` en entier à chaque passage, et son
-- coût croît avec le nombre total de colis du produit — pas avec ce qu'elle
-- purge.
create index tracked_parcels_dernier_mouvement_idx
  on public.tracked_parcels (last_movement_at nulls first);

create function public.purger_donnees_de_suivi(p_lot integer default 5000)
  returns table (instantanes integer, notifications integer)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_instantanes integer;
  v_notifications integer;
  v_lot integer := greatest(1, least(coalesce(p_lot, 5000), 50000));
begin
  with vieux as (
    select ts.id
    from public.tracking_snapshots ts
    join public.tracked_parcels tp on tp.id = ts.parcel_id
    where coalesce(tp.last_movement_at, tp.created_at) < now() - interval '90 days'
    limit v_lot
  )
  delete from public.tracking_snapshots ts
   using vieux
   where ts.id = vieux.id;
  get diagnostics v_instantanes = row_count;

  -- Sept jours pour les empreintes de notification : au-delà, un rejeu n'est
  -- plus un rejeu du fournisseur mais une charge captée puis renvoyée — et
  -- celle-là est déjà arrêtée par la limitation de débit de la route. Les garder
  -- indéfiniment ferait grossir sans fin une table dont le seul rôle est de
  -- couvrir quelques minutes de réessais.
  with vieilles as (
    select cle from public.tracking_notifications_vues
    where vue_at < now() - interval '7 days'
    limit v_lot
  )
  delete from public.tracking_notifications_vues v
   using vieilles
   where v.cle = vieilles.cle;
  get diagnostics v_notifications = row_count;

  return query select v_instantanes, v_notifications;
end;
$$;

comment on function public.purger_donnees_de_suivi(integer) is
  'Purge les réponses brutes 90 jours après le DERNIER MOUVEMENT, par lots bornés. Le critère n''est pas la création : un colis bloqué en douane est celui dont on a le plus besoin.';

revoke execute on function public.purger_donnees_de_suivi(integer) from public, anon, authenticated;
