-- 072 — CE QUI EST ÉCRIT SUR UN COLIS NE RECULE PAS.
--
-- Le statut, lui, ne reculait déjà pas : `greatest()` sur l'énumération le tient
-- en base depuis la 030, et l'audit l'a vérifié. Trois DATES, elles, reculaient.
--
-- 1. LE PREMIER MOUVEMENT, faux dès trente points de passage.
--    `assemblerPassages` calcule `premierMouvement` AVANT d'appliquer le plafond
--    de trente — le commentaire du module le dit explicitement, et c'est juste.
--    Mais `ingestion.ts` JETAIT la valeur et n'envoyait que les points tronqués,
--    et cette fonction recalculait `min(occurred_at)` depuis la table tronquée.
--    Mesuré sur quarante points : date affichée 11/06, date réelle 01/06 — DIX
--    JOURS d'écart, rendus au client par `lire_suivi_public`.
--    Ce n'est pas un cas limite : un trajet Chine → Europe produit couramment
--    plus de trente scans, et la date de départ est justement ce que le client
--    regarde pour juger si son colis avance.
--
-- 2. L'ESTIMATION DE LIVRAISON, mesurée : estimation au 01/09, puis une
--    notification portant le 01/08 → la table lit 01/08. `coalesce(nouveau,
--    ancien)` accepte TOUTE valeur non vide, y compris plus ancienne. Le client
--    voyait donc s'afficher une date de livraison DÉJÀ PASSÉE, ce qui dit
--    exactement l'inverse de ce que le produit promet.
--
-- 3. LE DERNIER MOUVEMENT, par le même mécanisme. Celui-là est le plus sournois
--    parce qu'il est CALCULÉ AILLEURS : le silence nommé, la cadence
--    d'interrogation et l'abandon en dépendent tous les trois. Le faire reculer
--    allonge artificiellement le silence affiché, et fait payer des
--    interrogations à un colis qui vient de bouger.
--
-- LA CORRECTION EST LA MÊME PARTOUT, ET ELLE EST DÉCLARATIVE : `least()` pour ce
-- qui ne doit que reculer dans le passé, `greatest()` pour ce qui ne doit
-- qu'avancer. Les deux IGNORENT les NULL en Postgres, ce qui est précisément la
-- sémantique voulue — une valeur absente n'écrase rien et ne bloque rien.
-- Écrire la règle en base plutôt que dans l'appelant est ce qui la rend
-- impossible à oublier dans le prochain chemin d'écriture.
--
-- `DROP` EXPLICITE ET NON `CREATE OR REPLACE` : la liste d'arguments change.
-- `create or replace` créerait une SECONDE fonction, les deux coexisteraient, et
-- un appel résoudrait l'ANCIENNE — sans erreur, donc sans que rien ne signale
-- que les dates se sont remises à reculer.

drop function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb
);

create function public.appliquer_etat_colis(
  p_numero text,
  p_etape public.parcel_status,
  p_statut_brut text,
  p_transporteur text,
  p_points jsonb,
  p_estimation_du text,
  p_estimation_au text,
  p_brut jsonb,
  p_premier_mouvement text
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
  -- La borne réelle, calculée par le module pur AVANT le plafond d'affichage.
  -- La chaîne vide vaut absence, comme pour les trois arguments ci-dessus.
  v_premier_reel timestamptz := nullif(btrim(coalesce(p_premier_mouvement, '')), '')::timestamptz;
begin
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
           -- Le départ ne peut que devenir plus ANCIEN : on apprend des scans
           -- antérieurs, on n'en perd jamais.
           first_movement_at = least(first_movement_at, v_premier, v_premier_reel),
           -- Le dernier mouvement ne peut qu'avancer : le faire reculer
           -- allongerait le silence affiché et relancerait des interrogations
           -- payantes sur un colis qui vient pourtant de bouger.
           last_movement_at = greatest(last_movement_at, v_dernier),
           estimated_from = greatest(estimated_from, v_du),
           estimated_to = greatest(estimated_to, v_au),
           query_count = query_count + 1,
           empty_count = 0
     where id = v_colis.id;

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

comment on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
) is
  'Applique un état de colis. Le statut, le départ, le dernier mouvement et l''estimation sont MONOTONES en base : aucun chemin d''écriture ne peut les faire reculer.';

revoke execute on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
) from public, anon, authenticated;
