-- 049 — Les volumes d'une boutique, tenus à l'écriture.
--
-- L'écran d'administration des boutiques doit montrer, pour chacune, combien de
-- commandes réelles, combien de médias et combien d'octets. Les calculer à la
-- lecture reviendrait à parcourir `orders` et `order_media` de TOUS les comptes
-- à chaque ouverture de l'écran : le coût suivrait l'activité totale du produit,
-- donc le nombre de comptes multiplié par leur usage.
--
-- C'EST LE TROISIÈME PASSAGE DU MÊME MOTIF — après la 027 (tri « jamais
-- ouvert ») et la 046 (colis pris en charge). Quand un agrégat porte sur une
-- table qui grossit avec l'usage, aucun index ne le rattrape : un index accélère
-- la recherche de lignes, pas leur addition. La seule issue est de ne pas avoir
-- à additionner.
--
-- POURQUOI SUR `shops` ET NON DANS `usage_counters`. Les compteurs d'usage sont
-- MENSUELS, et c'est correct pour ce qui se facture : un colis pris en charge en
-- juillet reste facturé en juillet. Le stockage, lui, est CUMULATIF — il occupe
-- de la place tant que le média existe. Un « stockage du mois » mesurerait les
-- octets AJOUTÉS dans le mois, ce qui n'est pas ce que le mot désigne, et
-- personne ne s'en apercevrait avant de comparer à une facture d'hébergement.
-- Deux natures, deux endroits.
--
-- CES COMPTEURS PEUVENT DÉRIVER, et il faut le dire : ils ne sont exacts que si
-- tout chemin d'écriture passe par les déclencheurs ci-dessous. C'est
-- précisément pourquoi ce sont des DÉCLENCHEURS et non des appels applicatifs —
-- un appel s'oublie dans un nouveau chemin de code, et l'oubli ne casse rien :
-- le compteur est simplement plus bas que la réalité.

-- AUCUN GRANT N'EST AJOUTÉ ICI, ET C'EST LA PROTECTION. La migration 001
-- accorde l'écriture sur `shops` colonne par colonne, en liste blanche : une
-- colonne nouvelle naît donc FERMÉE à `authenticated`. Si le droit avait été
-- accordé sur la table entière, ces trois compteurs seraient devenus modifiables
-- par le vendeur qu'ils mesurent — et remettre son stockage à zéro est
-- exactement ce qu'on ferait. Une liste blanche protège ce que son auteur n'a
-- pas encore écrit ; une liste noire, jamais.

alter table public.shops
  add column commandes_reelles integer not null default 0
    check (commandes_reelles >= 0),
  add column medias_count integer not null default 0
    check (medias_count >= 0),
  add column stockage_octets bigint not null default 0
    check (stockage_octets >= 0);

/*
 * LES COMMANDES RÉELLES.
 *
 * ON NE COMPTE PAS LES LIGNES DE `orders`, on compte la TRANSITION vers du
 * contenu réel — `first_content_at` passant de nul à non nul. C'est la
 * définition que le produit donne d'une commande créée : un brouillon ouvert
 * puis abandonné est exactement le cas « teste une ou deux fois puis
 * disparaît », et le compter gonflerait la métrique de verdict du côté
 * rassurant. Une métrique fausse qui confirme ce qu'on espère ne se remet
 * jamais en question.
 *
 * SANS LA CONDITION DE TRANSITION, chaque mise à jour d'une commande —
 * l'éditeur en produit une par frappe débattue — incrémenterait le compteur, qui
 * mesurerait alors les modifications. Les deux chiffres se ressemblent assez
 * pour qu'on ne remarque rien.
 */
create function public.compter_commande_reelle()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.first_content_at is not null then
      update public.shops set commandes_reelles = greatest(commandes_reelles - 1, 0)
      where id = old.shop_id;
    end if;
    return old;
  end if;

  if new.first_content_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.first_content_at is not null then return new; end if;

  update public.shops set commandes_reelles = commandes_reelles + 1
  where id = new.shop_id;

  return new;
end;
$$;

revoke all on function public.compter_commande_reelle() from public;

create trigger orders_compter_commande_reelle
  after insert or delete or update of first_content_at on public.orders
  for each row execute function public.compter_commande_reelle();

/*
 * LES MÉDIAS ET LES OCTETS.
 *
 * `taille_octets` est RELUE CÔTÉ SERVEUR après dépôt, jamais crue depuis le
 * client : c'est ce qui autorise à en faire un compteur de coût. Un client qui
 * annonce 2 Mo pour un fichier de 80 Mo passerait tous les plafonds sans qu'aucun
 * compteur ne bouge.
 *
 * LA SUPPRESSION DÉCRÉMENTE. Sans elle, le compteur mesurerait les octets JAMAIS
 * DÉPOSÉS plutôt que les octets OCCUPÉS — un chiffre qui ne redescend pas finit
 * par n'avoir aucun rapport avec la facture, et il aurait l'air parfaitement
 * crédible tout du long.
 */
create function public.compter_media()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_ligne record;
begin
  v_ligne := case when tg_op = 'DELETE' then old else new end;

  select o.shop_id into v_shop from public.orders o where o.id = v_ligne.order_id;
  if v_shop is null then
    -- La commande a déjà disparu : sa suppression en cascade a emporté ses
    -- médias, et le compteur de la boutique part avec elle. Rien à corriger.
    return v_ligne;
  end if;

  if tg_op = 'DELETE' then
    update public.shops
    set medias_count = greatest(medias_count - 1, 0),
        stockage_octets = greatest(stockage_octets - old.taille_octets, 0)
    where id = v_shop;
    return old;
  end if;

  update public.shops
  set medias_count = medias_count + 1,
      stockage_octets = stockage_octets + new.taille_octets
  where id = v_shop;

  return new;
end;
$$;

revoke all on function public.compter_media() from public;

create trigger order_media_compter
  after insert or delete on public.order_media
  for each row execute function public.compter_media();

-- REPRISE DE L'EXISTANT. Sans elle, les compteurs démarreraient à zéro et
-- l'écran montrerait des boutiques vides alors qu'elles portent des commandes et
-- des médias. Un compteur branché après coup démarre avec un historique vide,
-- donc inexploitable au moment précis où il faut décider.
update public.shops s
set commandes_reelles = coalesce(v.n, 0)
from (
  select o.shop_id, count(*) as n
  from public.orders o
  where o.first_content_at is not null
  group by o.shop_id
) v
where v.shop_id = s.id;

update public.shops s
set medias_count = coalesce(v.n, 0),
    stockage_octets = coalesce(v.octets, 0)
from (
  select o.shop_id, count(*) as n, sum(m.taille_octets) as octets
  from public.order_media m
  join public.orders o on o.id = m.order_id
  group by o.shop_id
) v
where v.shop_id = s.id;
