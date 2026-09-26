-- 201 — LE GRATUIT SUIT QUINZE COLIS, PAS TRENTE.
--
-- ── LA DÉCISION, WASSIM, 27/09/2026 ─────────────────────────────────────────
-- « Ça me coûte cher de perdre 30 suivis sur mon quota de 17TRACK, je ne peux
-- pas me permettre de laisser des deuxièmes chances : mets 15 colis suivis pour
-- le gratuit et laisse 15 commandes. »
--
-- ── CE QUI CHANGE ───────────────────────────────────────────────────────────
-- Depuis la 181, le plafond de colis d'un compte gratuit valait DEUX FOIS son
-- quota de commandes (30 par défaut) : le facteur 2, repris de la 125, laissait
-- une correction de numéro de suivi sur chaque commande. Chaque colis suivi est
-- une prise en charge PAYANTE, sur un palier commun à tous les comptes : cette
-- marge se payait sur le budget de suivi du produit entier.
--
-- Désormais : UNE FOIS le quota de commandes à vie (15 par défaut). Une
-- correction de numéro consomme l'un des quinze. Le Pro ne change pas (197) :
-- son plafond de colis vaut déjà une fois son plafond mensuel de commandes.
--
-- Tout le reste de la 200 est repris à l'identique : la consommation qui ne
-- redescend jamais (198), la part Pro (200), le verrou avant le comptage (192),
-- la garde anti-oracle (198). Seul le facteur change, aux deux endroits qui le
-- portent : le déclencheur qui refuse, et la fonction qui le redit au vendeur.

-- ── 1. Quota de colis ───────────────────────────────────────────────────────
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
    -- ne rend (198). UNE FOIS le quota de commandes (201) : aucune seconde chance
    -- payée par le budget de suivi de tout le monde.
    select coalesce(sum(q.colis), 0) into v_compte
    from public.quotas_consommes q
    where q.shop_id = new.shop_id;

    v_plafond := public.lire_plafond_gratuit_a_vie();

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
  'Refuse la création d''un colis au-delà du quota du compte. Gratuit : UNE FOIS le quota de commandes À VIE (15 par défaut, 201), sur toute la consommation, Pro comprise. Pro : UNE FOIS le plafond mensuel de commandes (197), sur la seule consommation faite en Pro ce mois-ci (200). Lus sur `quotas_consommes` (198). Security definer, avec une garde : une session vendeur ne compte que sa propre boutique. Un verrou consultatif par boutique, pris avant le comptage (192).';

revoke all on function public.verifier_plafond_colis() from public, anon, authenticated;

-- ── 2. Ce que le vendeur lit de son suivi bloqué (199), au même facteur ─────
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

    return case when v_compte >= public.lire_plafond_gratuit_a_vie() then 'gratuit' end;
  end if;

  select coalesce(sum(q.colis_pro), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = v_shop
    and q.mois = date_trunc('month', now())::date;

  return case when v_compte >= public.lire_plafond_commandes() then 'mensuel' end;
end;
$$;

comment on function public.mon_quota_colis_atteint() is
  'Le quota de colis de la boutique de l''APPELANT est-il atteint ? ''gratuit'' (à vie, une fois le quota de commandes, 201), ''mensuel'' (Pro, la consommation faite en Pro ce mois-ci) ou NULL. Redit la règle de `verifier_plafond_colis` sans ouvrir la consommation (199).';

revoke all on function public.mon_quota_colis_atteint() from public, anon;
grant execute on function public.mon_quota_colis_atteint() to authenticated;
