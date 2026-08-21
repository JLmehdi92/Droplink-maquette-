-- 047 — Le panneau lit les compteurs, plus les colis un par un.
--
-- AVANT : 19 244 lignes lues, 17,9 ms, pour DEUX comptes de 9 600 colis. Le coût
-- suivait le nombre de colis pris en charge — donc le nombre de comptes multiplié
-- par leur activité. À mille vendeurs, des millions de lignes à chaque ouverture
-- de l'écran.
--
-- APRÈS : une ligne par compte ayant eu de l'activité dans le mois. Le volume
-- suit le nombre d'INSCRITS, pas leur usage, et il est borné par le mois.
--
-- La liste d'arguments ne change pas : `create or replace` remplace donc bien
-- les fonctions existantes, sans créer de seconde surcharge. Le `drop` explicite
-- ne serait obligatoire que si la signature changeait — ce qui n'est pas le cas
-- ici, et le vérifier vaut mieux que de l'ajouter par superstition.

create or replace function public.alertes_admin(p_seuil_colis int, p_retard_minutes int)
  returns table (
    genre text,
    gravite text,
    sujet text,
    valeur bigint,
    seuil bigint
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
  -- 1. Les comptes au-dessus du seuil, LUS DEPUIS LE COMPTEUR.
  --    Le compteur est tenu à l'écriture par déclencheur, donc cette lecture ne
  --    touche jamais `tracked_parcels` : c'est ce qui rend l'écran indépendant
  --    de l'activité totale du produit.
  select
    'colis_au_dessus_du_seuil'::text,
    'attention'::text,
    p.email,
    u.parcels_registered::bigint,
    p_seuil_colis::bigint
  from public.usage_counters u
  join public.profiles p on p.id = u.profile_id
  where u.period_month = date_trunc('month', now())::date
    and u.parcels_registered > p_seuil_colis

  union all

  -- 2. Le veilleur. TROIS ÉTATS, et seul « en retard » alerte : l'ABSENCE de
  --    ligne signifie « jamais déployé », ce qui n'est pas une panne.
  select
    'veilleur_en_retard'::text,
    'critique'::text,
    h.source,
    extract(epoch from (now() - h.beat_at))::bigint / 60,
    p_retard_minutes::bigint
  from public.scheduler_heartbeat h
  where h.beat_at < now() - make_interval(mins => p_retard_minutes);
end;
$$;

create or replace function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint
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
    -- LE COMPTEUR FACTURABLE VIENT DE LA SOMME DES COMPTEURS, une ligne par
    -- compte actif dans le mois, au lieu d'un parcours de tous les colis.
    (select coalesce(sum(u.parcels_registered), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    -- Les abandons restent lus sur `tracked_parcels` : ils sont rares par
    -- construction — la fenêtre est de 7 jours et 16 interrogations — et leur
    -- dénormalisation coûterait un déclencheur de plus pour un volume qui ne
    -- décollera jamais. On le mesure plutôt que de le supposer, et le jour où la
    -- mesure dira le contraire, le motif de la 046 s'appliquera à l'identique.
    (select count(*) from public.tracked_parcels
      where abandoned_at >= date_trunc('month', now()));
end;
$$;
