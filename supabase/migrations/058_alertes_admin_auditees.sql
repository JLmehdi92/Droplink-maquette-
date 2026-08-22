-- 058 — Les alertes du panneau écrivent leur trace, comme toute lecture humaine.
--
-- DÉFAUT ÉTABLI PAR LE CATALOGUE : `alertes_admin` porte `provolatile = 's'`.
-- Une fonction `stable` est exécutée par PostgREST dans une transaction EN
-- LECTURE SEULE : elle est donc PHYSIQUEMENT incapable d'écrire l'audit. Et
-- elle rend `p.email` — l'adresse en clair des comptes dépassant le seuil.
--
-- LE SCÉNARIO : un administrateur ouvre le panneau, l'écran affiche
-- « alice@exemple.com — 1 840 colis ». Aucune ligne dans `admin_audit_log`. En
-- rechargeant, on énumère à volonté les emails des plus gros comptes avec leur
-- volume d'activité, sans laisser la moindre trace. `lister_comptes_admin`, qui
-- rend exactement les mêmes emails, l'écrit, elle.
--
-- POURQUOI CE DÉFAUT EXISTE. La migration 041 a converti les lectures auditées
-- en `volatile` pour cette raison précise. `alertes_admin` a été écrite APRÈS,
-- en 045, puis remaniée en 047 — et la correction n'a pas été propagée. C'est
-- L-025 : le garde a hérité du champ de vision de la correction, pas du
-- problème.
--
-- UNE SEULE ENTRÉE PAR CONSULTATION, portant ses critères — jamais une par
-- ligne rendue, qui noierait les consultations individuelles. La signature ne
-- change pas : `create or replace` remplace donc réellement, sans laisser de
-- seconde surcharge.

create or replace function public.alertes_admin(p_seuil_colis int, p_retard_minutes int)
  returns table (
    genre text,
    gravite text,
    sujet text,
    valeur bigint,
    seuil bigint
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

  -- LA TRACE PRÉCÈDE LA LECTURE, dans la même transaction. Écrite après, elle
  -- serait sautée par une sortie anticipée ajoutée plus tard — et un accès dont
  -- l'audit échoue doit être refusé, pas servi.
  perform public.journaliser_admin(
    'panneau.alertes',
    'usage_counters',
    null,
    null,
    null,
    jsonb_build_object('seuil_colis', p_seuil_colis, 'retard_minutes', p_retard_minutes)
  );

  return query
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
