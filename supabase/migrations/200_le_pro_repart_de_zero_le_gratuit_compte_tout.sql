-- 200 — LE PRO REPART DE ZÉRO, LE GRATUIT COMPTE TOUT.
--
-- ── LA RÈGLE, DÉCISION DE WASSIM DU 27/09/2026 ──────────────────────────────
-- « Le compte gratuit a 15/15, et s'il paye ça débloque 300 commandes par mois
-- max ; pareil pour quelqu'un qui n'a jamais rien utilisé : s'il paye le Pro,
-- il a 300/300. »
--
-- ── CE QUE LA 198 FAISAIT À LA PLACE ────────────────────────────────────────
-- Le plafond Pro comptait TOUTE la consommation du mois courant, commandes
-- créées en gratuit comprises. Un vendeur gratuit à 15/15 qui payait le 20 du
-- mois n'avait donc que 285 commandes ce mois-là — il payait 300 et en recevait
-- 285, sans que rien ne le dise.
--
-- ── CE QUI EST COMPTÉ, DÉSORMAIS ────────────────────────────────────────────
--  • GRATUIT : tout ce que la boutique a jamais créé, EN GRATUIT COMME EN PRO.
--    Un Pro qui repasse en gratuit (prélèvement échoué, 193) et qui a déjà créé
--    plus de 15 commandes reste bloqué : sinon, cesser de payer rendrait quinze
--    commandes gratuites de plus, à chaque fois.
--  • PRO : ce qui a été créé PENDANT QUE LE COMPTE ÉTAIT PRO, ce mois-ci. Le jour
--    du paiement, le compteur Pro est à zéro — que le vendeur ait tout utilisé en
--    gratuit ou rien du tout.
--
-- D'où deux colonnes de plus : `commandes_pro` et `colis_pro`, la part de la
-- consommation faite en Pro. Elles sont INCLUSES dans `commandes` et `colis`
-- (une contrainte l'exige), qui restent le total qu'aucune suppression ne rend.
--
-- ── LA FICHE D'ADMINISTRATION DIT LA MÊME RÈGLE ─────────────────────────────
-- Elle affichait « commandes ce mois / plafond mensuel » pour TOUS les comptes,
-- lu sur `usage_counters` — un troisième compteur, qui n'est ni la règle du
-- gratuit ni ce qui bloque. Un gratuit à 15/15 créées le mois dernier
-- apparaissait « 0 sur 300 », avec de la marge, alors qu'il était bloqué à vie.
-- `lire_compte_admin` rend désormais le plan, la consommation selon la règle du
-- plan, et le plafond qui s'y applique : les nombres mêmes qui refusent.

-- ── 1. La part consommée en Pro ─────────────────────────────────────────────
alter table public.quotas_consommes
  add column commandes_pro integer not null default 0 check (commandes_pro >= 0),
  add column colis_pro     integer not null default 0 check (colis_pro >= 0),
  add constraint quotas_consommes_pro_inclus
    check (commandes_pro <= commandes and colis_pro <= colis);

comment on column public.quotas_consommes.commandes_pro is
  'La part de `commandes` créée pendant que le compte était Pro. Seule elle compte pour le plafond MENSUEL du Pro : un vendeur qui paye repart de zéro (200).';
comment on column public.quotas_consommes.colis_pro is
  'La part de `colis` attachée pendant que le compte était Pro. Seule elle compte pour le plafond mensuel de colis du Pro (200).';

-- ── 2. Reprise de l'existant ────────────────────────────────────────────────
-- On ne sait pas ce qu'un compte Pro d'aujourd'hui a créé avant de payer. Le
-- choix prudent est celui de la 198 : tout lui reste compté comme Pro. La mise à
-- jour marque TOUS ses mois, pas seulement le mois courant ; seul le mois courant
-- est jamais lu par le plafond Pro, et le total à vie (`commandes`, `colis`)
-- n'est pas touché — marquer les mois passés ne change donc aucun refus.
--
-- ⚠️ ET « REPARTIR DE ZÉRO » VEUT DIRE « PAR MOIS CIVIL », PAS « À CHAQUE
-- PAIEMENT ». Un Pro qui repasse gratuit (prélèvement échoué, 193) puis Pro le
-- lendemain garde ce qu'il a créé en Pro ce mois-ci : sinon un échec de
-- prélèvement régularisé lui donnerait deux plafonds dans le même mois — 600
-- commandes pour un abonnement à 300. « 300 commandes par mois max » (Wassim).
update public.quotas_consommes q
   set commandes_pro = q.commandes,
       colis_pro     = q.colis
  from public.shops s
  join public.profiles p on p.id = s.owner_id
 where s.id = q.shop_id
   and p.plan = 'pro';

-- ── 3a. Quota de commandes ──────────────────────────────────────────────────
create or replace function public.verifier_plafond_commandes()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_plan public.account_plan;
  v_compte integer;
  v_plafond integer;
begin
  -- ⚠️ UNE SESSION VENDEUR NE COMPTE QUE SA PROPRE BOUTIQUE (198). Ailleurs, le
  -- refus viendrait d'ici avec les nombres d'un autre ; il doit venir de la RLS.
  if (select auth.uid()) is not null and new.shop_id is distinct from public.mon_shop_id() then
    return new;
  end if;

  -- ⚠️ LE VERROU AVANT LE COMPTAGE. Sans lui, deux insertions simultanées
  -- comptent le même total et passent toutes les deux (192).
  perform pg_advisory_xact_lock(hashtextextended('plafond-commandes:' || new.shop_id::text, 0));

  -- LE PLAN SE LIT PAR LA BOUTIQUE, jamais par l'appelant : une commande est
  -- créée pour un `shop_id`, et c'est le propriétaire de CETTE boutique dont le
  -- plan décide.
  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  -- Boutique introuvable : ce n'est pas à ce déclencheur de le dire. La clé
  -- étrangère refusera l'insertion avec un message qui nomme la vraie cause.
  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE : TOUTE la consommation de la boutique, Pro comprise (200), qu'aucune
    -- suppression ne rend (198).
    select coalesce(sum(q.commandes), 0) into v_compte
    from public.quotas_consommes q
    where q.shop_id = new.shop_id;

    v_plafond := public.lire_plafond_gratuit_a_vie();

    if v_compte >= v_plafond then
      -- LE MESSAGE PORTE LES DEUX NOMBRES ET LA NATURE DU QUOTA. Sans « à vie »,
      -- le vendeur attendrait le mois suivant — indéfiniment.
      raise exception
        'Quota du compte gratuit atteint : % commandes sur % au total. Ce quota est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL067';
    end if;

    insert into public.quotas_consommes as q (shop_id, mois, commandes)
    values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1)
    on conflict (shop_id, mois) do update set commandes = q.commandes + 1;

    return new;
  end if;

  -- Compte `pro` : le plafond MENSUEL, sur ce qui a été créé EN PRO ce mois-ci
  -- (200). Le jour du paiement, ce compteur est à zéro.
  select coalesce(sum(q.commandes_pro), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = new.shop_id
    and q.mois = date_trunc('month', now())::date;

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL035';
  end if;

  -- LES DEUX COLONNES : la commande Pro compte aussi dans le total à vie, pour le
  -- jour où le compte repasserait en gratuit.
  insert into public.quotas_consommes as q (shop_id, mois, commandes, commandes_pro)
  values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1, 1)
  on conflict (shop_id, mois) do update
    set commandes = q.commandes + 1, commandes_pro = q.commandes_pro + 1;

  return new;
end;
$$;

comment on function public.verifier_plafond_commandes() is
  'Refuse la création d''une commande au-delà du quota du compte. Gratuit : À VIE, sur toute la consommation, Pro comprise. Pro : MENSUEL, sur la seule consommation faite en Pro ce mois-ci — un vendeur qui paye repart de zéro (200). Lus sur `quotas_consommes`, qu''aucune suppression ne rend (198). Security definer, avec une garde : une session vendeur ne compte que sa propre boutique. Un verrou consultatif par boutique, pris avant le comptage (192).';

revoke all on function public.verifier_plafond_commandes() from public, anon, authenticated;

-- ── 3b. Quota de colis ──────────────────────────────────────────────────────
create or replace function public.verifier_plafond_colis()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_plan    public.account_plan;
  v_compte  integer;
  v_plafond integer;
begin
  -- ⚠️ UNE SESSION VENDEUR NE COMPTE QUE SA PROPRE BOUTIQUE (198), comme pour
  -- les commandes : ailleurs, le refus viendrait d'ici avec les nombres d'un autre.
  if (select auth.uid()) is not null and new.shop_id is distinct from public.mon_shop_id() then
    return new;
  end if;

  -- ⚠️ LE VERROU AVANT LE COMPTAGE (192). Chaque ligne de trop est une prise en
  -- charge payante, sur un palier commun à tous les comptes.
  perform pg_advisory_xact_lock(hashtextextended('plafond-colis:' || new.shop_id::text, 0));

  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE, sur toute la consommation, Pro comprise (200), qu'aucune suppression
    -- ne rend (198).
    select coalesce(sum(q.colis), 0) into v_compte
    from public.quotas_consommes q
    where q.shop_id = new.shop_id;

    v_plafond := public.lire_plafond_gratuit_a_vie() * 2;

    if v_compte >= v_plafond then
      raise exception
        'Plafond de colis du compte gratuit atteint (% sur % au total). Ce plafond est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL070';
    end if;

    insert into public.quotas_consommes as q (shop_id, mois, colis)
    values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1)
    on conflict (shop_id, mois) do update set colis = q.colis + 1;

    return new;
  end if;

  -- Pro : ce qui a été attaché EN PRO ce mois-ci (200).
  select coalesce(sum(q.colis_pro), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = new.shop_id
    and q.mois = date_trunc('month', now())::date;

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL051';
  end if;

  insert into public.quotas_consommes as q (shop_id, mois, colis, colis_pro)
  values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1, 1)
  on conflict (shop_id, mois) do update
    set colis = q.colis + 1, colis_pro = q.colis_pro + 1;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà du quota du compte. Gratuit : deux fois le quota de commandes À VIE (30 par défaut), sur toute la consommation, Pro comprise. Pro : UNE FOIS le plafond mensuel de commandes (197), sur la seule consommation faite en Pro ce mois-ci (200). Lus sur `quotas_consommes` (198). Security definer, avec une garde : une session vendeur ne compte que sa propre boutique. Un verrou consultatif par boutique, pris avant le comptage (192).';

revoke all on function public.verifier_plafond_colis() from public, anon, authenticated;

-- ── 4. Ce que le vendeur lit de son suivi bloqué (199), à la même règle ─────
create or replace function public.mon_quota_colis_atteint()
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_shop    uuid := public.mon_shop_id();
  v_plan    public.account_plan;
  v_compte  integer;
begin
  if v_shop is null then
    return null;
  end if;

  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = v_shop;

  if v_plan is null then
    return null;
  end if;

  if v_plan = 'gratuit' then
    select coalesce(sum(q.colis), 0) into v_compte
    from public.quotas_consommes q
    where q.shop_id = v_shop;

    return case when v_compte >= public.lire_plafond_gratuit_a_vie() * 2 then 'gratuit' end;
  end if;

  select coalesce(sum(q.colis_pro), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = v_shop
    and q.mois = date_trunc('month', now())::date;

  return case when v_compte >= public.lire_plafond_commandes() then 'mensuel' end;
end;
$$;

comment on function public.mon_quota_colis_atteint() is
  'Le quota de colis de la boutique de l''APPELANT est-il atteint ? ''gratuit'' (à vie, toute la consommation), ''mensuel'' (Pro, la consommation faite en Pro ce mois-ci) ou NULL. Redit la règle de `verifier_plafond_colis` (200) sans ouvrir la consommation (199).';

revoke all on function public.mon_quota_colis_atteint() from public, anon;
grant execute on function public.mon_quota_colis_atteint() to authenticated;

-- ── 5. La fiche d'administration, à la règle du plan ────────────────────────
-- `drop` OBLIGATOIRE : le type de retour change. `commandes_ce_mois` (lu sur
-- `usage_counters`) disparaît : il ne disait ni la règle ni ce qui bloque.
drop function if exists public.lire_compte_admin(uuid, text);

create function public.lire_compte_admin(p_profil uuid, p_ip_hash text)
  returns table (
    id uuid,
    email text,
    account_type public.account_type,
    role public.user_role,
    status public.account_status,
    locale text,
    created_at timestamptz,
    boutique_id uuid,
    boutique_nom text,
    accent_color text,
    watermark_enabled boolean,
    reseaux text[],
    commandes bigint,
    colis_ce_mois bigint,
    medias bigint,
    stockage_octets bigint,
    evenements jsonb,
    plan public.account_plan,
    quota_commandes bigint,
    quota_commandes_plafond integer
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- ON TRACE MÊME QUAND LE COMPTE N'EXISTE PAS. Ne tracer que les succès
  -- laisserait l'énumération d'identifiants totalement invisible.
  perform public.journaliser_admin(
    'comptes.detail', 'profiles', p_profil::text, p_profil, p_ip_hash, '{}'::jsonb
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.locale, p.created_at,
    s.id, s.name, s.accent_color, s.watermark_enabled,
    -- LES RÉSEAUX CONFIGURÉS, PAR LEUR NOM, jamais par leur adresse : savoir
    -- qu'un vendeur a mis un Instagram suffit à décrire son compte, l'ouvrir ne
    -- regarde personne ici.
    array_remove(array[
      case when nullif(btrim(coalesce(s.instagram_url, '')), '') is null then null else 'instagram' end,
      case when nullif(btrim(coalesce(s.tiktok_url, '')), '') is null then null else 'tiktok' end,
      case when nullif(btrim(coalesce(s.whatsapp_url, '')), '') is null then null else 'whatsapp' end
    ], null),
    -- MÊME DÉFINITION QUE LES DEUX AUTRES ÉCRANS (112).
    coalesce(s.commandes_reelles, 0)::bigint,
    coalesce(u.parcels_registered, 0)::bigint,
    coalesce(s.medias_count, 0)::bigint,
    coalesce(s.stockage_octets, 0)::bigint,
    -- LA FRISE : agrégats seulement, six lignes au plus, du plus récent au plus
    -- ancien. `coalesce` sur un tableau vide plutôt que `null` — l'appelant ne
    -- doit pas avoir à distinguer « aucun événement » de « rien lu ».
    coalesce((
      select jsonb_agg(x order by x.jour desc)
        from (
          select e.type as type,
                 date_trunc('day', e.occurred_at)::date as jour,
                 count(*) as n
            from public.order_events e
            join public.orders o on o.id = e.order_id
           where o.shop_id = s.id
             and e.actor = 'vendeur'
           group by e.type, date_trunc('day', e.occurred_at)::date
           order by 2 desc
           limit 6
        ) as x
    ), '[]'::jsonb),
    p.plan,
    -- LE QUOTA SELON LA RÈGLE DU PLAN, lu là où il BLOQUE (`quotas_consommes`,
    -- 198-200) : à vie et tout compris en gratuit, en Pro ce mois-ci en Pro.
    case when p.plan = 'gratuit' then
      (select coalesce(sum(q.commandes), 0) from public.quotas_consommes q where q.shop_id = s.id)
    else
      (select coalesce(sum(q.commandes_pro), 0) from public.quotas_consommes q
        where q.shop_id = s.id and q.mois = date_trunc('month', now())::date)
    end::bigint,
    case when p.plan = 'gratuit' then public.lire_plafond_gratuit_a_vie()
    else public.lire_plafond_commandes() end
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  left join public.usage_counters u
         on u.profile_id = p.id
        and u.period_month = date_trunc('month', now())::date
  where p.id = p_profil;
end;
$$;

revoke all on function public.lire_compte_admin(uuid, text) from public;
grant execute on function public.lire_compte_admin(uuid, text) to authenticated;

comment on function public.lire_compte_admin(uuid, text) is
  'Fiche d''un compte pour l''administration. Garde interne : est_admin(). '
  'Trace écrite MÊME sur un compte inexistant, sinon l''énumération serait '
  'invisible. Ne rend aucun contenu de commande : la frise est agrégée. '
  'Le quota de commandes suit la règle du plan : à vie en gratuit, en Pro ce mois-ci en Pro (200).';
