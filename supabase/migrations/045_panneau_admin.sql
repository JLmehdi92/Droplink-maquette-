-- 045 — Le panneau d'administration : ce qu'on regarde pour décider.
--
-- CE PANNEAU EST LE SEUL ENDROIT DU PRODUIT OÙ LE COÛT CROÎT AVEC LE NOMBRE
-- TOTAL DE COMPTES. Partout ailleurs, la RLS borne chaque requête à une
-- boutique ; ici, on agrège volontairement l'ensemble. À mille vendeurs actifs,
-- `orders` porte plusieurs millions de lignes, et un `count(*)` global sur cette
-- table coûterait plus cher chaque mois — c'est-à-dire qu'il deviendrait lent
-- exactement au moment où le produit marche.
--
-- CE QU'ON COMPTE, ET POURQUOI SEULEMENT CELA :
--
--   Les COMPTES        → bornés par le nombre d'inscrits, quelques milliers.
--                        Comptage exact, sans risque.
--   Les PRISES EN CHARGE DU MOIS → le SEUL compteur qui corresponde à une
--                        FACTURE. Il doit être exact, et il est borné par le
--                        mois : son coût ne croît pas avec l'âge du produit.
--   Les COMPTES QUI DÉPASSENT UN SEUIL → ce sur quoi on AGIT.
--
-- Ce qu'on ne compte PAS : le total des commandes, le total des consultations,
-- le total des médias. Ils feraient un joli chiffre et coûteraient un balayage
-- complet à chaque ouverture de l'écran, pour une information sur laquelle
-- personne n'agit jamais.
--
-- L'INDEX qui rend le compteur facturable possible. Sans lui, compter les
-- prises en charge du mois lit TOUS les colis jamais créés.

create index tracked_parcels_facturation_idx
  on public.tracked_parcels (registered_at)
  where registered_at is not null;

/*
 * LES ALERTES, ET ELLES VIENNENT AVANT LES COMPTEURS.
 *
 * Un panneau qui enterre ses alertes sous des chiffres oblige à CHERCHER ce qui
 * devrait sauter aux yeux. L'ordre de rendu est donc porté ici, dans la donnée,
 * plutôt que laissé au gabarit : un écran futur qui les réordonnerait devrait le
 * faire exprès.
 *
 * CHAQUE SIGNALEMENT PORTE SA VALEUR. « 1 840 colis pour un seuil de 1 200 »,
 * jamais « ce compte dépasse ». Un chiffre se vérifie et se compare ; une
 * appréciation se discute, et on finit par ne plus la lire.
 *
 * `never_ran` N'EST PAS UNE ALERTE. Une tâche posée ce matin n'a pas encore eu
 * son premier passage : la signaler ferait chercher une panne inexistante, et
 * une alerte qui se trompe est une alerte qu'on apprend à ignorer. Les trois
 * états du veilleur sont donc distincts — jamais déployé, en retard, actif — et
 * seul le deuxième alerte.
 */
create function public.alertes_admin(p_seuil_colis int, p_retard_minutes int)
  returns table (
    genre text,
    gravite text,
    sujet text,
    valeur bigint,
    seuil bigint
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
  -- 1. Les comptes qui dépassent le seuil de prises en charge sur le mois.
  --    C'est le seul poste qui nous COÛTE de l'argent, donc le seul dépassement
  --    sur lequel il faut agir vite.
  select
    'colis_au_dessus_du_seuil'::text,
    'attention'::text,
    p.email,
    count(tp.id),
    p_seuil_colis::bigint
  from public.tracked_parcels tp
  join public.shops s on s.id = tp.shop_id
  join public.profiles p on p.id = s.owner_id
  where tp.registered_at >= date_trunc('month', now())
  group by p.email
  having count(tp.id) > p_seuil_colis

  union all

  -- 2. Le veilleur. TROIS ÉTATS, et seul « en retard » alerte.
  --    L'ABSENCE DE LIGNE est une information à part entière : « jamais
  --    déployé » n'est pas « en panne ». Sans cette distinction, un veilleur
  --    jamais mis en service se présenterait comme en retard, et l'on
  --    chercherait une panne dans un mécanisme inexistant.
  select
    'veilleur_en_retard'::text,
    'critique'::text,
    h.source,
    extract(epoch from (now() - h.beat_at))::bigint / 60,
    p_retard_minutes::bigint
  from public.scheduler_heartbeat h
  where h.beat_at < now() - make_interval(mins => p_retard_minutes);
end;
$$;

comment on function public.alertes_admin(int, int) is
  'Alertes du panneau. Elles précèdent les compteurs, et portent leur VALEUR.';

revoke all on function public.alertes_admin(int, int) from public;
grant execute on function public.alertes_admin(int, int) to authenticated;

/*
 * L'ÉTAT DU VEILLEUR, RENDU SÉPARÉMENT DES ALERTES.
 *
 * Parce que « jamais déployé » doit s'AFFICHER sans alerter. Le mélanger aux
 * alertes obligerait à choisir entre le taire — et l'on ne saurait pas qu'aucune
 * tâche ne tourne — ou l'alerter à tort.
 */
create function public.etat_veilleur(p_retard_minutes int)
  returns table (source text, dernier_battement timestamptz, minutes bigint, etat text)
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
    h.source,
    h.beat_at,
    extract(epoch from (now() - h.beat_at))::bigint / 60,
    case
      when h.beat_at < now() - make_interval(mins => p_retard_minutes) then 'en_retard'
      else 'actif'
    end
  from public.scheduler_heartbeat h;
end;
$$;

comment on function public.etat_veilleur(int) is
  'État des tâches de fond. L''ABSENCE de ligne signifie « jamais déployé », pas « en panne ».';

revoke all on function public.etat_veilleur(int) from public;
grant execute on function public.etat_veilleur(int) to authenticated;

/*
 * LES COMPTEURS — bornés, et chacun justifié.
 *
 * `parcels_registered` du mois est le seul qui corresponde à une facture : il
 * est rendu en premier, et l'écran l'encadre.
 */
create function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint
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
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'active'),
    (select count(*) from public.profiles where status = 'suspended'),
    -- `account_type` est nullable SANS DÉFAUT : le manque est visible plutôt que
    -- silencieux. Le compter ici dit combien d'inscriptions n'ont jamais abouti
    -- à un onboarding — c'est-à-dire le taux d'abandon, qui est une des mesures
    -- de verdict de la phase de validation.
    (select count(*) from public.profiles where account_type is null),
    (select count(*) from public.tracked_parcels
      where registered_at >= date_trunc('month', now())),
    (select count(*) from public.tracked_parcels
      where abandoned_at >= date_trunc('month', now()));
end;
$$;

comment on function public.compteurs_admin() is
  'Compteurs du panneau. Bornés au mois pour les colis : leur coût ne croît pas avec l''âge du produit.';

revoke all on function public.compteurs_admin() from public;
grant execute on function public.compteurs_admin() to authenticated;
