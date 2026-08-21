-- 052 — L'écran de surveillance : ce que le produit MESURE réellement.
--
-- LA MAQUETTE EST ÉCARTÉE, ET C'EST LE POINT CENTRAL DE CETTE MIGRATION. Elle
-- affiche « System Uptime 99.98 % », « Active Websockets 18 245 », « Database
-- IOPS 12.4k », une courbe de charge en temps réel et un flux de latences d'API.
-- Le produit ne mesure aucune de ces grandeurs — il n'a même pas de websockets.
-- Les afficher reviendrait à inventer des chiffres sur l'écran EXACTEMENT où
-- l'on décide, ce qui est le pire endroit possible : un tableau de bord dont on
-- découvre qu'une valeur était fausse cesse de servir à quoi que ce soit, y
-- compris pour les valeurs qui étaient vraies.
--
-- CE QU'ON MESURE VRAIMENT, ET QUI SUFFIT À DÉCIDER :
--   - les interrogations du fournisseur de suivi — notre seul coût facturé par
--     un tiers, avec le stockage ;
--   - les abandons de suivi — ce qui cesse d'être facturé, donc l'autre moitié
--     du même chiffre ;
--   - la pression sur les limites de débit, PAR SURFACE : la page publique et
--     l'administration ne partagent jamais leurs compteurs, et une saturation
--     ne veut pas dire la même chose des deux côtés.
--
-- CE QU'ON NE MESURE PAS EST NOMMÉ PAR L'ÉCRAN, jamais omis. C'est l'inverse de
-- la règle de la page publique, et c'est voulu : là une information absente est
-- OMISE, ici elle est NOMMÉE. Un client consulte, un administrateur décide —
-- omettre la disponibilité lui ferait croire qu'elle est surveillée.
--
-- TOUT EST LU SUR DES COMPTEURS OU DES FENÊTRES BORNÉES. Aucun décompte ne porte
-- sur une table qui grossit avec l'usage : `usage_counters` a une ligne par
-- compte et par mois, `rate_limit` est purgée en continu par la fonction de
-- quota, et les abandons ont leur index partiel depuis la 051.

create function public.sante_infrastructure()
  returns table (
    genre      text,
    indicateur text,
    valeur     bigint
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
  -- LE COÛT DU MOIS, lu sur les compteurs : une ligne par compte actif, jamais
  -- un parcours des instantanés.
  select 'suivi'::text, 'interrogations_ce_mois'::text,
         coalesce(sum(u.tracking_api_calls), 0)::bigint
  from public.usage_counters u
  where u.period_month = date_trunc('month', now())::date

  union all

  select 'suivi'::text, 'colis_pris_en_charge_ce_mois'::text,
         coalesce(sum(u.parcels_registered), 0)::bigint
  from public.usage_counters u
  where u.period_month = date_trunc('month', now())::date

  union all

  -- Les abandons : rares par construction, et servis par un index PARTIEL dont
  -- la taille suit le nombre d'abandons et non celui des colis.
  select 'suivi'::text, 'abandons_ce_mois'::text, count(*)::bigint
  from public.tracked_parcels tp
  where tp.abandoned_at >= date_trunc('month', now())

  union all

  /*
   * LA PRESSION SUR LES LIMITES, PAR SURFACE.
   *
   * La clé de quota s'écrit `surface:identifiant` : le préfixe suffit donc à
   * séparer les surfaces, qui ne partagent JAMAIS leurs compteurs. Les
   * confondre effacerait la seule distinction qui compte ici — une saturation
   * de la page publique peut être un vendeur qui perce, une saturation de
   * l'authentification est une attaque.
   *
   * On rend le PLUS HAUT compteur atteint sur l'heure écoulée, pas une moyenne :
   * une moyenne dilue le pic dans les fenêtres calmes, or c'est le pic qui
   * décide.
   */
  select 'limitation'::text,
         'pic_' || split_part(r.cle, ':', 1),
         max(r.compte)::bigint
  from public.rate_limit r
  where r.fenetre_debut > now() - interval '1 hour'
    and position(':' in r.cle) > 0
  group by split_part(r.cle, ':', 1);
end;
$$;

comment on function public.sante_infrastructure() is
  'Indicateurs RÉELLEMENT mesurés. Ce qui ne l''est pas est nommé par l''écran, pas inventé ici.';

revoke all on function public.sante_infrastructure() from public;
grant execute on function public.sante_infrastructure() to authenticated;
