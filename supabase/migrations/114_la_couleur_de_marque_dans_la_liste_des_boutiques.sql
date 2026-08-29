-- 114 — La couleur de marque, dans la liste des boutiques.
--
-- SÉPARÉE DE LA 113 PARCE QUE LA 113 EST APPLIQUÉE. Une migration n'est jamais
-- rouverte : la modifier ferait diverger les environnements en silence, puisque
-- la base ne rejoue pas un fichier déjà enregistré. Les correctifs sont de
-- NOUVELLES migrations, même quand ils tiennent en une colonne.
--
-- POURQUOI CETTE COLONNE. La planche pose un carré de couleur en tête de chaque
-- carte, et ce n'est pas décoratif : c'est ce qui rend une grille de 50 cartes
-- parcourable à l'œil. La fiche d'un compte l'affiche déjà — la même boutique
-- prendrait deux apparences selon l'écran, ce qui est exactement le défaut que
-- les migrations 111 et 112 viennent de corriger sur les nombres.
--
-- `shops.accent_color` EST NON NULLE AVEC DÉFAUT : il n'existe aucun état
-- « couleur non configurée » à détecter. C'est le NOM de la boutique qui dit si
-- elle a été configurée, jamais la couleur — et c'est pour cela que la carte
-- laisse le carré neutre quand le nom manque, plutôt que de peindre un défaut
-- que personne n'a choisi.
--
-- `drop` OBLIGATOIRE : le type de retour change.

drop function if exists public.lister_boutiques_admin(text, text, text, text, int, text);

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
    accent_color text,
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
  v_type text := nullif(btrim(coalesce(p_type, '')), '');
  v_octets bigint := nullif(btrim(coalesce(p_curseur_octets, '')), '')::bigint;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- UNE VALEUR INCONNUE EST REFUSÉE, jamais ignorée : ignorée, elle rendrait la
  -- liste ENTIÈRE, soit l'inverse de ce qu'on attend d'un filtre.
  if v_type is not null and v_type not in ('supplier', 'reseller', 'sans') then
    raise exception 'type de compte inconnu : %', v_type using errcode = 'DL049';
  end if;

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
    s.accent_color,
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
