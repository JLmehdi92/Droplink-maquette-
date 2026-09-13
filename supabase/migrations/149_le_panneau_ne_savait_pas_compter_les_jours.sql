/*
 * LE PANNEAU NE SAVAIT PAS COMPTER LES JOURS.
 *
 * POURQUOI. Le kit pose sur la vue d'ensemble un panneau « Commandes » portant
 * la COURBE des commandes créées jour par jour. Il n'entrait dans aucun des
 * trois motifs de déclaration : la contrainte n°1 ne le touche pas, la route
 * existe, et la base porte parfaitement la donnée — `orders.first_content_at`
 * date chaque commande réellement née. Refuser de l'afficher aurait été une
 * préférence déguisée en impossibilité.
 *
 * ⚠️ ELLE NE RÉUTILISE PAS `compter_ouvertures_par_jour` NI SA FORME `security
 * invoker`. Celle-là compte sous la RLS de l'appelant, ce qui est juste pour le
 * vendeur et faux ici : appelée par un administrateur, elle rendrait SES
 * commandes — c'est-à-dire zéro — sur une courbe qui prétend décrire la
 * plateforme. Un graphe plat et parfaitement crédible.
 *
 * ELLE NE REND QUE DES NOMBRES ET DES DATES, jamais une ligne : aucun pseudo,
 * aucune référence, aucune boutique. Compter n'est pas consulter, donc aucune
 * donnée tierce n'est lue et aucun audit n'est écrit — même raisonnement que
 * `repartir_commandes_admin` (migration 148), et même conséquence : le panneau
 * d'accueil ne peut pas noyer le journal de sa propre ouverture.
 *
 * ⚠️ LES JOURS VIDES SONT RENDUS, et c'est la raison d'être du `generate_series`.
 * Une courbe qui saute les jours sans commande rend ses points équidistants
 * alors que le temps ne l'est pas : une semaine morte s'y lit comme une semaine
 * pleine. C'est la base qui pose la grille, pas l'écran — l'écran ne sait pas
 * quels jours manquent.
 */

create function public.compter_commandes_par_jour_admin(
  p_depuis date,
  p_jusqu_a date
)
  returns table (
    jour date,
    total bigint
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

  return query
  select
    g.jour::date,
    count(o.id)
  from generate_series(p_depuis, p_jusqu_a, interval '1 day') as g(jour)
  -- LE MÊME « COMMANDE CRÉÉE » QUE PARTOUT AILLEURS : le premier contenu réel,
  -- jamais l'ouverture de l'éditeur. Dater sur `created_at` ferait monter la
  -- courbe de brouillons que personne n'a jamais envoyés — et c'est exactement
  -- la métrique de verdict que la décision 20 protège.
  left join public.orders o
    on o.first_content_at is not null
   and (o.first_content_at at time zone 'UTC')::date = g.jour::date
  group by g.jour
  order by g.jour;
end;
$$;

comment on function public.compter_commandes_par_jour_admin(date, date) is
  'Commandes créées par jour sur toute la plateforme, JOURS VIDES COMPRIS. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';

revoke all on function public.compter_commandes_par_jour_admin(date, date) from public;
grant execute on function public.compter_commandes_par_jour_admin(date, date) to authenticated;
