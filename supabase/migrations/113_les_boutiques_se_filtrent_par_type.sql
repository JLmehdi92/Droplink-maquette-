-- 113 — Le filtre par type de compte, sur la liste des boutiques.
--
-- LA PLANCHE POSE QUATRE PILULES : toutes, fournisseurs, revendeurs, non
-- configurées. Ce ne sont pas des vues de confort : la segmentation
-- fournisseur / revendeur EST le livrable de la phase de validation, et « non
-- déclaré » est le troisième état que `account_type` porte SANS DÉFAUT
-- précisément pour que le manque soit visible.
--
-- ⚠️ LE FILTRE VA EN BASE, PAS DANS LA PAGE. La pagination est par CURSEUR :
-- filtrer après lecture rendrait des pages de taille variable, parfois vides,
-- avec un « charger la suite » qui semblerait ne rien faire. C'est le genre de
-- défaut qui ne se voit qu'au-delà de la première page, donc jamais en
-- développement.
--
-- ⚠️ `drop` OBLIGATOIRE, ET POUR LA RAISON DANGEREUSE CETTE FOIS. La LISTE
-- D'ARGUMENTS change : `create or replace` n'aurait rien remplacé du tout, il
-- aurait créé une SECONDE surcharge à cinq arguments. Les deux auraient coexisté,
-- PostgREST aurait résolu l'ancienne sur un appel à cinq arguments, et le filtre
-- n'aurait simplement jamais existé — sans la moindre erreur.

drop function if exists public.lister_boutiques_admin(text, text, text, int, text);

create function public.lister_boutiques_admin(
  p_recherche text,
  p_type text,
  p_curseur_octets text,
  p_curseur_id text,
  p_limite int,
  p_ip_hash text
)
  returns table (
    id uuid,
    nom text,
    proprietaire_id uuid,
    email text,
    account_type public.account_type,
    status public.account_status,
    commandes_reelles integer,
    medias_count integer,
    stockage_octets bigint,
    colis_ce_mois integer,
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
  -- CONVENTION DU DÉPÔT : LA CHAÎNE VIDE VAUT ABSENCE.
  v_type text := nullif(btrim(coalesce(p_type, '')), '');
  v_octets bigint := nullif(btrim(coalesce(p_curseur_octets, '')), '')::bigint;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- UNE VALEUR INCONNUE EST REFUSÉE, jamais ignorée. Ignorée, elle rendrait la
  -- liste ENTIÈRE : un filtre mal orthographié dans une URL montrerait plus de
  -- comptes que demandé, ce qui est exactement l'inverse de ce qu'on attend d'un
  -- filtre. Le refus est un `raise`, donc l'écran tombe et se corrige.
  if v_type is not null and v_type not in ('supplier', 'reseller', 'sans') then
    raise exception 'type de compte inconnu : %', v_type using errcode = 'DL049';
  end if;

  -- L'AUDIT VIENT AVANT LA LECTURE, dans la même transaction, et il porte le
  -- FILTRE : une consultation restreinte aux fournisseurs n'est pas la même
  -- consultation qu'une liste complète, et le journal doit pouvoir le dire.
  perform public.journaliser_admin(
    'boutiques.liste', 'shops', null, null, p_ip_hash,
    jsonb_build_object(
      'recherche', v_recherche,
      'type', v_type,
      'limite', v_limite,
      'page_suivante', v_octets is not null
    )
  );

  return query
  select
    s.id,
    s.name,
    p.id,
    p.email,
    p.account_type,
    p.status,
    s.commandes_reelles,
    s.medias_count,
    s.stockage_octets,
    coalesce(u.parcels_registered, 0),
    s.created_at
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  left join public.usage_counters u
    on u.profile_id = p.id
   and u.period_month = date_trunc('month', now())::date
  where
    (
      v_recherche is null
      or extensions.unaccent(coalesce(s.name, '')) ilike '%' || extensions.unaccent(v_recherche) || '%'
      or extensions.unaccent(p.email) ilike '%' || extensions.unaccent(v_recherche) || '%'
    )
    -- « sans » VISE LA NULLITÉ, pas une valeur d'énumération. `account_type` est
    -- nullable SANS DÉFAUT pour que l'onboarding non terminé se voie ; le filtre
    -- doit donc savoir désigner cette absence, sinon elle reste invisible.
    and (
      v_type is null
      or (v_type = 'sans' and p.account_type is null)
      or (v_type <> 'sans' and p.account_type = v_type::public.account_type)
    )
    and (v_octets is null or (s.stockage_octets, s.id) < (v_octets, v_id))
  order by s.stockage_octets desc, s.id desc
  limit v_limite;
end;
$$;

comment on function public.lister_boutiques_admin(text, text, text, text, int, text) is
  'Liste des boutiques pour l''admin, triée par stockage, filtrable par type de '
  'compte. Écrit UNE entrée d''audit portant les critères, filtre compris.';

revoke all on function public.lister_boutiques_admin(text, text, text, text, int, text) from public;
grant execute on function public.lister_boutiques_admin(text, text, text, text, int, text) to authenticated;
