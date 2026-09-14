/*
 * 161 — Les statistiques de la plateforme, pour l'administration.
 *
 * DÉCISION DE WASSIM DU 14/09/2026 : l'écran « Statistiques » du kit admin est
 * créé. Il mesure l'USAGE de DropLink, jamais une vente.
 *
 * ⚠️ CES FONCTIONS NE RENDENT QUE DES NOMBRES ET DES DATES. Aucun pseudo, aucune
 * référence, aucune boutique, aucun compte : compter n'est pas consulter, donc
 * aucune donnée tierce n'est lue et aucun audit n'est écrit — le raisonnement de
 * `repartir_commandes_admin` (148) et de `compter_commandes_par_jour_admin`
 * (149). Le jour où l'une d'elles rendrait une ligne, elle devrait tracer.
 *
 * ⚠️ ELLES NE RÉUTILISENT PAS LES FONCTIONS DES ANALYSES VENDEUR (146), qui sont
 * `security invoker` : appelées par un administrateur, elles compteraient SES
 * commandes, c'est-à-dire zéro, sur un écran qui prétend décrire la plateforme.
 * Les DÉFINITIONS, elles, sont reprises à l'identique — une commande est née à
 * son premier contenu réel, un délai de livraison va du premier au dernier
 * mouvement d'un colis livré —, pour qu'un même mot ne mesure pas deux choses
 * selon l'écran.
 *
 * LA PÉRIODE PRÉCÉDENTE EST CALCULÉE, PAS INVENTÉE. Les autres écrans admin
 * refusent le badge « +12 % » parce que leurs compteurs mensuels n'ont pas
 * d'historique ; ici les tables brutes sont horodatées, et la fenêtre qui
 * précède se compte exactement comme la courante. Un écart n'est rendu que si
 * la période précédente a une valeur : diviser par zéro n'est pas une croissance.
 *
 * TROIS FENÊTRES ET RIEN D'AUTRE (7, 30, 90 jours) : une durée libre ferait de
 * ce paramètre un moyen de faire compter la plateforme entière à la demande.
 *
 * LES JOURS SONT DES JOURS UTC, comme la courbe de la vue d'ensemble : deux
 * découpages différents du même jour sur deux écrans voisins feraient compter
 * deux fois la même commande de minuit.
 */

create function public.statistiques_admin(p_jours integer)
  returns table (
    commandes bigint,
    commandes_avant bigint,
    liens_consultes bigint,
    liens_consultes_avant bigint,
    photos bigint,
    photos_avant bigint,
    comptes_actifs bigint,
    comptes_actifs_avant bigint,
    comptes bigint,
    fournisseurs bigint,
    revendeurs bigint,
    nouveaux_comptes bigint,
    nouveaux_comptes_avant bigint,
    colis bigint,
    colis_avant bigint,
    delai_jours numeric,
    delai_jours_avant numeric,
    delai_colis bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_debut timestamptz;
  v_avant timestamptz;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;
  if p_jours is null or p_jours not in (7, 30, 90) then
    raise exception 'fenêtre de statistiques inconnue : %', p_jours using errcode = 'DL056';
  end if;

  v_debut := now() - make_interval(days => p_jours);
  v_avant := now() - make_interval(days => 2 * p_jours);

  return query
  with c as (
    select o.first_content_at as nee, o.views_count, s.owner_id
      from public.orders o
      join public.shops s on s.id = o.shop_id
     where o.first_content_at >= v_avant
  ),
  livres as (
    select tp.created_at,
           extract(epoch from (tp.last_movement_at - tp.first_movement_at)) / 86400 as jours
      from public.tracked_parcels tp
     where tp.created_at >= v_avant
       and tp.normalized_status = 'livre'
       and tp.first_movement_at is not null
       and tp.last_movement_at is not null
  )
  select
    (select count(*) from c where c.nee >= v_debut),
    (select count(*) from c where c.nee < v_debut),
    (select count(*) from c where c.nee >= v_debut and c.views_count > 0),
    (select count(*) from c where c.nee < v_debut and c.views_count > 0),
    (select count(*) from public.order_media m where m.type = 'photo' and m.created_at >= v_debut),
    (select count(*) from public.order_media m
      where m.type = 'photo' and m.created_at >= v_avant and m.created_at < v_debut),
    (select count(distinct c.owner_id) from c where c.nee >= v_debut),
    (select count(distinct c.owner_id) from c where c.nee < v_debut),
    (select count(*) from public.profiles),
    -- LA SEGMENTATION D'USAGE DU BRIEF, à la place de la répartition par plan du
    -- kit : `account_type` est nullable SANS défaut, donc le reste (comptes moins
    -- fournisseurs moins revendeurs) est l'onboarding non terminé — nommé, pas
    -- rangé d'office dans un camp.
    (select count(*) from public.profiles p where p.account_type = 'supplier'),
    (select count(*) from public.profiles p where p.account_type = 'reseller'),
    (select count(*) from public.profiles p where p.created_at >= v_debut),
    (select count(*) from public.profiles p where p.created_at >= v_avant and p.created_at < v_debut),
    -- « PRIS EN CHARGE », C'EST `registered_at` : l'instant où le fournisseur de
    -- suivi a accepté le numéro, donc celui qu'il facture. Un colis créé mais
    -- jamais enregistré n'a rien coûté.
    (select count(*) from public.tracked_parcels tp where tp.registered_at >= v_debut),
    (select count(*) from public.tracked_parcels tp
      where tp.registered_at >= v_avant and tp.registered_at < v_debut),
    (select round(avg(l.jours)::numeric, 1) from livres l where l.created_at >= v_debut),
    (select round(avg(l.jours)::numeric, 1) from livres l where l.created_at < v_debut),
    (select count(*) from livres l where l.created_at >= v_debut);
end;
$$;

comment on function public.statistiques_admin(integer) is
  'Indicateurs d''usage de la plateforme sur 7, 30 ou 90 jours, et leur valeur sur la période précédente. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';

revoke all on function public.statistiques_admin(integer) from public;
grant execute on function public.statistiques_admin(integer) to authenticated;

/*
 * LES SÉRIES JOUR PAR JOUR — JOURS VIDES COMPRIS, c'est la base qui pose la
 * grille. Une courbe qui saute les jours sans commande rend ses points
 * équidistants alors que le temps ne l'est pas.
 *
 * `taux_consultes` et `delai_jours` sont `null` un jour sans commande ou sans
 * colis livré : zéro affirmerait qu'on a mesuré « aucun lien ouvert » ou « livré
 * en zéro jour ».
 *
 * ⚠️ LE DÉLAI D'UN JOUR EST CELUI DES COLIS LIVRÉS CE JOUR-LÀ (dernier
 * mouvement), pas créés ce jour-là : la courbe doit dire quand la livraison a
 * eu lieu, sinon ses derniers jours seraient toujours vides — un colis créé hier
 * n'est pas encore livré.
 */
create function public.statistiques_admin_par_jour(p_jours integer)
  returns table (
    jour date,
    commandes bigint,
    nouveaux_comptes bigint,
    comptes_actifs bigint,
    vues bigint,
    taux_consultes numeric,
    delai_jours numeric
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_fin date := (now() at time zone 'UTC')::date;
  v_debut date;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;
  if p_jours is null or p_jours not in (7, 30, 90) then
    raise exception 'fenêtre de statistiques inconnue : %', p_jours using errcode = 'DL056';
  end if;
  v_debut := v_fin - (p_jours - 1);

  return query
  with grille as (
    select g::date as jour from generate_series(v_debut, v_fin, interval '1 day') g
  ),
  c as (
    select (o.first_content_at at time zone 'UTC')::date as jour, o.views_count, s.owner_id
      from public.orders o
      join public.shops s on s.id = o.shop_id
     where o.first_content_at >= v_debut::timestamp at time zone 'UTC'
  ),
  par_commandes as (
    select c.jour,
           count(*) as n,
           count(distinct c.owner_id) as actifs,
           count(*) filter (where c.views_count > 0) as consultees
      from c group by c.jour
  ),
  par_comptes as (
    select (p.created_at at time zone 'UTC')::date as jour, count(*) as n
      from public.profiles p
     where p.created_at >= v_debut::timestamp at time zone 'UTC'
     group by 1
  ),
  par_vues as (
    select v.viewed_on as jour, count(*) as n
      from public.link_views v
     where v.viewed_on >= v_debut
     group by 1
  ),
  par_livraisons as (
    select (tp.last_movement_at at time zone 'UTC')::date as jour,
           round(avg(extract(epoch from (tp.last_movement_at - tp.first_movement_at)) / 86400)::numeric, 1) as jours
      from public.tracked_parcels tp
     where tp.normalized_status = 'livre'
       and tp.first_movement_at is not null
       and tp.last_movement_at >= v_debut::timestamp at time zone 'UTC'
     group by 1
  )
  select
    g.jour,
    coalesce(pc.n, 0),
    coalesce(pa.n, 0),
    coalesce(pc.actifs, 0),
    coalesce(pv.n, 0),
    case when coalesce(pc.n, 0) = 0 then null
         else round(100.0 * pc.consultees / pc.n, 0) end,
    pl.jours
  from grille g
  left join par_commandes pc on pc.jour = g.jour
  left join par_comptes pa on pa.jour = g.jour
  left join par_vues pv on pv.jour = g.jour
  left join par_livraisons pl on pl.jour = g.jour
  order by g.jour;
end;
$$;

comment on function public.statistiques_admin_par_jour(integer) is
  'Séries jour par jour de l''écran Statistiques, JOURS VIDES COMPRIS. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';

revoke all on function public.statistiques_admin_par_jour(integer) from public;
grant execute on function public.statistiques_admin_par_jour(integer) to authenticated;

/*
 * LES TRANSPORTEURS DE LA PLATEFORME : le CODE, jamais le nom — le nom se
 * résout dans le dépôt, depuis le catalogue officiel. Même définition que
 * `repartir_transporteurs` (146) : les colis créés sur la fenêtre.
 */
create function public.transporteurs_admin(p_jours integer)
  returns table (
    carrier_code integer,
    nombre bigint
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
  if p_jours is null or p_jours not in (7, 30, 90) then
    raise exception 'fenêtre de statistiques inconnue : %', p_jours using errcode = 'DL056';
  end if;

  return query
  select tp.carrier_code, count(*)
    from public.tracked_parcels tp
   where tp.created_at >= now() - make_interval(days => p_jours)
   group by tp.carrier_code
   order by count(*) desc, tp.carrier_code;
end;
$$;

comment on function public.transporteurs_admin(integer) is
  'Colis de la plateforme par code transporteur sur 7, 30 ou 90 jours. Garde interne : est_admin(). Le nom se résout dans le dépôt, jamais en base.';

revoke all on function public.transporteurs_admin(integer) from public;
grant execute on function public.transporteurs_admin(integer) to authenticated;

/*
 * LA CROISSANCE, MOIS PAR MOIS — les neuf derniers mois calendaires, le mois en
 * cours compris, MOIS VIDES COMPRIS. Nouveaux comptes, commandes nées, colis
 * pris en charge et photos déposées : quatre volumes qui existent. Le kit y
 * pose aussi les abonnements, que la contrainte n°1 interdit.
 */
create function public.croissance_admin()
  returns table (
    mois date,
    comptes bigint,
    commandes bigint,
    colis bigint,
    photos bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_fin date := date_trunc('month', now() at time zone 'UTC')::date;
  v_debut date := (date_trunc('month', now() at time zone 'UTC') - interval '8 months')::date;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  with grille as (
    select g::date as mois from generate_series(v_debut, v_fin, interval '1 month') g
  ),
  borne as (select v_debut::timestamp at time zone 'UTC' as t)
  select
    g.mois,
    (select count(*) from public.profiles p, borne
      where p.created_at >= borne.t
        and date_trunc('month', p.created_at at time zone 'UTC')::date = g.mois),
    (select count(*) from public.orders o, borne
      where o.first_content_at >= borne.t
        and date_trunc('month', o.first_content_at at time zone 'UTC')::date = g.mois),
    (select count(*) from public.tracked_parcels tp, borne
      where tp.registered_at >= borne.t
        and date_trunc('month', tp.registered_at at time zone 'UTC')::date = g.mois),
    (select count(*) from public.order_media m, borne
      where m.type = 'photo' and m.created_at >= borne.t
        and date_trunc('month', m.created_at at time zone 'UTC')::date = g.mois)
  from grille g
  order by g.mois;
end;
$$;

comment on function public.croissance_admin() is
  'Volumes mensuels de la plateforme sur neuf mois, MOIS VIDES COMPRIS. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';

revoke all on function public.croissance_admin() from public;
grant execute on function public.croissance_admin() to authenticated;
