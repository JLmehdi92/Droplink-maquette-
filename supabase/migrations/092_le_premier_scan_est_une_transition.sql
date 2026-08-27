-- 092 — LE PREMIER SCAN EST UNE TRANSITION, ET LA BASE EST LA SEULE À LA VOIR.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `premier_scan` était catalogué comme événement d'usage et déclaré SANS
-- ÉMETTEUR, avec sa raison : il désigne la PREMIÈRE MISE EN MOUVEMENT d'un
-- colis, c'est-à-dire une TRANSITION, et l'ingestion ne connaît que l'état
-- rapporté par le fournisseur. C'est la base qui compare à l'existant —
-- `least(first_movement_at, ...)` — et elle ne rendait que le nombre de
-- commandes touchées.
--
-- Avant d'être débranché il était pire qu'absent : il était émis quand l'étape
-- valait « livré ». Il comptait donc des LIVRAISONS sous le nom de premiers
-- scans. Une métrique légèrement faussée est pire qu'une métrique cassée,
-- parce qu'elle reste crédible.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI UN `DROP` EXPLICITE, ET PAS `CREATE OR REPLACE`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- LA LISTE D'ARGUMENTS NE CHANGE PAS. Le TYPE DE RETOUR, si : `integer` devient
-- une ligne à deux colonnes. Postgres refuse un `create or replace` qui change
-- le type de retour — il ne crée pas une seconde fonction dans ce cas précis,
-- il LÈVE. Le piège habituel (deux surcharges qui coexistent, un appel qui
-- résout silencieusement l'ancienne) ne s'applique donc pas ici ; mais le
-- `drop` reste obligatoire, et il a une conséquence qui, elle, est silencieuse :
--
-- ⚠️ UN `DROP` EFFACE LES DROITS AVEC LA FONCTION. Postgres accorde `EXECUTE` à
-- `PUBLIC` par défaut : la fonction recréée NAÎT OUVERTE, et le `revoke` de la
-- 072 ne la protège plus — il portait sur un objet qui n'existe plus. Aucun
-- contrôle textuel ne peut le voir, un droit d'exécution ne s'écrit pas dans le
-- corps d'une fonction. Le `revoke` est donc REPOSÉ en fin de fichier.
--
-- C'est une fonction `security definer` qui écrit dans les commandes de tous
-- les vendeurs : laissée exécutable par `anon`, elle serait le canal d'écriture
-- le plus large du produit.

drop function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
);

-- `returns table` plutôt qu'un `integer` et un paramètre `out` : c'est la forme
-- que le générateur de types Supabase rend en objet NOMMÉ côté TypeScript. Un
-- second scalaire, positionnel, se lirait `data[1]` chez l'appelant — donc se
-- confondrait avec le premier au prochain remaniement.
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
  returns table (colis integer, premier_scan boolean)
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
  -- LA TRANSITION, observée colis par colis et agrégée en un seul « oui ».
  --
  -- Elle vaut vrai si AU MOINS UN colis attaché à ce numéro est passé de
  -- « jamais bougé » à « a bougé ». Un même numéro peut porter les colis de
  -- plusieurs vendeurs — l'unicité s'arrête à la frontière du vendeur — et
  -- ceux-là démarrent ensemble : compter une transition par vendeur gonflerait
  -- l'événement d'un facteur qui suit le nombre de vendeurs, pas les colis.
  v_premier_scan boolean := false;
  v_avant timestamptz;
  v_apres timestamptz;
  v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
  v_du timestamptz := nullif(btrim(coalesce(p_estimation_du, '')), '')::timestamptz;
  v_au timestamptz := nullif(btrim(coalesce(p_estimation_au, '')), '')::timestamptz;
  v_premier_reel timestamptz := nullif(btrim(coalesce(p_premier_mouvement, '')), '')::timestamptz;
begin
  select tp.id into v_pionnier
  from public.tracked_parcels tp
  where tp.tracking_number = p_numero
  order by tp.created_at asc, tp.id asc
  limit 1;

  for v_colis in
    select id, normalized_status, first_movement_at
      from public.tracked_parcels
     where tracking_number = p_numero
  loop
    -- L'ÉTAT D'AVANT, LU AVANT D'ÉCRIRE. C'est la seule fenêtre où la
    -- transition est observable : après l'`update`, `least()` a déjà écrit la
    -- valeur, et plus rien ne distingue « il vient de partir » de « il était
    -- parti depuis trois semaines ».
    v_avant := v_colis.first_movement_at;

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
           first_movement_at = least(first_movement_at, v_premier, v_premier_reel),
           last_movement_at = greatest(last_movement_at, v_dernier),
           estimated_from = greatest(estimated_from, v_du),
           estimated_to = greatest(estimated_to, v_au),
           query_count = query_count + 1,
           empty_count = 0
     where id = v_colis.id
    returning first_movement_at into v_apres;

    -- LA TRANSITION : NULL → une valeur, et rien d'autre.
    --
    -- `least()` ignore les NULL, donc la colonne ne peut que naître ou reculer
    -- dans le temps, jamais redevenir nulle. Le seul franchissement possible
    -- est donc celui-ci, et il n'arrive qu'une fois dans la vie d'un colis.
    --
    -- La valeur d'après est lue par `returning` sur l'`update` lui-même, jamais
    -- par un second `select` : entre les deux, un autre chemin d'écriture — une
    -- notification poussée pendant que la cadence tourne — aurait pu passer, et
    -- la transition serait attribuée au mauvais appel.
    if v_avant is null and v_apres is not null then
      v_premier_scan := true;
    end if;

    perform set_config('droplink.maj_transporteur', 'oui', true);

    update public.orders o
       set status = greatest(o.status, p_etape::text::public.order_status),
           parcel_last_movement_at = greatest(o.parcel_last_movement_at, v_dernier)
      from public.order_parcels op
     where op.parcel_id = v_colis.id
       and o.id = op.order_id
       and (o.status is distinct from greatest(o.status, p_etape::text::public.order_status)
            or o.parcel_last_movement_at is distinct from
               greatest(o.parcel_last_movement_at, v_dernier));

    perform set_config('droplink.maj_transporteur', '', true);

    if v_colis.id = v_pionnier then
      insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
      values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);
    end if;

    v_touches := v_touches + 1;
  end loop;

  if v_touches > 0 then
    perform public.imputer_appel_suivi(p_numero);
  end if;

  colis := v_touches;
  premier_scan := v_premier_scan;
  return next;
end;
$$;

comment on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
) is
  'Applique un état de colis ET LE DESCEND DANS LES COMMANDES ATTACHÉES, dans la même transaction. Rend le nombre de colis touchés ET si l''un d''eux vient de se mettre en mouvement pour la première fois — une TRANSITION, que seule la base peut observer puisqu''elle seule connaît l''état d''avant. Statut, départ, dernier mouvement et estimation sont MONOTONES : aucun chemin d''écriture ne peut les faire reculer.';

-- ⚠️ REPOSÉ APRÈS LE `DROP`. Voir l'en-tête : la fonction recréée naît
-- exécutable par PUBLIC, et le `revoke` de la 072 portait sur un objet détruit.
revoke execute on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
) from public, anon, authenticated;
