/*
 * LA LISTE DES COMPTES NE SAVAIT PAS FILTRER, ET L'ÉCRAN NE SAVAIT PAS COMPTER
 * LES INSCRIPTIONS.
 *
 * POURQUOI. Comparé au pixel à `AdminUsers` du kit admin le 13/09/2026, l'écran
 * rendait 388 éléments contre 609. Deux de ses manques ne tenaient pas au
 * dessin.
 *
 *   · LE FILTRE DE STATUT. Le kit pose quatre listes déroulantes au-dessus du
 *     tableau ; trois portent sur des données que le produit n'a pas (les plans,
 *     une dimension « boutique » distincte du compte, une plage de dates), mais
 *     la quatrième — actifs / suspendus — porte sur `profiles.status`, que la
 *     base tient depuis la première migration. Refuser ce filtre-là aurait été
 *     une préférence déguisée en impossibilité, sur l'écran où l'on vient
 *     précisément chercher un compte suspendu.
 *
 *     ⚠️ ET LE CRITÈRE ENTRE DANS LA TRACE. Une consultation de liste produit UNE
 *     entrée portant ses critères ; un filtre absent de la charge utile rendrait
 *     le journal incapable de dire ce qui a réellement été consulté. C'est la
 *     moitié qu'on oublie quand on ajoute un paramètre.
 *
 *   · LES NOUVEAUX INSCRITS. C'est la deuxième tuile du kit, et `profiles`
 *     porte `created_at` depuis toujours. `compteurs_admin` rend des totaux sans
 *     fenêtre ; compter sur une période demandait une fonction, pas un
 *     changement de celle-là — dont la table de retour vient d'être changée deux
 *     fois, et chaque changement impose un `drop` qui réécrit tout le corps.
 *
 * ⚠️ CE QUI N'ENTRE PAS. Les tuiles « Plan Pro » et « Plan Gratuit » du kit, sa
 * colonne « Plan » et son anneau « Répartition par plan » : aucune colonne de
 * plan n'existe, et la contrainte n°1 interdit d'en créer une. Les plans peuvent
 * être AFFICHÉS sur la tarification ; ils ne sont jamais APPLIQUÉS, et il n'y a
 * donc rien à compter.
 */

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LES INSCRIPTIONS SUR UNE FENÊTRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Elle ne rend QU'UN NOMBRE : aucune adresse, aucun identifiant, donc aucune
-- donnée tierce lue et aucun audit à écrire — même raisonnement que
-- `repartir_commandes_admin` (148) et `compter_commandes_par_jour_admin` (149).
--
-- LA BORNE EST INCLUSIVE ET VIENT DE L'APPELANT. « Depuis le 14 août » doit
-- compter le 14 août : c'est le piège de borne haute des filtres de période,
-- rencontré sur le tableau de bord, pris par l'autre bout.

create function public.compter_inscriptions_admin(p_depuis date)
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

  select count(*) into v_total
    from public.profiles p
   where (p.created_at at time zone 'UTC')::date >= p_depuis;

  return v_total;
end;
$$;

revoke all on function public.compter_inscriptions_admin(date) from public;
grant execute on function public.compter_inscriptions_admin(date) to authenticated;

comment on function public.compter_inscriptions_admin(date) is
  'Comptes inscrits depuis une date, borne INCLUSE. Garde interne : est_admin(). Ne rend qu''un nombre — aucune donnée tierce, donc aucun audit.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA LISTE DES COMPTES, FILTRABLE PAR STATUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `drop` OBLIGATOIRE : la liste d'arguments change, et `create or replace`
-- n'y suffit pas — il créerait une SECONDE fonction, les deux coexisteraient, et
-- un appel résoudrait l'ANCIENNE sans la moindre erreur. Le `drop` emporte aussi
-- les droits : les deux dernières lignes du bloc ne répètent pas la 111, elles
-- la remplacent.
--
-- ⚠️ ET LE CORPS EST RÉÉCRIT EN ENTIER, DONC IL HÉRITE DE TOUTES LES CORRECTIONS
-- PASSÉES. Celle de la 111 est dedans : `commandes` vient de
-- `shops.commandes_reelles`, le compteur tenu par déclencheur, et non d'un
-- `count(*)` sur `orders` — sans quoi cet écran et celui des boutiques
-- redonneraient deux nombres différents pour le même compte, l'écart étant les
-- brouillons abandonnés. La leçon vient d'être payée une seconde fois sur
-- `compteurs_admin` (migration 150).

drop function if exists public.lister_comptes_admin(text, text, text, int, text);

create function public.lister_comptes_admin(
  p_recherche text,
  p_curseur_date text,
  p_curseur_id text,
  p_limite int,
  p_ip_hash text,
  p_statut text
)
  returns table (
    id uuid,
    email text,
    account_type public.account_type,
    role public.user_role,
    status public.account_status,
    created_at timestamptz,
    boutique_nom text,
    commandes bigint,
    colis_ce_mois bigint
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
  -- UNE VALEUR HORS LISTE VAUT « TOUS », elle ne lève pas. Le paramètre arrive
  -- d'une URL, donc d'une entrée EXTERNE : la liste fermée tient lieu de schéma,
  -- et un filtre inconnu ne doit pas transformer un écran d'administration en
  -- page d'erreur. Ce qui compte est que la trace dise ce qui a été APPLIQUÉ.
  v_statut public.account_status := case
    when p_statut = 'active' then 'active'::public.account_status
    when p_statut = 'suspended' then 'suspended'::public.account_status
    else null
  end;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- LA TRACE PRÉCÈDE LA LECTURE, dans la même transaction. Une seule entrée par
  -- consultation, portant ses critères — jamais une par ligne rendue.
  perform public.journaliser_admin(
    'comptes.liste', 'profiles', null, null, p_ip_hash,
    jsonb_build_object(
      'recherche', v_recherche,
      'limite', v_limite,
      'page_suivante', v_date is not null,
      -- LE FILTRE RÉELLEMENT APPLIQUÉ, pas celui demandé : écrire `p_statut`
      -- brut ferait consigner un critère qui n'a rien filtré.
      'statut', v_statut
    )
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.created_at, s.name,
    coalesce(s.commandes_reelles, 0)::bigint,
    coalesce(u.parcels_registered, 0)::bigint
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  left join public.usage_counters u
         on u.profile_id = p.id
        and u.period_month = date_trunc('month', now())::date
  where
    (v_recherche is null or p.email ilike '%' || v_recherche || '%')
    and (v_statut is null or p.status = v_statut)
    and (v_date is null or (p.created_at, p.id) < (v_date, v_id))
  order by p.created_at desc, p.id desc
  limit v_limite;
end;
$$;

revoke all on function public.lister_comptes_admin(text, text, text, int, text, text) from public;
grant execute on function public.lister_comptes_admin(text, text, text, int, text, text) to authenticated;

comment on function public.lister_comptes_admin(text, text, text, int, text, text) is
  'Liste des comptes pour l''administration, filtrable par statut. Garde interne : est_admin(). Trace atomique, une entrée par consultation, portant ses critères — filtre compris.';
