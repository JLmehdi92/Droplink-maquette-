-- 111 — Deux écrans d'administration, un seul compte, deux nombres différents.
--
-- DÉFAUT CONSTATÉ EN COMPARANT LES DEUX ÉCRANS SUR LE MÊME COMPTE :
-- `lister_boutiques_admin` rend `s.commandes_reelles`, le compteur tenu par
-- déclencheur depuis la 049, qui ne compte que les commandes ayant du CONTENU
-- RÉEL. `lister_comptes_admin`, elle, comptait les LIGNES de `orders`, donc les
-- brouillons ouverts puis abandonnés. Sur le compte de test : 1 d'un côté, 7 de
-- l'autre. Aucun des deux écrans ne ment sur ce qu'il calcule ; c'est qu'il y
-- avait DEUX définitions du mot « commande » dans la même surface, et rien pour
-- le signaler.
--
-- La définition qui gagne est celle du produit : `first_content_at`. Un
-- brouillon ouvert puis abandonné est exactement le cas « teste une ou deux fois
-- puis disparaît ». Le compter gonfle le seul chiffre sur lequel on décidera.
--
-- ET LE COÛT DISPARAÎT AVEC LA DIVERGENCE. La sous-requête corrélée comptait les
-- commandes UNE PAR UNE, pour chacune des 50 lignes de la page : à 9 600
-- commandes par compte, un demi-million de lignes d'index lues pour afficher un
-- écran. Le compteur est lu en une jointure.
--
-- LA COLONNE COLIS EST NOUVELLE, et elle vient de la planche : le seul poste que
-- le fournisseur de suivi nous facture. Elle est lue sur `usage_counters`, la
-- MÊME source que l'alerte du panneau — sinon l'écran des comptes et l'alerte
-- pourraient se contredire sur le compte qu'ils désignent tous les deux.
--
-- `drop` OBLIGATOIRE : la liste d'arguments ne change pas, mais le type de
-- retour si.

drop function if exists public.lister_comptes_admin(text, text, text, int, text);

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
      'page_suivante', v_date is not null
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
    and (v_date is null or (p.created_at, p.id) < (v_date, v_id))
  order by p.created_at desc, p.id desc
  limit v_limite;
end;
$$;

revoke all on function public.lister_comptes_admin(text, text, text, int, text) from public;
grant execute on function public.lister_comptes_admin(text, text, text, int, text) to authenticated;

comment on function public.lister_comptes_admin(text, text, text, int, text) is
  'Liste des comptes pour l''administration. Garde interne : est_admin(). '
  'Trace atomique, une entrée par consultation.';

-- REMISE À NIVEAU DU COMPTEUR, UNE FOIS.
--
-- ⚠️ SUR LA BASE DE DÉVELOPPEMENT, `commandes_reelles` VALAIT 1 POUR 4 COMMANDES
-- RÉELLES. Le déclencheur de la 049 a pourtant été éprouvé ici même : insertion
-- d'une commande avec contenu → +1, suppression → −1, en transaction annulée.
-- La CAUSE de l'écart n'est pas établie — cette base a subi des semaines de
-- falsifications, de scripts d'état et de suppressions manuelles, et je ne
-- prétendrai pas savoir laquelle a mangé trois incréments.
--
-- Ce qui est établi : le compteur devient la valeur AFFICHÉE sur deux écrans à
-- partir de cette migration. Le laisser dérivé ferait décider sur un chiffre
-- faux. La remise à niveau est idempotente et se relit dans sa propre
-- définition, donc elle ne peut pas introduire un écart nouveau.
update public.shops s
   set commandes_reelles = coalesce(v.n, 0)
  from (
    select sh.id as shop_id,
           (select count(*) from public.orders o
             where o.shop_id = sh.id and o.first_content_at is not null) as n
      from public.shops sh
  ) v
 where v.shop_id = s.id
   and s.commandes_reelles is distinct from coalesce(v.n, 0)::int;
