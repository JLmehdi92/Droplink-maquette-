-- 050 — La liste des boutiques pour l'administration, triée par ce qu'elles coûtent.
--
-- CET ÉCRAN N'EST PAS UNE SECONDE LISTE DE COMPTES. La liste des comptes répond
-- à « qui est inscrit » et se trie par date d'inscription. Celle-ci répond à
-- « qu'est-ce que ça nous coûte » et se trie par octets occupés. Deux questions,
-- deux tris — un écran qui répondrait aux deux obligerait à chercher dans l'un
-- ce qu'on vient chercher dans l'autre.
--
-- LE TRI PAR DÉFAUT PORTE SON INDEX. C'est l'oubli le plus facile, et il est
-- invisible à faible volumétrie : sans index, le tri lit TOUTES les boutiques
-- pour en rendre cinquante, et le coût suit le nombre de comptes — c'est-à-dire
-- qu'il n'apparaît qu'une fois le produit adopté.
--
-- ELLE LIT LES COMPTEURS, JAMAIS LES TABLES QU'ILS RÉSUMENT. Un agrégat sur
-- `orders` ou `order_media` ferait suivre le coût de l'écran à l'activité totale
-- du produit.

create index shops_stockage_idx
  on public.shops (stockage_octets desc, id desc);

/*
 * LA LECTURE, AUDITÉE.
 *
 * UN HUMAIN Y LIT LES DONNÉES D'UN TIERS : la lecture est donc tracée, comme
 * celle des comptes. UNE SEULE entrée pour la page entière, portant ses
 * critères — une entrée par ligne affichée noierait les consultations
 * individuelles, qui sont ce qu'on relit en cas de litige.
 *
 * `volatile` : elle ÉCRIT dans le journal. Déclarée `stable`, PostgREST
 * l'exécuterait en transaction lecture seule et l'audit échouerait — le moteur
 * fait respecter la distinction, aucune relecture n'a à s'en charger.
 *
 * ELLE NE REND AUCUN CONTENU. Ni nom de client, ni référence produit, ni note
 * interne, ni jeton public. Des VOLUMES suffisent à décider ; le contenu
 * appartient au vendeur et à ses clients. Et le `public_token` transfère une
 * CAPACITÉ, définitivement : il n'a rien à faire dans une liste d'administration.
 */
create function public.lister_boutiques_admin(
  p_recherche text,
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
  -- CONVENTION DU DÉPÔT : LA CHAÎNE VIDE VAUT ABSENCE. Une signature de fonction
  -- ne dit rien de la nullité de ses arguments, et le générateur de types les
  -- décrit tous comme non nuls — les curseurs passent donc en `text`.
  v_octets bigint := nullif(btrim(coalesce(p_curseur_octets, '')), '')::bigint;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- L'AUDIT VIENT AVANT LA LECTURE, dans la même transaction. Écrit après, il
  -- serait sauté par toute sortie anticipée qu'on ajouterait plus tard.
  perform public.journaliser_admin(
    'boutiques.liste', 'shops', null, null, p_ip_hash,
    jsonb_build_object(
      'recherche', v_recherche,
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
    -- Le compteur du mois, pris là où il est TENU. Zéro quand le compte n'a rien
    -- pris en charge ce mois-ci : ici la ligne absente signifie bien « aucun
    -- colis », et non « pas mesuré » — le compteur existe depuis la 046.
    coalesce(u.parcels_registered, 0),
    s.created_at
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  left join public.usage_counters u
    on u.profile_id = p.id
   and u.period_month = date_trunc('month', now())::date
  where
    -- RECHERCHE INSENSIBLE AUX ACCENTS sur le nom de boutique : « creme » doit
    -- trouver « Crème ». L'email, lui, n'en porte pas — mais le replier aussi
    -- évite d'avoir deux comportements dans un même champ de saisie.
    (
      v_recherche is null
      or extensions.unaccent(coalesce(s.name, '')) ilike '%' || extensions.unaccent(v_recherche) || '%'
      or extensions.unaccent(p.email) ilike '%' || extensions.unaccent(v_recherche) || '%'
    )
    -- PAGINATION PAR CURSEUR, jamais par décalage : à la page 40, un `offset`
    -- lit 2 000 lignes pour en rendre 50, donc l'inconfort arrive chez celui qui
    -- a le plus de données. La comparaison de COUPLE est ce qui rend l'ordre
    -- total : sur le seul stockage, deux boutiques de même poids se
    -- chevaucheraient d'une page à l'autre.
    and (v_octets is null or (s.stockage_octets, s.id) < (v_octets, v_id))
  order by s.stockage_octets desc, s.id desc
  limit v_limite;
end;
$$;

comment on function public.lister_boutiques_admin(text, text, text, int, text) is
  'Liste des boutiques pour l''admin, triée par stockage. Écrit UNE entrée d''audit portant les critères.';

revoke all on function public.lister_boutiques_admin(text, text, text, int, text) from public;
grant execute on function public.lister_boutiques_admin(text, text, text, int, text) to authenticated;

/*
 * LE TOTAL, POUR LE PANNEAU.
 *
 * Il somme les compteurs des boutiques, pas les médias : le coût suit alors le
 * nombre de COMPTES et non le nombre de fichiers. C'est ce qui rend le stockage
 * MESURABLE — jusqu'ici le panneau écrivait « indisponible », faute d'un
 * mécanisme qui le relève.
 *
 * `stable` : elle n'écrit rien, et elle n'a rien à auditer — un total agrégé ne
 * désigne les données de personne.
 */
create function public.stockage_total_admin()
  returns bigint
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_total bigint;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  select coalesce(sum(s.stockage_octets), 0) into v_total from public.shops s;
  return v_total;
end;
$$;

revoke all on function public.stockage_total_admin() from public;
grant execute on function public.stockage_total_admin() to authenticated;
