-- 198 — LE QUOTA CONSOMMÉ NE SE REND PAS.
--
-- ── LE DÉFAUT, PROUVÉ EN BASE LE 26/09/2026 ─────────────────────────────────
-- Les quotas COMPTAIENT LES LIGNES EXISTANTES : `count(*) from orders` pour les
-- commandes, `count(*) from tracked_parcels` pour les colis. Or « Supprimer mes
-- données » (157) efface les deux. Un compte gratuit arrivé à 15/15 supprimait
-- ses données et en recréait 15 — mesuré : 15 refus DL067, suppression, puis 15
-- créations acceptées. Le quota « À VIE » (décision de Wassim, 175-176) se
-- rechargeait donc à la demande, et avec lui les 30 colis gratuits, dont chacun
-- est une prise en charge PAYANTE sur un palier commun à tous les comptes. Le
-- plafond MENSUEL du Pro cédait de la même façon dans le mois.
--
-- ── LE REMÈDE ───────────────────────────────────────────────────────────────
-- Une consommation qui ne redescend jamais : `quotas_consommes`, une ligne par
-- boutique et par MOIS, incrémentée par le déclencheur au moment où il laisse
-- passer une création. « À vie » = la somme de tous les mois ; « ce mois-ci » =
-- la ligne du mois courant. Rien ne l'efface hormis la suppression de la
-- boutique elle-même (suppression du COMPTE) — ce qui revient à recréer un
-- compte, le contournement déjà accepté et visible de l'administration (170-171).
--
-- Le mois est celui de la LIGNE créée (`created_at`), pas de l'insertion : une
-- commande antidatée — le banc de mesure en sème treize mois — consomme le mois
-- qu'elle déclare. Le contrôle, lui, porte toujours sur le mois COURANT, comme
-- avant : c'est l'aujourd'hui du vendeur qui est borné.
--
-- ── POURQUOI `security definer`, ET SON GARDE-FOU ───────────────────────────
-- Le déclencheur s'exécute avec le rôle du vendeur, qui ne doit pouvoir ni lire
-- ni écrire son compteur (sinon il le remet à zéro). Il passe donc en `security
-- definer` — sans risque d'appel direct : une fonction qui rend `trigger` ne
-- s'appelle pas hors d'un déclencheur, et son EXÉCUTION reste fermée à tous.
--
-- ⚠️ MAIS UN DÉCLENCHEUR PRIVILÉGIÉ VOIT TOUTES LES BOUTIQUES. Invoqué par un
-- vendeur qui insérerait dans la boutique d'un AUTRE, il répondrait « quota
-- atteint : 12 commandes sur 15 » avant que la RLS ne refuse — la consommation
-- d'autrui en oracle. L'ancienne version, en `invoker`, ne voyait pas ces lignes
-- et ne disait rien. D'où la garde : une session vendeur qui vise une boutique
-- qui n'est pas la sienne ne lit RIEN et laisse la RLS refuser. Les chemins sans
-- humain (rôle de service, `auth.uid()` nul) restent comptés.

-- ── 1. La consommation ──────────────────────────────────────────────────────
create table public.quotas_consommes (
  shop_id   uuid    not null references public.shops (id) on delete cascade,
  -- Le PREMIER JOUR du mois, comme `usage_counters.period_month` (046).
  mois      date    not null,
  commandes integer not null default 0 check (commandes >= 0),
  colis     integer not null default 0 check (colis >= 0),
  primary key (shop_id, mois)
);

comment on table public.quotas_consommes is
  'Ce que chaque boutique a CONSOMMÉ de ses quotas, par mois : commandes et colis créés. Ne redescend JAMAIS — « Supprimer mes données » rechargeait les quotas quand ils comptaient les lignes existantes (198). À vie = somme des mois ; ce mois-ci = la ligne du mois courant. AUCUNE POLICY : écrite et lue par les seuls déclencheurs de quota, en security definer.';

alter table public.quotas_consommes enable row level security;
alter table public.quotas_consommes force row level security;
revoke all on public.quotas_consommes from anon, authenticated;

-- ── 2. Reprise de l'existant ────────────────────────────────────────────────
-- Ce qui a été supprimé avant cette migration est perdu : on ne sait pas le
-- recompter. On part de ce qui existe, chaque ligne dans le mois qu'elle déclare.
insert into public.quotas_consommes (shop_id, mois, commandes, colis)
select shop_id, mois, sum(commandes)::integer, sum(colis)::integer
from (
  select shop_id, date_trunc('month', created_at)::date as mois, 1 as commandes, 0 as colis
  from public.orders
  union all
  select shop_id, date_trunc('month', created_at)::date, 0, 1
  from public.tracked_parcels
) lignes
group by shop_id, mois;

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
    -- À VIE : toute la consommation de la boutique, qu'aucune suppression ne
    -- rend (198). Un plafond mensuel se contourne en attendant ; celui-ci se
    -- contourne en recréant un compte, ce qui laisse une trace que
    -- l'administration voit (170-171).
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

  -- Compte `pro` : le plafond MENSUEL, sur la consommation du mois COURANT —
  -- un abonnement se renouvelle, donc un quota à vie en ferait un achat unique.
  select coalesce(sum(q.commandes), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = new.shop_id
    and q.mois = date_trunc('month', now())::date;

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL035';
  end if;

  insert into public.quotas_consommes as q (shop_id, mois, commandes)
  values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1)
  on conflict (shop_id, mois) do update set commandes = q.commandes + 1;

  return new;
end;
$$;

comment on function public.verifier_plafond_commandes() is
  'Refuse la création d''une commande au-delà du quota du compte : À VIE en gratuit, MENSUEL en pro, lus sur la CONSOMMATION (`quotas_consommes`), qu''aucune suppression ne rend (198). Security definer, avec une garde : une session vendeur ne compte que sa propre boutique. Un verrou consultatif par boutique, pris avant le comptage, empêche deux insertions simultanées de passer toutes les deux (192).';

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
    -- À VIE, sur la consommation qu'aucune suppression ne rend (198).
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

  select coalesce(sum(q.colis), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = new.shop_id
    and q.mois = date_trunc('month', now())::date;

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL051';
  end if;

  insert into public.quotas_consommes as q (shop_id, mois, colis)
  values (new.shop_id, date_trunc('month', coalesce(new.created_at, now()))::date, 1)
  on conflict (shop_id, mois) do update set colis = q.colis + 1;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà du quota du compte, ET LE QUOTA DÉPEND DU PLAN. Gratuit : deux fois le quota de commandes À VIE (30 par défaut), le facteur 2 laissant une correction de numéro par commande. Pro : UNE FOIS le plafond mensuel de commandes (197). Lus sur la CONSOMMATION (`quotas_consommes`), qu''aucune suppression ne rend (198). Security definer, avec une garde : une session vendeur ne compte que sa propre boutique. Un verrou consultatif par boutique, pris avant le comptage, empêche deux attaches simultanées de dépasser le plafond (192).';

revoke all on function public.verifier_plafond_colis() from public, anon, authenticated;
