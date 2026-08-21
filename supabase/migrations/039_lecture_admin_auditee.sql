-- 039 — Lire les comptes, avec l'audit dans la même opération.
--
-- UNE CONSULTATION DE LISTE PRODUIT UNE SEULE ENTRÉE, portant ses critères.
--
-- Une entrée par ligne affichée noierait les consultations INDIVIDUELLES — celles
-- qui disent qu'un administrateur est allé regarder un compte précis, et qui sont
-- les seules réellement intéressantes en cas de litige. Cinquante lignes de
-- bruit pour une page de liste rendraient le journal illisible exactement au
-- moment où l'on en a besoin.
--
-- L'AUDIT ET LA LECTURE SONT LA MÊME TRANSACTION. La fonction écrit d'abord,
-- lit ensuite ; un échec de l'écriture annule la lecture, et l'appelant n'obtient
-- rien. On préfère refuser un accès légitime plutôt qu'accorder un accès non
-- tracé.
--
-- PAGINATION PAR CURSEUR sur `(created_at, id)`. L'admin verra un jour des
-- milliers de comptes, et un décalage ferait croître le coût avec le numéro de
-- page.

create function public.lister_comptes_admin(
  p_recherche text,
  p_curseur_date timestamptz,
  p_curseur_id uuid,
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
begin
  if not public.est_admin() then
    -- « Introuvable », jamais « interdit » : distinguer les deux apprendrait à
    -- un curieux que la surface existe.
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- L'AUDIT VIENT AVANT LA LECTURE, dans la même transaction. Écrit après, il
  -- serait sauté par toute sortie anticipée — et un `return` posé plus tard par
  -- quelqu'un d'autre laisserait la lecture sans trace, sans que rien n'échoue.
  perform public.journaliser_admin(
    'comptes.liste',
    'profiles',
    null,
    null,
    p_ip_hash,
    jsonb_build_object(
      -- LES CRITÈRES SONT TRACÉS, pas les résultats. Ce qui compte pour
      -- comprendre après coup, c'est ce que l'administrateur CHERCHAIT.
      'recherche', v_recherche,
      'limite', v_limite,
      'page_suivante', p_curseur_date is not null
    )
  );

  return query
  select
    p.id,
    p.email,
    p.account_type,
    p.role,
    p.status,
    p.created_at,
    s.name,
    (select count(*) from public.orders o where o.shop_id = s.id)
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  where
    (v_recherche is null or p.email ilike '%' || v_recherche || '%')
    and (
      p_curseur_date is null
      or (p.created_at, p.id) < (p_curseur_date, p_curseur_id)
    )
  order by p.created_at desc, p.id desc
  limit v_limite;
end;
$$;

comment on function public.lister_comptes_admin(text, timestamptz, uuid, int, text) is
  'Liste des comptes pour l''admin. Écrit UNE entrée d''audit portant les critères.';

revoke all on function public.lister_comptes_admin(text, timestamptz, uuid, int, text) from public;
grant execute on function public.lister_comptes_admin(text, timestamptz, uuid, int, text) to authenticated;

/*
 * LE DÉTAIL D'UN COMPTE — audité individuellement, avec sa cible.
 *
 * C'est l'entrée qui compte vraiment : elle dit qu'un administrateur est allé
 * regarder CE compte-là. La consultation de liste porte des critères, celle-ci
 * porte un nom.
 */
create function public.lire_compte_admin(p_profil uuid, p_ip_hash text)
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
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- ON TRACE MÊME QUAND LE COMPTE N'EXISTE PAS. Une recherche infructueuse est
  -- une consultation comme une autre : ne tracer que les succès laisserait
  -- l'énumération d'identifiants totalement invisible.
  perform public.journaliser_admin(
    'comptes.detail', 'profiles', p_profil::text, p_profil, p_ip_hash, '{}'::jsonb
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.locale, p.created_at,
    s.id, s.name,
    (select count(*) from public.orders o where o.shop_id = s.id),
    (select count(*) from public.tracked_parcels tp where tp.shop_id = s.id),
    -- Le compteur de vues est lu sur `orders`, où il est dénormalisé : agréger
    -- `link_views` ferait parcourir la table qui grossit le plus vite du produit
    -- à chaque consultation d'une fiche.
    (select coalesce(sum(o.views_count), 0) from public.orders o where o.shop_id = s.id)
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  where p.id = p_profil;
end;
$$;

comment on function public.lire_compte_admin(uuid, text) is
  'Détail d''un compte pour l''admin. Trace la consultation, y compris quand le compte est absent.';

revoke all on function public.lire_compte_admin(uuid, text) from public;
grant execute on function public.lire_compte_admin(uuid, text) to authenticated;

/*
 * LIRE LE JOURNAL — et LIRE LE JOURNAL N'ÉCRIT PAS DANS LE JOURNAL.
 *
 * Sans cette règle, ouvrir la page d'audit y ajouterait une ligne, laquelle
 * apparaîtrait à la consultation suivante, et ainsi de suite : le journal se
 * remplirait de sa propre consultation et noierait ce qu'il est censé conserver.
 */
create function public.lire_journal_admin(
  p_curseur_date timestamptz,
  p_curseur_id uuid,
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
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select
    a.id, a.admin_email, a.action, a.resource_type, a.resource_id,
    a.target_email, a.occurred_at,
    -- LE MOTIF EST EXTRAIT ET RENDU EN CLAIR. C'est la pièce qu'on demanderait
    -- en cas de litige, et la replier derrière un détail que personne n'ouvre
    -- reviendrait à ne pas l'avoir. Le RESTE de la charge utile n'est PAS
    -- étalé : un journal qui montre tout devient une surface de fuite de plus.
    a.payload ->> 'motif'
  from public.admin_audit_log a
  where p_curseur_date is null
     or (a.occurred_at, a.id) < (p_curseur_date, p_curseur_id)
  order by a.occurred_at desc, a.id desc
  limit v_limite;
end;
$$;

comment on function public.lire_journal_admin(timestamptz, uuid, int) is
  'Lecture du journal d''audit. N''écrit RIEN : lire le journal ne se journalise pas.';

revoke all on function public.lire_journal_admin(timestamptz, uuid, int) from public;
grant execute on function public.lire_journal_admin(timestamptz, uuid, int) to authenticated;
