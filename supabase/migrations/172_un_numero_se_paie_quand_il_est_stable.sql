-- 172 — UN NUMÉRO SE PAIE QUAND IL EST STABLE.
--
-- Audit du 20/09/2026. Le champ de suivi s'enregistre 800 ms après la dernière frappe, et
-- CHAQUE enregistrement d'un numéro nouveau créait un colis, aussitôt pris en charge chez le
-- fournisseur. Taper « LX12 », hésiter, finir le numéro faisait deux colis ; le premier était
-- faux, et sa prise en charge se payait sur les 200 à VIE du palier gratuit dès que le
-- fournisseur en reconnaissait la forme (il accepte des numéros inventés : 9 crédits perdus le
-- 20/09 sur des « LX…123FR » de test). Les colis intermédiaires restaient en base, détachés :
-- ils comptaient dans le plafond mensuel du vendeur et s'affichaient dans ses envois.
--
-- Trois règles, et c'est la BASE qui les tient — l'application ne fait que demander :
--   1. détacher un colis jamais pris en charge que plus aucune commande ne porte le SUPPRIME :
--      il n'a rien coûté, il ne désigne plus rien ;
--   2. `colis_a_inscrire` dit, au moment de payer, si un colis est STABLE : attaché, jamais
--      pris en charge, non abandonné, créé depuis au moins 30 secondes ;
--   3. la cadence ne sélectionne un colis jamais pris en charge que s'il est stable.

-- ── 1. L'attache, recopiée de la 165 : seul s'ajoute le ménage des colis détachés ──
drop function if exists public.attacher_colis(uuid, text, text);

create function public.attacher_colis(p_order_id uuid, p_numero text, p_transporteur text)
  returns table (parcel_id uuid, cree boolean, a_inscrire boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_numero text := btrim(coalesce(p_numero, ''));
  v_transporteur integer :=
    case when btrim(coalesce(p_transporteur, '')) ~ '^[1-9][0-9]{0,8}$'
         then btrim(p_transporteur)::integer
    end;
  v_ancien integer;
  v_parcel uuid;
  v_cree boolean := false;
  v_relance boolean := false;
  v_detaches uuid[];
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    -- Même réponse que pour une commande inexistante : distinguer les deux
    -- révélerait l'existence de la commande d'un autre vendeur.
    raise exception 'Commande introuvable.' using errcode = 'DL012';
  end if;

  -- DÉTACHER D'ABORD, TOUJOURS. Sans cela, corriger une faute de frappe
  -- laisserait la commande liée aux DEUX numéros, et la page publique
  -- afficherait le suivi d'un colis qui n'est plus le sien.
  with detaches as (
    delete from public.order_parcels op
     using public.tracked_parcels tp
     where op.order_id = p_order_id
       and op.parcel_id = tp.id
       and (v_numero = '' or tp.tracking_number <> v_numero)
    returning op.parcel_id
  )
  select array_agg(d.parcel_id) into v_detaches from detaches d;

  -- LE MÉNAGE (172). Un colis détaché à l'instant, JAMAIS pris en charge, et que plus aucune
  -- commande ne porte, est une saisie abandonnée : il n'a rien coûté et ne désigne plus rien.
  -- Un colis pris en charge garde sa ligne (il a été payé et porte un historique) ; un colis
  -- qu'une autre commande porte encore aussi (le groupage).
  if v_detaches is not null then
    delete from public.tracked_parcels tp
     where tp.id = any(v_detaches)
       and tp.registered_at is null
       and not exists (select 1 from public.order_parcels op where op.parcel_id = tp.id);
  end if;

  if v_numero = '' then
    return query select null::uuid, false, false;
    return;
  end if;

  -- LE TRANSPORTEUR D'AVANT, VERROUILLÉ. La relance compare l'ancien au
  -- nouveau ; lus sans verrou, deux enregistrements simultanés verraient tous
  -- deux l'ancien et relanceraient deux fois.
  select tp.carrier_code into v_ancien
    from public.tracked_parcels tp
   where tp.shop_id = v_shop and tp.tracking_number = v_numero
   for update;

  -- L'INSERTION ET LE VERDICT SONT LE MÊME ORDRE. `xmax = 0` distingue une
  -- ligne réellement insérée d'une ligne rendue par `do update` : c'est ce qui
  -- fait la différence entre payer une prise en charge et ne pas la payer.
  --
  -- LE CODE D'UN COLIS DÉJÀ PRIS EN CHARGE NE BOUGE PLUS (migration 165) : le
  -- fournisseur le suit sous celui-là.
  insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
  values (v_shop, v_numero, v_transporteur)
  on conflict (shop_id, tracking_number)
    do update set carrier_code =
      case when tp.registered_at is null
           then coalesce(excluded.carrier_code, tp.carrier_code)
           else tp.carrier_code
      end
  returning tp.id, (tp.xmax = 0) into v_parcel, v_cree;

  -- LA RELANCE. Quatre conditions, et chacune ferme une dépense : un
  -- transporteur NOUVEAU, un colis JAMAIS pris en charge, un colis ABANDONNÉ,
  -- et moins de CINQ refus déjà essuyés (migration 165).
  if not v_cree and v_transporteur is not null and v_transporteur is distinct from v_ancien then
    update public.tracked_parcels tp
       set abandoned_at = null
     where tp.id = v_parcel
       and tp.registered_at is null
       and tp.abandoned_at is not null
       and tp.query_count < 5;
    v_relance := found;
  end if;

  insert into public.order_parcels (order_id, parcel_id)
  values (p_order_id, v_parcel)
  on conflict do nothing;

  /*
   * ── L'HÉRITAGE (migration 136) ───────────────────────────────────────────
   *
   * Un colis qui existait déjà porte un état que personne ne redescendra : la
   * descente vit sur le chemin de l'ingestion, et un colis livré n'est plus
   * interrogé. On la fait donc ici, à l'attache, avec la même écriture
   * monotone que la migration 090.
   */
  perform set_config('droplink.maj_transporteur', 'oui', true);

  update public.orders o
     set status = greatest(o.status, tp.normalized_status::text::public.order_status),
         parcel_last_movement_at = greatest(o.parcel_last_movement_at, tp.last_movement_at)
    from public.tracked_parcels tp
   where tp.id = v_parcel
     and o.id = p_order_id
     -- N'ÉCRIRE QUE SI QUELQUE CHOSE CHANGE, comme en 090 : sans ce filtre,
     -- chaque enregistrement du champ de suivi réécrirait la ligne.
     and (o.status is distinct from greatest(o.status, tp.normalized_status::text::public.order_status)
          or o.parcel_last_movement_at is distinct from
             greatest(o.parcel_last_movement_at, tp.last_movement_at));

  perform set_config('droplink.maj_transporteur', '', true);

  return query select v_parcel, v_cree, (v_cree or v_relance);
end;
$$;

comment on function public.attacher_colis(uuid, text, text) is
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande (monotone, greatest). Un colis détaché jamais pris en charge et que plus aucune commande ne porte est SUPPRIMÉ (172 : une saisie en cours ne laisse rien). Rend le colis, un verdict de création, et `a_inscrire` : vrai quand une prise en charge doit partir — colis neuf, ou colis abandonné sans jamais avoir été pris en charge dont le vendeur vient de préciser un AUTRE transporteur, dans la limite de cinq refus. La prise en charge elle-même attend que le colis soit STABLE (colis_a_inscrire).';

-- Les droits ne survivent PAS au drop : reposés à l'identique de la 165.
revoke all on function public.attacher_colis(uuid, text, text) from public;
grant execute on function public.attacher_colis(uuid, text, text) to authenticated, service_role;

-- ── 2. Au moment de payer : ce colis est-il stable ? ───────────────────────────
create function public.colis_a_inscrire(p_parcel_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.tracked_parcels tp
     where tp.id = p_parcel_id
       and tp.registered_at is null
       and tp.abandoned_at is null
       -- TRENTE SECONDES : le champ s'enregistre 800 ms après la dernière frappe, et un
       -- vendeur qui recopie un numéro depuis une photo s'arrête plus d'une fois. Un numéro
       -- qui a tenu trente secondes est celui qu'il a fini d'écrire.
       and tp.created_at <= now() - interval '30 seconds'
       and exists (select 1 from public.order_parcels op where op.parcel_id = tp.id)
  );
$$;

revoke all on function public.colis_a_inscrire(uuid) from public;
revoke all on function public.colis_a_inscrire(uuid) from anon, authenticated;
grant execute on function public.colis_a_inscrire(uuid) to service_role;

comment on function public.colis_a_inscrire(uuid) is
  'Vrai si le colis peut être pris en charge — donc PAYÉ — maintenant : attaché à une commande, jamais pris en charge, non abandonné, créé depuis au moins 30 secondes (172). Appelée par prendreEnCharge juste avant l''appel au fournisseur, sur les deux chemins (sauvegarde et cadence).';

-- ── 3. La cadence, recopiée de la 145 : un colis jamais pris en charge n'est sélectionné
--      que s'il est stable (même règle que colis_a_inscrire, lue ici pour ne pas même le réserver)
drop function if exists public.colis_a_interroger(integer);

create function public.colis_a_interroger(p_limite integer)
  returns table (
    id uuid,
    tracking_number text,
    carrier_code integer,
    normalized_status public.parcel_status,
    registered_at timestamptz,
    last_movement_at timestamptz,
    last_query_at timestamptz,
    empty_count integer
  )
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels p
     -- LA RÉSERVATION EST L'ÉCRITURE, mais elle n'écrit plus la date
     -- d'interrogation : réserver un colis n'est pas l'avoir interrogé.
     set reserve_at = now()
    from (
     select c.id, c.last_query_at
     from public.tracked_parcels c
     where c.abandoned_at is null
       and c.normalized_status <> 'livre'
       -- Trois heures : l'intervalle le plus COURT de la cadence (migration 145).
       and (c.last_query_at is null or c.last_query_at < now() - interval '3 hours')
       and (c.reserve_at is null or c.reserve_at < now() - interval '3 hours')
       -- LE NUMÉRO STABLE (172) : un colis jamais pris en charge n'est repris que s'il est
       -- porté par une commande et qu'il a tenu trente secondes. Sinon la cadence payait un
       -- numéro en cours de saisie, ou un colis que plus rien ne porte.
       and (c.registered_at is not null
            or (c.created_at <= now() - interval '30 seconds'
                and exists (select 1 from public.order_parcels op where op.parcel_id = c.id)))
     -- `nulls first` : un colis JAMAIS interrogé est celui dont le vendeur vient de
     -- coller le numéro, et il attend devant son écran.
     order by c.last_query_at asc nulls first
     limit greatest(1, least(coalesce(p_limite, 50), 200))
     for update skip locked
   ) as avant
   where p.id = avant.id
  returning p.id, p.tracking_number, p.carrier_code, p.normalized_status,
            p.registered_at, p.last_movement_at,
            avant.last_query_at,
            p.empty_count;
$$;

comment on function public.colis_a_interroger(integer) is
  'Réserve et rend les colis à interroger. La sélection EST la réservation : deux passages concurrents ne peuvent pas rendre le même colis. La réservation écrit `reserve_at`, JAMAIS `last_query_at`. Un colis jamais pris en charge n''est rendu que s''il est STABLE : porté par une commande et créé depuis au moins 30 secondes (172).';

revoke all on function public.colis_a_interroger(integer) from public;
grant execute on function public.colis_a_interroger(integer) to service_role;
