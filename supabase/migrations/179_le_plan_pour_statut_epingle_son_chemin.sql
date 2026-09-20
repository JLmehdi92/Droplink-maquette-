-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ QUATRE DÉFAUTS DE LA 177, TROUVÉS PAR LES GARDES LE MÊME JOUR           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Aucun n'aurait été vu par relecture. Les quatre viennent de contrôles qui
-- INVENTORIENT la base plutôt que d'inspecter ce que leur auteur a pensé à
-- regarder — et c'est exactement pour ça qu'ils existent.
--
-- ── 1. `plan_pour_statut` N'ÉPINGLAIT PAS SON CHEMIN DE RECHERCHE ──────────
--
-- Une fonction sans `set search_path = ''` résout ses objets dans le chemin de
-- l'APPELANT. Celui-ci peut y placer son propre `public.account_plan` ou sa
-- propre table, et faire rendre à la fonction ce qu'il veut. Ici, ce qu'elle
-- rend est le PLAN D'UN COMPTE : la substitution vaudrait un abonnement gratuit.
--
-- `drop` puis `create`, et non `create or replace` : on reprend la fonction
-- entière, et le `drop` prouve qu'aucune dépendance ne traîne derrière.
--
-- ── 2. ELLE ÉTAIT EXÉCUTABLE PAR `authenticated`, SANS RAISON ─────────────
--
-- Je l'avais accordée « au cas où » un écran l'appelle. Aucun ne l'appelle. Un
-- droit donné sans appelant est une surface offerte sans contrepartie : elle
-- dirait à qui l'interroge comment le produit décide des plans, et PostgREST
-- l'expose à quiconque détient la clé publiable — qui est DANS le bundle.
--
-- ── 3. LA CLÉ ÉTRANGÈRE `payment_events.profile_id` N'AVAIT PAS D'INDEX ────
--
-- Invisible à faible volumétrie, et c'est la définition du piège : la
-- suppression d'un compte parcourt toute la table des événements pour trouver
-- les lignes à détacher.
--
-- ── 4. `DL068` DÉSIGNAIT DEUX FAITS DIFFÉRENTS ────────────────────────────
--
-- « fournisseur manquant » et « abonnement sans identifiant ». Le code fait
-- partie du CONTRAT : un appelant qui distingue dessus se tromperait, et il ne
-- le saurait pas.

-- ── 1 et 2 ──────────────────────────────────────────────────────────────────
drop function if exists public.plan_pour_statut(text, timestamptz);

create function public.plan_pour_statut(p_statut text, p_ends_at timestamptz)
  returns public.account_plan
  language sql
  stable
  set search_path = ''
as $$
  select case
    -- `past_due` reste PRO : le prélèvement a échoué, le fournisseur va
    -- réessayer. Couper au premier échec punirait une carte expirée comme une
    -- résiliation.
    when p_statut in ('on_trial', 'active', 'past_due') then 'pro'::public.account_plan
    -- ⚠️ `cancelled` RESTE PRO TANT QUE `ends_at` N'EST PAS PASSÉE : un vendeur
    -- qui résilie le 2 du mois a payé jusqu'au 30. Le couper à l'instant du
    -- clic lui vole ce qu'il a réglé.
    when p_statut = 'cancelled' and p_ends_at is not null and p_ends_at > now()
      then 'pro'::public.account_plan
    else 'gratuit'::public.account_plan
  end;
$$;

comment on function public.plan_pour_statut(text, timestamptz) is
  'Traduit un statut d''abonnement du fournisseur en plan DropLink. cancelled reste pro jusqu''à ends_at : le vendeur a payé sa période. past_due reste pro : le fournisseur réessaie le prélèvement. Chemin de recherche épinglé à vide — sans quoi l''appelant pourrait substituer ses propres objets à ceux qui décident d''un plan.';

revoke execute on function public.plan_pour_statut(text, timestamptz) from public, anon, authenticated;
grant execute on function public.plan_pour_statut(text, timestamptz) to service_role;

-- ── 3 ───────────────────────────────────────────────────────────────────────
create index payment_events_profile_id_idx on public.payment_events (profile_id);

-- ── 4 ───────────────────────────────────────────────────────────────────────
create or replace function public.appliquer_abonnement(
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
    raise exception 'abonnement sans identifiant' using errcode = 'DL069';
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
  -- rendre le même état, sans lever.
  update public.profiles set plan = v_plan where id = p_profil;

  if v_plan = 'gratuit' then
    update public.shops set hide_droplink_brand = false where owner_id = p_profil;
  end if;

  return v_plan;
end;
$$;
