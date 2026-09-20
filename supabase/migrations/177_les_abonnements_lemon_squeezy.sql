-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LES ABONNEMENTS — décision de Wassim, 20/09/2026                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- « je veux que quand le mec a prix son abonnement et que il a payé via stripe
-- ou lemon squeezy et bah il a son abonnement automatiquement sur le saas ! »
--
-- ⚠️ CECI LÈVE LA CONTRAINTE N° 1, ET C'EST WASSIM QUI LA LÈVE. Le dépôt a
-- interdit tout code de paiement depuis le premier jour, et l'a réaffirmé à
-- chaque écran de facturation du kit laissé non codé. La contrainte disait
-- « aucun traitement de paiement, pas de table subscriptions ». Elle tombe
-- aujourd'hui sur décision explicite du propriétaire du produit, et CLAUDE.md
-- est corrigé dans le même commit — sinon le dépôt porterait deux vérités.
--
-- CE QUI NE CHANGE PAS : **aucune carte ne passe par nous**. Lemon Squeezy est
-- un MERCHANT OF RECORD : il encaisse, il facture, il collecte et reverse la
-- TVA. Le produit ne voit jamais un numéro de carte, ne stocke aucun moyen de
-- paiement, et n'a pas de compte marchand à réconcilier. Ce que ce fichier
-- modélise n'est pas un paiement : c'est **l'état d'un abonnement** tel qu'un
-- tiers nous le RACONTE.
--
-- ── POURQUOI UNE TABLE, ET PAS UNE COLONNE SUR `profiles` ──────────────────
--
-- Parce qu'un abonnement a une VIE : il naît, se renouvelle, est résilié mais
-- court jusqu'à sa date de fin, expire, peut renaître. Une colonne `plan` dit
-- l'état d'aujourd'hui et perd tout le reste — or c'est le reste qui permet de
-- répondre à « depuis quand », « jusqu'à quand », et « pourquoi ce compte est
-- repassé gratuit ». `profiles.plan` reste la VÉRITÉ D'ACCÈS, celle que le
-- déclencheur de quota interroge ; cette table est ce qui la JUSTIFIE.

-- ── 1. L'abonnement ─────────────────────────────────────────────────────────
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Le fournisseur est nommé plutôt que supposé : Wassim a demandé « stripe ou
  -- lemon squeezy », et le second est retenu. Le jour où l'autre arrive, il
  -- n'aura pas besoin d'une seconde table — seulement d'une seconde valeur.
  provider text not null,
  provider_subscription_id text not null,

  /*
   * LE STATUT EST STOCKÉ **BRUT**, tel que le fournisseur l'écrit.
   *
   * Le traduire ici en « actif / inactif » perdrait la distinction qui compte :
   * chez Lemon Squeezy, `cancelled` ne veut PAS dire « coupé » — l'abonnement
   * est résilié mais COURT JUSQU'À `ends_at`. Un vendeur qui résilie le 2 du
   * mois a payé jusqu'au 30, et lui couper l'accès le 2 serait un vol.
   * La traduction en plan se fait dans `public.plan_pour_statut`, à un seul
   * endroit, et elle est éprouvable seule.
   */
  status text not null,

  renews_at timestamptz,
  ends_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- UN abonnement par identifiant de fournisseur. C'est la clé sur laquelle le
  -- webhook fait son `upsert` : sans elle, chaque renouvellement créerait une
  -- ligne de plus et « l'abonnement courant » deviendrait une question ouverte.
  unique (provider, provider_subscription_id)
);

comment on table public.subscriptions is
  'L''état d''un abonnement tel que le fournisseur (Merchant of Record) nous le raconte. Aucune donnée de paiement : ni carte, ni montant, ni moyen de paiement. profiles.plan reste la vérité d''accès ; cette table est ce qui la justifie.';

create index subscriptions_profile_id_idx on public.subscriptions (profile_id);

-- ⚠️ RLS DÈS LA PREMIÈRE MIGRATION, jamais en rattrapage : Supabase accorde
-- SELECT/INSERT/UPDATE/DELETE à `anon` par défaut, et une table créée sans RLS
-- est grande ouverte sans que le fichier de migration ne le dise.
alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

-- Le vendeur lit le SIEN, et rien d'autre. Il n'écrit rien : un abonnement
-- n'est pas une déclaration de l'utilisateur, c'est un fait du fournisseur.
create policy "un vendeur lit son propre abonnement"
  on public.subscriptions
  for select
  to authenticated
  using (
    profile_id in (
      select p.id from public.profiles p where p.user_id = (select auth.uid())
    )
  );

revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;

-- ── 2. Les événements reçus ─────────────────────────────────────────────────
--
-- POURQUOI LES GARDER. Un webhook est la seule surface du produit où un tiers
-- écrit chez nous sans que personne ne regarde. Quand un vendeur dira « j'ai
-- payé et je n'ai rien », la seule réponse honnête viendra d'ici : l'événement
-- est-il arrivé, quand, et qu'est-ce qu'on en a fait.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_name text not null,

  /*
   * LA SIGNATURE SERT DE CLÉ D'IDEMPOTENCE, et c'est un choix, pas un hasard :
   * Lemon Squeezy n'envoie AUCUN identifiant d'événement. Or il réessaie en cas
   * d'échec, et un renvoi porte exactement le même corps — donc exactement la
   * même signature HMAC. Deux corps distincts ne peuvent pas la partager.
   */
  signature text not null,

  payload jsonb not null,
  profile_id uuid references public.profiles(id) on delete set null,
  /* Ce qu'on en a fait : 'applique', 'sans_destinataire', 'ignore'. */
  issue text not null,
  received_at timestamptz not null default now(),

  unique (provider, signature)
);

comment on table public.payment_events is
  'Journal des webhooks de paiement reçus, avec ce qu''on en a fait. La signature sert de clé d''idempotence : le fournisseur n''envoie aucun identifiant d''événement, et un renvoi porte le même corps donc la même signature.';

alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;
revoke all on public.payment_events from anon, authenticated;

-- ── 3. La traduction d'un statut en plan — UN SEUL ENDROIT ──────────────────
--
-- ⚠️ `cancelled` DONNE `pro` TANT QUE `ends_at` N'EST PAS PASSÉE. C'est la
-- règle qui se perd le plus facilement, et celle qui se paie le plus cher : un
-- vendeur qui résilie a payé jusqu'à la fin de sa période. Le couper à l'instant
-- du clic lui vole ce qu'il a réglé, et c'est le genre de défaut dont on
-- n'entend parler qu'une fois, en public.
create function public.plan_pour_statut(p_statut text, p_ends_at timestamptz)
  returns public.account_plan
  language sql
  stable
as $$
  select case
    -- `past_due` reste PRO : le prélèvement a échoué, le fournisseur va
    -- réessayer. Couper au premier échec punirait une carte expirée comme une
    -- résiliation.
    when p_statut in ('on_trial', 'active', 'past_due') then 'pro'::public.account_plan
    when p_statut = 'cancelled' and p_ends_at is not null and p_ends_at > now()
      then 'pro'::public.account_plan
    else 'gratuit'::public.account_plan
  end;
$$;

comment on function public.plan_pour_statut(text, timestamptz) is
  'Traduit un statut d''abonnement du fournisseur en plan DropLink. cancelled reste pro jusqu''à ends_at : le vendeur a payé sa période. past_due reste pro : le fournisseur réessaie le prélèvement.';

revoke execute on function public.plan_pour_statut(text, timestamptz) from public, anon;
grant execute on function public.plan_pour_statut(text, timestamptz) to authenticated, service_role;

-- ── 4. Appliquer un événement — chemin SANS HUMAIN ──────────────────────────
--
-- `definir_plan_compte` (167) exige une session d'ADMINISTRATEUR et un motif :
-- c'est un geste humain, tracé comme tel. Un webhook n'est personne. Lui prêter
-- l'identité d'un administrateur ferait apparaître dans le journal d'audit des
-- actions que personne n'a faites — et ce journal ne sert qu'à répondre « qui ».
create function public.appliquer_abonnement(
  p_provider        text,
  p_subscription_id text,
  p_profil          uuid,
  p_statut          text,
  p_renews_at       timestamptz,
  p_ends_at         timestamptz
)
  returns public.account_plan
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_plan  public.account_plan;
  v_avant public.account_plan;
begin
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'fournisseur manquant' using errcode = 'DL068';
  end if;
  if p_subscription_id is null or btrim(p_subscription_id) = '' then
    raise exception 'abonnement sans identifiant' using errcode = 'DL068';
  end if;

  select p.plan into v_avant from public.profiles p where p.id = p_profil for update;
  if v_avant is null then
    -- Le destinataire n'existe pas. L'appelant DOIT le traiter : un paiement
    -- qu'on ne sait pas rattacher se signale, il ne se perd pas.
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  v_plan := public.plan_pour_statut(p_statut, p_ends_at);

  insert into public.subscriptions
    (profile_id, provider, provider_subscription_id, status, renews_at, ends_at)
  values
    (p_profil, p_provider, p_subscription_id, p_statut, p_renews_at, p_ends_at)
  on conflict (provider, provider_subscription_id) do update
    set status     = excluded.status,
        renews_at  = excluded.renews_at,
        ends_at    = excluded.ends_at,
        profile_id = excluded.profile_id,
        updated_at = now();

  -- ÉCRITURE INCONDITIONNELLE, et c'est voulu : rejouer le même événement doit
  -- rendre le même état, sans lever. Un webhook se renvoie, et un chemin
  -- d'idempotence qui lève transforme une reprise normale en incident.
  update public.profiles set plan = v_plan where id = p_profil;

  -- Repassé en gratuit, l'interrupteur retombe — même règle qu'en 167 : un
  -- réglage que le compte ne peut plus tenir ne reste pas affiché comme levé.
  if v_plan = 'gratuit' then
    update public.shops set hide_droplink_brand = false where owner_id = p_profil;
  end if;

  return v_plan;
end;
$$;

comment on function public.appliquer_abonnement(text, text, uuid, text, timestamptz, timestamptz) is
  'Applique l''état d''un abonnement reçu par webhook : upsert de la ligne, puis pose du plan. Chemin SANS HUMAIN — service_role seul, et surtout PAS definir_plan_compte, qui exige une session d''administrateur et écrirait au journal d''audit une action que personne n''a faite. Idempotente : rejouer le même événement rend le même état sans lever.';

revoke execute on function public.appliquer_abonnement(text, text, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.appliquer_abonnement(text, text, uuid, text, timestamptz, timestamptz)
  to service_role;
