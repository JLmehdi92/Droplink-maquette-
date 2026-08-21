-- 040 — Les arguments omissibles des fonctions d'administration.
--
-- UNE SIGNATURE POSTGRES NE DIT RIEN DE LA NULLITÉ de ses arguments : tout
-- paramètre accepte `null`, et le générateur de types les décrit donc TOUS comme
-- non nuls. Le contrat vu depuis TypeScript et le contrat réel divergent — pas
-- au point de casser à l'exécution, seulement au point de refuser de compiler,
-- ce qui est le meilleur cas possible.
--
-- CONVENTION DU DÉPÔT, déjà appliquée aux migrations 020 et 031 : LA CHAÎNE VIDE
-- VAUT ABSENCE, et `nullif` la retraduit en `null` dans le corps. Les curseurs
-- passent donc en `text` — un `uuid` ne peut pas porter de chaîne vide, et c'est
-- justement ce qui obligeait à les déclarer nullables.
--
-- DROP EXPLICITE, ET IL EST OBLIGATOIRE. `create or replace function` NE
-- REMPLACE PAS une fonction dont la LISTE D'ARGUMENTS change : Postgres en crée
-- une SECONDE. Les deux surcharges coexistent, un appel résout l'ANCIENNE sans
-- lever la moindre erreur, et l'on croirait avoir corrigé quelque chose qui
-- continue de se comporter comme avant.

drop function if exists public.lister_comptes_admin(text, timestamptz, uuid, int, text);
drop function if exists public.lire_journal_admin(timestamptz, uuid, int);

create function public.lister_comptes_admin(
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
  stable
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

  -- L'AUDIT VIENT AVANT LA LECTURE, dans la même transaction. Écrit après, il
  -- serait sauté par toute sortie anticipée qu'on ajouterait plus tard.
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

comment on function public.lister_comptes_admin(text, text, text, int, text) is
  'Liste des comptes pour l''admin. Écrit UNE entrée d''audit portant les critères.';

revoke all on function public.lister_comptes_admin(text, text, text, int, text) from public;
grant execute on function public.lister_comptes_admin(text, text, text, int, text) to authenticated;

create function public.lire_journal_admin(
  p_curseur_date text,
  p_curseur_id text,
  p_limite int
)
  returns table (
    id uuid,
    admin_email text,
    action text,
    resource_type text,
    resource_id text,
    target_email text,
    occurred_at timestamptz,
    motif text
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_date timestamptz := nullif(btrim(coalesce(p_curseur_date, '')), '')::timestamptz;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- AUCUNE ÉCRITURE ICI. Lire le journal ne se journalise pas : sans cette
  -- règle, ouvrir la page d'audit y ajouterait une ligne, laquelle apparaîtrait
  -- à la consultation suivante, et le journal se remplirait de sa propre
  -- consultation en noyant ce qu'il est censé conserver.
  return query
  select
    a.id, a.admin_email, a.action, a.resource_type, a.resource_id,
    a.target_email, a.occurred_at,
    -- Le motif en clair, le reste de la charge utile non : c'est la pièce qu'on
    -- demanderait en cas de litige, et un journal qui montre TOUT devient une
    -- surface de fuite de plus.
    a.payload ->> 'motif'
  from public.admin_audit_log a
  where v_date is null or (a.occurred_at, a.id) < (v_date, v_id)
  order by a.occurred_at desc, a.id desc
  limit v_limite;
end;
$$;

comment on function public.lire_journal_admin(text, text, int) is
  'Lecture du journal d''audit. N''écrit RIEN : lire le journal ne se journalise pas.';

revoke all on function public.lire_journal_admin(text, text, int) from public;
grant execute on function public.lire_journal_admin(text, text, int) to authenticated;
