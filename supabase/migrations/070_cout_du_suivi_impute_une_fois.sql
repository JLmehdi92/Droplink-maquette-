-- 070 — UN APPEL PAYÉ, UNE SEULE IMPUTATION.
--
-- MESURÉ AVANT CORRECTION, deux boutiques ayant enregistré le même numéro :
-- une ingestion → `tracking_api_calls` = 1 CHEZ CHACUNE. Cinq rejeux → 5 chez
-- chacune, soit DIX imputations pour UN appel réellement payé.
--
-- La cause n'est pas l'écriture croisée de l'état — celle-là est voulue et
-- documentée : un revendeur et son fournisseur suivent légitimement le même
-- colis, et tous deux doivent en voir l'avancement. La cause est que
-- `appliquer_etat_colis` écrivait UN INSTANTANÉ PAR COLIS, et que le déclencheur
-- de la 051 imputait le coût à l'instantané. Le coût suivait donc le nombre de
-- vendeurs qui regardent, alors que le fournisseur facture À LA PRISE EN CHARGE
-- D'UN NUMÉRO.
--
-- Conséquence, et c'est elle qui rend le défaut sérieux : un numéro de suivi
-- n'est pas un secret, il figure sur l'étiquette. N'importe qui pouvait donc
-- enregistrer chez lui le numéro d'un vendeur et FAIRE PORTER À CE VENDEUR le
-- coût de son propre suivi. Le seul compteur du produit qui corresponde à une
-- facture était falsifiable À LA HAUSSE, par un tiers.
--
-- LE COÛT EST DÉSORMAIS UN FAIT DE L'APPEL, PAS DE L'ÉCRITURE. Il est imputé
-- explicitement, une fois, au colis PIONNIER — le plus anciennement enregistré
-- sous ce numéro, c'est-à-dire celui dont l'enregistrement a déclenché la prise
-- en charge facturée. Les colis enregistrés ensuite profitent de l'appel sans le
-- payer une seconde fois, ce qui est exactement ce qui se passe chez le
-- fournisseur.
--
-- ET LE RETOUR VIDE EST COMPTÉ, LUI AUSSI. Il ne l'était pas : `tracking_api_calls`
-- ne bougeait que sur un instantané. Or un numéro fraîchement collé n'est pas
-- encore scanné dans le cas le plus fréquent, et l'interrogation est payée
-- quand même. Notre unique compteur de coût sous-estimait donc la dépense —
-- c'est-à-dire se trompait DU CÔTÉ RASSURANT.

-- Le déclencheur disparaît : il imputait au bon endroit pour le mauvais fait.
drop trigger if exists tracking_snapshots_compter on public.tracking_snapshots;
drop function if exists public.compter_interrogation();

/*
 * Impute un appel au fournisseur, une seule fois, au vendeur qui l'a déclenché.
 *
 * Le pionnier est départagé par `created_at` PUIS par `id` : sans le second
 * critère, deux enregistrements dans la même milliseconde rendraient
 * l'imputation NON DÉTERMINISTE, et un compteur qui change de destinataire d'un
 * appel à l'autre est pire qu'un compteur faux — il est inexplicable.
 */
create function public.imputer_appel_suivi(p_numero text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select s.owner_id into v_profil
  from public.tracked_parcels tp
  join public.shops s on s.id = tp.shop_id
  where tp.tracking_number = p_numero
  order by tp.created_at asc, tp.id asc
  limit 1;

  -- Aucun colis sous ce numéro : le fournisseur pousse aussi pour des numéros
  -- qu'on ne suit plus. Il n'y a rien à imputer, et surtout pas à un compte au
  -- hasard.
  if v_profil is null then return; end if;

  insert into public.usage_counters (profile_id, period_month, tracking_api_calls)
  values (v_profil, date_trunc('month', now())::date, 1)
  on conflict (profile_id, period_month) do update
    set tracking_api_calls = public.usage_counters.tracking_api_calls + 1,
        updated_at = now();
end;
$$;

comment on function public.imputer_appel_suivi(text) is
  'Impute UN appel au fournisseur au vendeur pionnier du numéro. Le coût suit la prise en charge, pas le nombre de vendeurs qui regardent.';

revoke execute on function public.imputer_appel_suivi(text) from public, anon, authenticated;

-- Le retour vide est payé : il compte.
create or replace function public.compter_interrogation_vide(p_numero text)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_touches integer;
begin
  update public.tracked_parcels
     set query_count = query_count + 1,
         empty_count = empty_count + 1
   where tracking_number = p_numero;
  get diagnostics v_touches = row_count;

  perform public.imputer_appel_suivi(p_numero);
  return coalesce(v_touches, 0);
end;
$$;

revoke execute on function public.compter_interrogation_vide(text)
  from public, anon, authenticated;

/*
 * `appliquer_etat_colis` — CORPS SEULEMENT, signature inchangée.
 *
 * `create or replace` est ici légitime et non un raccourci : la liste
 * d'arguments ne change pas. Si elle changeait, Postgres créerait une SECONDE
 * fonction, les deux coexisteraient, et un appel résoudrait l'ANCIENNE sans la
 * moindre erreur.
 */
create or replace function public.appliquer_etat_colis(
  p_numero text,
  p_etape public.parcel_status,
  p_statut_brut text,
  p_transporteur text,
  p_points jsonb,
  p_estimation_du text,
  p_estimation_au text,
  p_brut jsonb
)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_colis record;
  v_touches integer := 0;
  v_dernier timestamptz;
  v_premier timestamptz;
  v_pionnier uuid;
  v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
  v_du timestamptz := nullif(btrim(coalesce(p_estimation_du, '')), '')::timestamptz;
  v_au timestamptz := nullif(btrim(coalesce(p_estimation_au, '')), '')::timestamptz;
begin
  -- Le pionnier est déterminé AVANT la boucle : dedans, l'ordre de parcours est
  -- celui du plan d'exécution, pas celui de l'ancienneté.
  select tp.id into v_pionnier
  from public.tracked_parcels tp
  where tp.tracking_number = p_numero
  order by tp.created_at asc, tp.id asc
  limit 1;

  for v_colis in
    select id, normalized_status from public.tracked_parcels where tracking_number = p_numero
  loop
    insert into public.parcel_checkpoints (parcel_id, occurred_at, location, description, stage)
    select
      v_colis.id,
      (p->>'instant')::timestamptz,
      nullif(p->>'lieu', ''),
      p->>'description',
      nullif(p->>'etape', '')
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as p
    where p->>'instant' is not null
      and nullif(p->>'description', '') is not null
    on conflict (parcel_id, occurred_at, description) do nothing;

    select min(occurred_at), max(occurred_at)
      into v_premier, v_dernier
      from public.parcel_checkpoints
     where parcel_id = v_colis.id;

    update public.tracked_parcels
       set normalized_status = greatest(normalized_status, p_etape),
           raw_status = coalesce(nullif(p_statut_brut, ''), raw_status),
           carrier_code = coalesce(v_transporteur, carrier_code),
           first_movement_at = coalesce(v_premier, first_movement_at),
           last_movement_at = coalesce(v_dernier, last_movement_at),
           estimated_from = coalesce(v_du, estimated_from),
           estimated_to = coalesce(v_au, estimated_to),
           query_count = query_count + 1,
           empty_count = 0
     where id = v_colis.id;

    -- UN SEUL INSTANTANÉ PAR APPEL. La réponse brute est identique pour tous les
    -- colis portant le numéro : en écrire une copie par vendeur ne conservait
    -- rien de plus et faisait croître la table avec le nombre de vendeurs.
    if v_colis.id = v_pionnier then
      insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
      values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);
    end if;

    v_touches := v_touches + 1;
  end loop;

  if v_touches > 0 then
    perform public.imputer_appel_suivi(p_numero);
  end if;

  return v_touches;
end;
$$;

revoke execute on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated;
