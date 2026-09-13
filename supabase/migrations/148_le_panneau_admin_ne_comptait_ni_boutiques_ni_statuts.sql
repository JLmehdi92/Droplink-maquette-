/*
 * LE PANNEAU D'ADMINISTRATION NE COMPTAIT NI LES BOUTIQUES NI LES STATUTS.
 *
 * POURQUOI. Comparé au pixel à `Overview` du kit admin le 13/09/2026, l'écran
 * rendait 113 éléments contre 408. Deux de ses manques ne tenaient pas au
 * dessin : la base ne savait pas les compter.
 *
 *   · LE NOMBRE DE BOUTIQUES — la troisième tuile du kit. `compteurs_admin`
 *     comptait les COMPTES, jamais les boutiques, alors que l'écran
 *     `/admin/boutiques` les liste : le panneau annonçait donc un volume qu'on
 *     ne pouvait pas rapprocher de la liste qu'il surplombe.
 *   · LA RÉPARTITION DES COMMANDES PAR STATUT — un panneau entier du kit.
 *     `compter_commandes_par_etat` existe depuis longtemps, mais elle est
 *     `security invoker` : elle compte les commandes DE L'APPELANT, ce qui est
 *     exactement ce qu'il faut pour l'écran du vendeur et exactement ce qu'il
 *     ne faut pas pour celui de la plateforme.
 *
 * ⚠️ CE QUI N'ENTRE PAS DANS CETTE MIGRATION, ET POURQUOI. Le kit pose aussi un
 * tableau « Dernières commandes » portant le PSEUDO DU CLIENT, la boutique et le
 * transporteur de commandes appartenant à d'autres vendeurs. Le brief l'interdit
 * en l'état : « tout accès admin à des données tierces écrit un audit,
 * consultations comprises ». Un tableau posé sur l'écran d'accueil écrirait donc
 * une entrée d'audit À CHAQUE OUVERTURE du panneau — et noierait précisément les
 * consultations délibérées que le journal existe pour retrouver. La décision
 * « une consultation de liste produit UNE entrée » protège contre ce bruit ;
 * l'écran d'accueil le produirait par construction.
 *
 * ⚠️ ET LE REVENU D'ABONNEMENTS NON PLUS : c'est la quatrième tuile du kit, et
 * la contrainte n°1 interdit tout code de facturation. Les planches sont
 * conservées pour la phase 2 ; aucune ligne ne les suit.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LES VOLUMES DU PANNEAU, BOUTIQUES COMPRISES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LE `DROP` EST OBLIGATOIRE ET IL EMPORTE LES DROITS. `create or replace` ne
-- peut pas changer la table de retour, et la fonction recréée naît avec
-- `EXECUTE` accordé à `PUBLIC` : les deux dernières lignes du bloc ne répètent
-- pas la 137, elles la remplacent.
--
-- `security definer` avec garde interne `est_admin()` : la fonction lit des
-- données de tous les vendeurs, donc elle ne peut pas s'exécuter sous la RLS de
-- l'appelant. C'est la garde DANS le corps qui tient — et le droit d'exécution
-- reposé en dessous, parce qu'un droit ne s'écrit pas dans un corps.

drop function if exists public.compteurs_admin();

create function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint,
    commandes_creees_ce_mois bigint,
    boutiques bigint,
    boutiques_nommees bigint
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
    (select count(*) from public.profiles where account_type is null),
    (select coalesce(sum(u.parcels_registered), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    (select count(*) from public.tracked_parcels
      where abandoned_at >= date_trunc('month', now())),
    -- MÊME SOURCE, MÊME BORNE que les colis : le mois courant du compteur, et
    -- non une fenêtre glissante. Deux fenêtres différentes sur la même carte
    -- feraient comparer des chiffres qui ne décrivent pas la même période.
    (select coalesce(sum(u.orders_created), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    (select count(*) from public.shops),
    -- ⚠️ DEUX CHIFFRES, PAS UN. Une boutique est créée À L'INSCRIPTION, donc
    -- il y en a exactement autant que de comptes : rendre ce seul nombre
    -- afficherait « 20 boutiques » pour vingt comptes dont dix-huit n'ont
    -- jamais rien configuré. Celui qui INFORME est le second — combien ont
    -- réellement un nom, c'est-à-dire combien de vendeurs sont allés jusqu'à
    -- se donner une identité.
    (select count(*) from public.shops where name is not null and btrim(name) <> '');
end;
$$;

revoke all on function public.compteurs_admin() from public;
grant execute on function public.compteurs_admin() to authenticated;

comment on function public.compteurs_admin() is
  'Volumes du panneau d''administration. Garde interne : est_admin().';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA RÉPARTITION DES COMMANDES PAR STATUT, SUR TOUTE LA PLATEFORME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ELLE NE RÉUTILISE PAS `compter_commandes_par_etat`, ET C'EST LE POINT. La
-- fonction du vendeur est `security invoker` : elle compte SES commandes, et
-- c'est ce qui la rend sûre. L'appeler depuis l'administration rendrait les
-- commandes de l'administrateur — c'est-à-dire zéro — sur un panneau qui
-- prétend décrire la plateforme. Un chiffre faux et parfaitement crédible.
--
-- ELLE NE REND QUE DES NOMBRES, jamais une ligne. Compter n'est pas consulter :
-- aucun pseudo de client, aucune référence, aucune boutique n'en sort, donc
-- aucune donnée tierce n'est lue — et c'est pour cela qu'elle n'écrit pas
-- d'audit là où le tableau « Dernières commandes » devrait en écrire un.
--
-- LES QUATRE ÉTATS SONT CEUX DE LA DÉCISION 4 — préparation, expédié, en
-- transit, livré — et ils sont ÉNUMÉRÉS plutôt que déduits par soustraction :
-- un état ajouté à l'énumération ferait sinon un total faux que personne ne
-- verrait, les quatre chiffres continuant de s'afficher.

create function public.repartir_commandes_admin()
  returns table (
    total bigint,
    preparation bigint,
    expedie bigint,
    en_transit bigint,
    livre bigint
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
    count(*),
    count(*) filter (where o.status = 'preparation'),
    count(*) filter (where o.status = 'expedie'),
    count(*) filter (where o.status = 'en_transit'),
    count(*) filter (where o.status = 'livre')
  from public.orders o
  -- LE MÊME « COMMANDE CRÉÉE » QUE PARTOUT AILLEURS : le premier contenu réel.
  -- Compter les brouillons gonflerait le volume de la plateforme avec des pages
  -- que personne n'a jamais envoyées.
  where o.first_content_at is not null;
end;
$$;

revoke all on function public.repartir_commandes_admin() from public;
grant execute on function public.repartir_commandes_admin() to authenticated;

comment on function public.repartir_commandes_admin() is
  'Répartition des commandes de la plateforme par statut. Garde interne : est_admin(). Ne rend que des nombres — aucune donnée tierce, donc aucun audit.';
