-- 041 — La volatilité décide si une fonction peut auditer.
--
-- DÉFAUT CONSTATÉ PAR EXÉCUTION, pas par relecture. Les fonctions de lecture
-- auditées étaient déclarées `stable`. PostgREST exécute une fonction `stable`
-- dans une transaction EN LECTURE SEULE — l'écriture de l'audit y échoue avec
-- « cannot execute INSERT in a read-only transaction », et comme l'audit et la
-- lecture sont la même transaction, l'appel entier échoue.
--
-- Le défaut ne se voyait ni à la compilation, ni à l'application de la migration,
-- ni dans le corps de la fonction : `stable` est une PROMESSE faite à
-- l'optimiseur, et rien dans le SQL ne la confronte à ce que la fonction fait
-- réellement. Seul un appel réel la met en défaut.
--
-- LA VOLATILITÉ DEVIENT ICI UNE GARDE, ET C'EST LE POINT INTÉRESSANT :
--
--   `lister_comptes_admin` et `lire_compte_admin` écrivent l'audit → VOLATILE.
--   `lire_journal_admin` n'écrit RIEN → reste STABLE, et le reste EXPRÈS.
--
-- « Lire le journal n'écrit pas dans le journal » cessait d'être une intention
-- commentée pour devenir une propriété que la base fait respecter : le jour où
-- quelqu'un ajouterait une écriture dans `lire_journal_admin`, Postgres la
-- refuserait à l'exécution. Une protection qui tient à ce que personne n'y pense
-- n'est pas une protection ; celle-ci ne tient à rien d'autre qu'au moteur.
--
-- La liste d'arguments ne change pas : `create or replace` remplace donc bien
-- les fonctions existantes, sans créer de seconde surcharge.

create or replace function public.lister_comptes_admin(
  p_recherche text,
  p_curseur_date text,
  p_curseur_id text,
  p_limite int,
  p_ip_hash text
)
  returns table (
    id uuid,
    email text,
    account_type public.account_type,
    role public.user_role,
    status public.account_status,
    created_at timestamptz,
    boutique_nom text,
    commandes bigint
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_recherche text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_date timestamptz := nullif(btrim(coalesce(p_curseur_date, '')), '')::timestamptz;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  perform public.journaliser_admin(
    'comptes.liste', 'profiles', null, null, p_ip_hash,
    jsonb_build_object(
      'recherche', v_recherche,
      'limite', v_limite,
      'page_suivante', v_date is not null
    )
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.created_at, s.name,
    (select count(*) from public.orders o where o.shop_id = s.id)
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  where
    (v_recherche is null or p.email ilike '%' || v_recherche || '%')
    and (v_date is null or (p.created_at, p.id) < (v_date, v_id))
  order by p.created_at desc, p.id desc
  limit v_limite;
end;
$$;

create or replace function public.lire_compte_admin(p_profil uuid, p_ip_hash text)
  returns table (
    id uuid,
    email text,
    account_type public.account_type,
    role public.user_role,
    status public.account_status,
    locale text,
    created_at timestamptz,
    boutique_id uuid,
    boutique_nom text,
    commandes bigint,
    colis bigint,
    vues bigint
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

  -- ON TRACE MÊME QUAND LE COMPTE N'EXISTE PAS. Ne tracer que les succès
  -- laisserait l'énumération d'identifiants totalement invisible.
  perform public.journaliser_admin(
    'comptes.detail', 'profiles', p_profil::text, p_profil, p_ip_hash, '{}'::jsonb
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.locale, p.created_at,
    s.id, s.name,
    (select count(*) from public.orders o where o.shop_id = s.id),
    (select count(*) from public.tracked_parcels tp where tp.shop_id = s.id),
    (select coalesce(sum(o.views_count), 0) from public.orders o where o.shop_id = s.id)
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  where p.id = p_profil;
end;
$$;

comment on function public.lire_journal_admin(text, text, int) is
  'Lecture du journal d''audit. DÉLIBÉRÉMENT `stable` : PostgREST l''exécute donc en
   transaction lecture seule, et toute écriture qu''on y ajouterait serait refusée par
   le moteur. « Lire le journal n''écrit pas dans le journal » n''est plus une intention
   mais une propriété que la base fait respecter.';
