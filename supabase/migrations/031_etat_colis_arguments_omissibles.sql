-- 031 — `appliquer_etat_colis` : les arguments absents se disent par une chaîne vide.
--
-- MÊME CAUSE QU'EN 020, ET C'EST LA DEUXIÈME FOIS. Une signature Postgres ne dit
-- RIEN de la nullité de ses arguments : le générateur de types les décrit donc
-- tous comme non nuls, et le typage refuse un appel parfaitement légitime. Or
-- trois de ces arguments sont absents dans le cas le plus fréquent — le
-- transporteur n'est pas toujours détecté, et une estimation de livraison
-- n'existe souvent pas du tout.
--
-- La convention du dépôt est donc appliquée : LA CHAÎNE VIDE VAUT ABSENCE, et la
-- fonction traduit. C'est déjà ce que font `p_pays` et `p_profil` de
-- `enregistrer_vue`. L'alternative — affaiblir le typage côté application par
-- une conversion — aurait déplacé le problème là où plus aucun outil ne le
-- regarde.
--
-- `DROP` EXPLICITE ET NON `CREATE OR REPLACE` : la liste d'arguments change.
-- Postgres créerait une SECONDE fonction, les deux coexisteraient, et un appel
-- résoudrait l'ANCIENNE — sans la moindre erreur, donc sans que rien ne signale
-- que le suivi a cessé d'enregistrer les estimations.

drop function public.appliquer_etat_colis(
  text, public.parcel_status, text, integer, jsonb, timestamptz, timestamptz, jsonb
);

create function public.appliquer_etat_colis(
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
  v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
  v_du timestamptz := nullif(btrim(coalesce(p_estimation_du, '')), '')::timestamptz;
  v_au timestamptz := nullif(btrim(coalesce(p_estimation_au, '')), '')::timestamptz;
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
           carrier_code = coalesce(v_transporteur, carrier_code),
           first_movement_at = coalesce(v_premier, first_movement_at),
           last_movement_at = coalesce(v_dernier, last_movement_at),
           estimated_from = coalesce(v_du, estimated_from),
           estimated_to = coalesce(v_au, estimated_to),
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

revoke execute on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb
) from public, anon, authenticated;
