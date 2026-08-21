-- 030 — Appliquer l'état d'un colis, en UNE écriture.
--
-- LE STATUT NE RECULE JAMAIS, ET C'EST LA BASE QUI LE GARANTIT.
--
-- Le module de normalisation le garantit déjà côté application, mais une règle
-- applicative peut être oubliée dans un nouveau chemin de code — et il y en aura
-- au moins deux ici : la notification poussée par le transporteur, et la tâche
-- de fond qui interroge. `greatest()` sur un type énuméré suit l'ORDRE DE
-- DÉCLARATION du type, et l'ordre de déclaration de `parcel_status` EST celui de
-- la frise. Le recul devient donc impossible, sans qu'aucun appelant ait à y
-- penser.
--
-- UNE NOTIFICATION NE DÉSIGNE QU'UN NUMÉRO, pas un vendeur. La fonction met donc
-- à jour TOUS les colis qui portent ce numéro, quel que soit leur vendeur. Ce
-- n'est pas une fuite : chacun de ces vendeurs a saisi ce numéro lui-même, et un
-- revendeur qui suit le même colis que son fournisseur est le cas NORMAL. Ne
-- mettre à jour que le premier trouvé aurait laissé les autres figés pour
-- toujours, sans erreur.
--
-- ELLE REND LE NOMBRE DE COLIS TOUCHÉS. Zéro n'est pas une erreur : le
-- fournisseur pousse aussi des notifications pour des numéros qu'on a cessé de
-- suivre. Mais c'est une information — un point de réception qui répond 200 ne
-- prouve pas qu'il a accepté quoi que ce soit.

create function public.appliquer_etat_colis(
  p_numero text,
  p_etape public.parcel_status,
  p_statut_brut text,
  p_transporteur integer,
  p_points jsonb,
  p_estimation_du timestamptz,
  p_estimation_au timestamptz,
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
begin
  for v_colis in
    select id, normalized_status from public.tracked_parcels where tracking_number = p_numero
  loop
    -- LES POINTS DE PASSAGE D'ABORD. `on conflict do nothing` s'appuie sur la
    -- contrainte d'unicité (colis, instant, description) : le fournisseur
    -- renvoie l'historique COMPLET à chaque appel, et sans elle chaque
    -- notification dupliquerait tout ce qui précède.
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

    -- Les bornes sont relues DEPUIS LA TABLE, pas depuis la charge utile : une
    -- notification qui ne porterait que le dernier événement ferait sinon
    -- reculer la date du premier mouvement.
    select min(occurred_at), max(occurred_at)
      into v_premier, v_dernier
      from public.parcel_checkpoints
     where parcel_id = v_colis.id;

    update public.tracked_parcels
       set normalized_status = greatest(normalized_status, p_etape),
           raw_status = coalesce(nullif(p_statut_brut, ''), raw_status),
           carrier_code = coalesce(p_transporteur, carrier_code),
           first_movement_at = v_premier,
           last_movement_at = v_dernier,
           estimated_from = coalesce(p_estimation_du, estimated_from),
           estimated_to = coalesce(p_estimation_au, estimated_to),
           query_count = query_count + 1,
           -- Un retour QUI PORTE quelque chose remet le compteur de vides à
           -- zéro : le colis a parlé, la fenêtre d'abandon n'a plus lieu d'être.
           empty_count = 0
     where id = v_colis.id;

    insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
    values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);

    v_touches := v_touches + 1;
  end loop;

  return v_touches;
end;
$$;

comment on function public.appliquer_etat_colis is
  'Applique un état de colis. greatest() sur l''énumération garantit EN BASE que le statut ne recule jamais.';

-- Le seul appelant légitime est le rôle système : le point de réception et la
-- tâche de fond. Un vendeur qui pourrait l'appeler raconterait à son client une
-- expédition qui n'a pas eu lieu.
revoke execute on function public.appliquer_etat_colis(
  text, public.parcel_status, text, integer, jsonb, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;

/*
 * Compte une interrogation qui n'a RIEN rapporté.
 *
 * Elle existe séparément parce qu'un retour vide ne se traite pas comme un
 * retour plein : il est FACTURÉ — donc compté — mais il ne déplace ni le statut
 * ni les dates de mouvement. Les fondre en une seule fonction aurait fait
 * écraser `last_movement_at` par `null` à chaque « pas encore scanné », et un
 * colis en transit aurait paru n'avoir jamais bougé.
 */
create function public.compter_interrogation_vide(p_numero text)
  returns integer
  language sql
  security definer
  set search_path = ''
as $$
  with maj as (
    update public.tracked_parcels
       set query_count = query_count + 1,
           empty_count = empty_count + 1
     where tracking_number = p_numero
    returning 1
  )
  select coalesce(count(*)::integer, 0) from maj;
$$;

revoke execute on function public.compter_interrogation_vide(text)
  from public, anon, authenticated;
