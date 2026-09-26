-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE VENDEUR SAIT QUE SON SUIVI EST BLOQUÉ PAR LE QUOTA DE COLIS           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── LE DÉFAUT, TROUVÉ LE 26/09/2026 ─────────────────────────────────────────
-- Au quota de colis (DL070 en gratuit, DL051 en Pro), le numéro de suivi
-- s'enregistrait, l'attache du colis était refusée, et l'éditeur disait
-- « enregistré ». Aucun suivi ne démarrait, et rien ne le disait : la frise
-- restait « en attente » indéfiniment — la contrainte n° 8 à l'envers.
--
-- La Server Action rapporte désormais le refus à la sauvegarde. Mais au
-- rechargement de la fiche, l'écran ne voit qu'un numéro sans colis, et ne peut
-- pas deviner POURQUOI : la consommation (`quotas_consommes`, 198) est fermée au
-- vendeur, et doit le rester — il la remettrait à zéro.
--
-- ── LE REMÈDE ───────────────────────────────────────────────────────────────
-- Une question, une réponse : le quota de colis de MA boutique est-il atteint ?
-- 'gratuit' (à vie), 'mensuel' (Pro, ce mois-ci) ou NULL. Même règle, mêmes
-- plafonds que `verifier_plafond_colis` (198) — c'est lui qui refuse, cette
-- fonction ne fait que le redire. Sans argument : la boutique est celle de
-- l'appelant (`mon_shop_id()`), et aucune autre ne peut être interrogée.
--
-- Sans cette migration en production, la fiche ne casse pas : la lecture
-- échoue, et l'avis ne s'affiche qu'à la sauvegarde qui a été refusée.

create function public.mon_quota_colis_atteint()
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

  select coalesce(sum(q.colis), 0) into v_compte
  from public.quotas_consommes q
  where q.shop_id = v_shop
    and q.mois = date_trunc('month', now())::date;

  return case when v_compte >= public.lire_plafond_commandes() then 'mensuel' end;
end;
$$;

comment on function public.mon_quota_colis_atteint() is
  'Le quota de colis de la boutique de l''APPELANT est-il atteint ? ''gratuit'' (à vie), ''mensuel'' (Pro, mois courant) ou NULL. Redit la règle de `verifier_plafond_colis` (198) sans ouvrir la consommation : l''éditeur explique ainsi un numéro sans suivi (199).';

revoke all on function public.mon_quota_colis_atteint() from public, anon;
grant execute on function public.mon_quota_colis_atteint() to authenticated;
