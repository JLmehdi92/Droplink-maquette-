-- 109 — Le panneau compte aussi les commandes créées dans le mois.
--
-- POURQUOI CE CHIFFRE MANQUAIT. Le panneau savait dire combien de comptes
-- existent et combien de colis nous sont facturés, mais rien de ce que les
-- vendeurs PRODUISENT. Or c'est le signal de verdict de la phase de validation :
-- un compte qui existe sans créer de commande ne dit rien, une commande créée
-- dit tout. Sa planche lui donne la troisième carte des volumes.
--
-- IL EST LU SUR `usage_counters`, PAS SUR `orders`, et c'est exactement le
-- raisonnement de la 047 pour les colis : le compteur est tenu à l'écriture par
-- déclencheur, donc une ligne par compte ayant eu de l'activité dans le mois. Un
-- `count(*)` sur `orders` ferait croître le coût de l'écran avec le volume total
-- du produit — c'est-à-dire avec son succès — pour un chiffre qui ne bouge pas
-- plus vite pour autant.
--
-- LE `drop` EST OBLIGATOIRE ICI, et ce n'est pas de la superstition : la LISTE
-- D'ARGUMENTS ne change pas, mais le TYPE DE RETOUR si, et Postgres refuse un
-- `create or replace` qui change le type de retour. Sans le `drop`, la migration
-- échouerait — ce qui est le cas favorable ; le cas dangereux est celui d'une
-- signature d'arguments modifiée, où Postgres crée une SECONDE surcharge sans
-- rien dire.

drop function if exists public.compteurs_admin();

create function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint,
    commandes_creees_ce_mois bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'active'),
    (select count(*) from public.profiles where status = 'suspended'),
    (select count(*) from public.profiles where account_type is null),
    (select coalesce(sum(u.parcels_registered), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    (select count(*) from public.tracked_parcels
      where abandoned_at >= date_trunc('month', now())),
    -- MÊME SOURCE, MÊME BORNE que les colis : le mois courant du compteur, et
    -- non une fenêtre glissante. Deux fenêtres différentes sur la même carte
    -- feraient comparer des chiffres qui ne décrivent pas la même période.
    (select coalesce(sum(u.orders_created), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date);
end;
$$;

-- LE DROIT SE REPOSE APRÈS UN `drop` : la fonction recréée est un objet NEUF,
-- et Postgres accorde `EXECUTE` à `PUBLIC` par défaut. Un droit d'exécution ne
-- s'écrit pas dans le corps d'une fonction — aucune relecture ne l'aurait vu.
revoke all on function public.compteurs_admin() from public;
grant execute on function public.compteurs_admin() to authenticated;

comment on function public.compteurs_admin() is
  'Volumes du panneau d''administration. Garde interne : est_admin().';
