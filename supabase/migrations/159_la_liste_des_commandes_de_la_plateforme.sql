/*
 * 159 — La liste des commandes de la plateforme, pour l'administration.
 *
 * DÉCISION DE WASSIM DU 14/09/2026 : l'écran « Commandes » du kit admin est créé.
 *
 * ⚠️ IL NE REND AUCUN CONTENU, ET C'EST LE CŒUR DE CETTE FONCTION. Le kit montre
 * le nom du client, son adresse électronique et un bouton « Ouvrir la page
 * client ». Rien de cela ne sort :
 *   - `customer_label` et `notify_email` appartiennent au CLIENT d'un vendeur,
 *     qui n'a jamais eu de compte chez nous et n'a rien accepté ;
 *   - `product_ref` et `internal_notes` appartiennent au vendeur — les notes
 *     portent le prix d'achat ;
 *   - `public_token` TRANSFÈRE UNE CAPACITÉ, définitivement : l'afficher, c'est
 *     permettre à quiconque lit l'écran d'ouvrir la page d'un client.
 * La supervision n'en a pas besoin. Ce qui permet de décider — quelle boutique,
 * quel statut, quel transporteur, quand — sort ; le reste appartient au vendeur
 * et à ses clients. C'est la doctrine de `lister_boutiques_admin`, étendue aux
 * commandes, et la décision 9 le dit déjà : la lecture tracée suffit au
 * diagnostic.
 *
 * ⚠️ L'IDENTIFIANT SORT, et ce n'est pas le jeton. Il sert au curseur ; la
 * référence courte en DÉRIVE, par la formule de `referenceCourte()` et de la
 * migration 153 — tirets retirés, six derniers caractères, majuscules.
 *
 * ELLE ÉCRIT UNE ENTRÉE D'AUDIT PAR PAGE, PORTANT SES CRITÈRES, dans la même
 * transaction que la lecture : une requête directe rendrait les mêmes lignes
 * sans laisser de trace, et rien n'échouerait.
 *
 * LES COMMANDES LISTÉES SONT CELLES QUI PORTENT DU CONTENU RÉEL
 * (`first_content_at`), comme partout ailleurs : un brouillon ouvert puis
 * abandonné n'est pas une commande de la plateforme.
 *
 * LE TRANSPORTEUR EST CELUI DU COLIS SUIVI LE PLUS RÉCENT, jamais
 * `orders.carrier_code` : ce dernier est la saisie texte du vendeur, le premier
 * est le code que le fournisseur de suivi a reconnu, et c'est lui que le
 * catalogue des transporteurs sait nommer. Une commande sans colis n'en a pas.
 *
 * UN FILTRE INCONNU EST REFUSÉ, jamais ignoré : ignoré, il rendrait la liste
 * ENTIÈRE, soit l'inverse d'un filtre.
 */

-- ⚠️ LE TRI DE CETTE LISTE N'A AUCUN INDEX SANS CELUI-CI. Tous les index de
-- `orders` commencent par `shop_id` — ils servent l'écran du vendeur, qui filtre
-- toujours sa boutique. Trier TOUTE la plateforme par date les ignorerait et
-- lirait la table entière pour en rendre 51 lignes : invisible à cent
-- commandes, ruineux à cent mille.
create index orders_plateforme_recentes_idx
  on public.orders (created_at desc, id desc)
  where first_content_at is not null;

create function public.lister_commandes_admin(
  p_recherche text,
  p_statut text,
  p_jours integer,
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
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_statut is not null and v_statut not in ('preparation', 'expedie', 'en_transit', 'livre') then
    raise exception 'filtre de commandes inconnu : %', v_statut using errcode = 'DL055';
  end if;

  -- DEUX FENÊTRES ET L'ABSENCE, rien d'autre : une durée libre ferait de ce
  -- paramètre un moyen de balayer la table par tranches que l'écran n'offre pas.
  if p_jours is not null and p_jours not in (7, 30) then
    raise exception 'filtre de commandes inconnu : %', p_jours using errcode = 'DL055';
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
      'jours', p_jours,
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
    and (p_jours is null or o.created_at >= now() - make_interval(days => p_jours))
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

comment on function public.lister_commandes_admin(text, text, integer, text, text, integer, text) is
  'Commandes de la plateforme pour l''admin, sans contenu (ni client, ni référence '
  'produit, ni note, ni jeton), filtrables par statut et par fenêtre. Écrit UNE '
  'entrée d''audit portant les critères.';

revoke all on function public.lister_commandes_admin(text, text, integer, text, text, integer, text) from public;
grant execute on function public.lister_commandes_admin(text, text, integer, text, text, integer, text) to authenticated;
