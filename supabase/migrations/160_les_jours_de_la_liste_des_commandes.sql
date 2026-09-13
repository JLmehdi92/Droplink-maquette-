/*
 * 160 — Le nombre de jours de la liste des commandes devient un texte.
 *
 * LA 159 LE DÉCLARAIT `integer`, ET LE CONTRAT GÉNÉRÉ LE REND OBLIGATOIRE. Les
 * types de Supabase ne savent pas qu'un argument `integer` accepte `null` : ils
 * l'écrivent `number`, donc l'appelant ne pouvait pas dire « toutes les dates »
 * sans mentir au typage. La convention du dépôt existe déjà pour ce cas — LA
 * CHAÎNE VIDE VAUT ABSENCE, comme les deux moitiés du curseur — et c'est elle
 * qui est reprise, plutôt qu'une valeur magique « 0 jour ».
 *
 * UNE MIGRATION DE PLUS, PAS LA 159 ROUVERTE : elle est appliquée à la base de
 * tests, et un fichier modifié après application fait diverger les
 * environnements sans que rien ne le dise.
 *
 * `drop` OBLIGATOIRE : la liste d'arguments change, et `create or replace`
 * créerait une SECONDE fonction qu'un appel résoudrait peut-être à la place de
 * celle-ci. Le corps est celui de la 159, dont il hérite toutes les gardes.
 */

drop function if exists public.lister_commandes_admin(text, text, integer, text, text, integer, text);

create function public.lister_commandes_admin(
  p_recherche text,
  p_statut text,
  p_jours text,
  p_curseur_date text,
  p_curseur_id text,
  p_limite integer,
  p_ip_hash text
)
  returns table (
    id uuid,
    reference_courte text,
    boutique_id uuid,
    boutique_nom text,
    accent_color text,
    proprietaire_id uuid,
    proprietaire_email text,
    statut public.order_status,
    transporteur integer,
    created_at timestamptz
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_recherche text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_statut text := nullif(btrim(coalesce(p_statut, '')), '');
  v_date timestamptz := nullif(btrim(coalesce(p_curseur_date, '')), '')::timestamptz;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
  v_reference text;
  v_jours text := nullif(btrim(coalesce(p_jours, '')), '');
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_statut is not null and v_statut not in ('preparation', 'expedie', 'en_transit', 'livre') then
    raise exception 'filtre de commandes inconnu : %', v_statut using errcode = 'DL055';
  end if;

  -- DEUX FENÊTRES ET L'ABSENCE, rien d'autre : une durée libre ferait de ce
  -- paramètre un moyen de balayer la table par tranches que l'écran n'offre pas.
  if v_jours is not null and v_jours not in ('7', '30') then
    raise exception 'filtre de commandes inconnu : %', v_jours using errcode = 'DL055';
  end if;

  -- UNE RÉFÉRENCE COURTE SE RECONNAÎT À SA FORME : six chiffres hexadécimaux,
  -- dièse facultatif. Elle se compare en minuscules, parce que l'identifiant
  -- l'est dans sa forme texte.
  if v_recherche ~ '^#?[0-9A-Fa-f]{6}$' then
    v_reference := lower(ltrim(v_recherche, '#'));
  end if;

  perform public.journaliser_admin(
    'commandes.liste', 'orders', null, null, p_ip_hash,
    jsonb_build_object(
      'recherche', v_recherche,
      'statut', v_statut,
      'jours', v_jours::integer,
      'limite', v_limite,
      'page_suivante', v_date is not null
    )
  );

  return query
  select
    o.id,
    '#' || upper(right(replace(o.id::text, '-', ''), 6)),
    s.id,
    s.name,
    s.accent_color,
    p.id,
    p.email,
    o.status,
    colis.carrier_code,
    o.created_at
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  left join lateral (
    select tp.carrier_code
      from public.order_parcels op
      join public.tracked_parcels tp on tp.id = op.parcel_id
     where op.order_id = o.id
     order by tp.created_at desc, tp.id desc
     limit 1
  ) colis on true
  where o.first_content_at is not null
    and (v_statut is null or o.status = v_statut::public.order_status)
    and (v_jours is null or o.created_at >= now() - make_interval(days => v_jours::integer))
    and (
      v_recherche is null
      or (v_reference is not null and right(replace(o.id::text, '-', ''), 6) = v_reference)
      or extensions.unaccent(coalesce(s.name, '')) ilike '%' || extensions.unaccent(v_recherche) || '%'
      or extensions.unaccent(p.email) ilike '%' || extensions.unaccent(v_recherche) || '%'
    )
    and (v_date is null or (o.created_at, o.id) < (v_date, v_id))
  order by o.created_at desc, o.id desc
  limit v_limite;
end;
$$;

comment on function public.lister_commandes_admin(text, text, text, text, text, integer, text) is
  'Commandes de la plateforme pour l''admin, sans contenu (ni client, ni référence '
  'produit, ni note, ni jeton), filtrables par statut et par fenêtre. Écrit UNE '
  'entrée d''audit portant les critères.';

revoke all on function public.lister_commandes_admin(text, text, text, text, text, integer, text) from public;
grant execute on function public.lister_commandes_admin(text, text, text, text, text, integer, text) to authenticated;
