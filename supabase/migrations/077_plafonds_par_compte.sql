-- 077 — DES PLAFONDS PAR COMPTE, PAS SEULEMENT PAR COMMANDE.
--
-- Les plafonds existants — vingt médias et trois vidéos — sont posés PAR
-- COMMANDE. Rien ne bornait donc un COMPTE : mesuré, cinq mille commandes
-- insérées en 533 ms, et rien ne s'y opposait. Un compte pouvait ainsi remplir
-- le stockage sans jamais franchir aucune limite, puisque chaque commande prise
-- séparément restait dans les clous.
--
-- LE PRODUIT EST GRATUIT PENDANT LA VALIDATION, ce qui rend la question plus
-- aiguë et non moins : personne ne paie ce qu'il consomme, et le stockage est —
-- avec les interrogations de suivi — l'un des deux seuls postes de coût
-- variables. Une alerte de budget prévient qu'on a déjà dépensé ; un plafond
-- empêche de dépenser.
--
-- LES CHIFFRES, ET D'OÙ ILS VIENNENT.
--
--   3 000 COMMANDES PAR MOIS ET PAR COMPTE. Le plus gros persona documenté —
--   un fournisseur à deux cents commandes par semaine — en fait environ 870.
--   Le plafond laisse donc 3,4 fois sa marge. Un compte qui le franchit n'est
--   pas un vendeur qui perce : c'est quelque chose qu'on veut regarder avant
--   qu'il continue.
--
--   100 Go DE STOCKAGE PAR COMPTE. À vingt médias dont trois vidéos de vingt
--   mégaoctets, le pire cas d'une commande approche 80 Mo ; le brief chiffre
--   ~48 Go par mois pour huit cents commandes d'un gros fournisseur. Le plafond
--   couvre donc deux mois de son usage réel au pire cas.
--
-- EN DUR, comme les plafonds de la migration 013, et pour la même raison : un
-- plafond lu dans une table de configuration serait modifiable sans trace par
-- qui sait écrire dedans. Celui-ci exige une migration, donc une décision datée
-- et relisible dans l'historique.
--
-- ILS REFUSENT, ILS NE SUPPRIMENT PAS. Un plafond qui purge automatiquement
-- ferait disparaître les photos d'un client sans que personne l'ait décidé —
-- et le vendeur l'apprendrait par son client.

create function public.verifier_plafond_commandes()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_ce_mois integer;
begin
  -- Le décompte s'appuie sur l'index `(shop_id, created_at)` posé pour le
  -- dashboard. Il porte sur le MOIS COURANT, jamais sur tout l'historique : un
  -- compte ancien et légitime ne doit pas se retrouver bloqué par son passé.
  select count(*) into v_ce_mois
  from public.orders
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  if v_ce_mois >= 3000 then
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (%).', v_ce_mois
      using errcode = 'DL035';
  end if;

  return new;
end;
$$;

create trigger orders_plafond_par_compte
  before insert on public.orders
  for each row execute function public.verifier_plafond_commandes();

/*
 * LE PLAFOND DE STOCKAGE.
 *
 * Il lit `shops.stockage_octets`, tenu à l'écriture depuis la migration 049 —
 * pas une somme sur `order_media`. Quand un agrégat porte sur une table qui
 * grossit avec l'usage, aucun index ne le rattrape : un index accélère la
 * recherche de lignes, pas leur addition. Et ce contrôle-ci s'exécute à CHAQUE
 * dépôt de média.
 *
 * `taille_octets` EST RELUE CÔTÉ SERVEUR après le dépôt, jamais crue depuis le
 * client — c'est la base du modèle de coût. Ce déclencheur en dépend donc
 * entièrement : un plafond calculé sur une taille annoncée par celui qu'il
 * borne ne borne rien.
 */
create function public.verifier_plafond_stockage()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_actuel bigint;
begin
  select o.shop_id into v_shop from public.orders o where o.id = new.order_id;
  if v_shop is null then return new; end if;

  select s.stockage_octets into v_actuel from public.shops s where s.id = v_shop;

  -- 100 Go en base 1000 — celle des FACTURES, et celle qu'emploie déjà
  -- l'affichage. Mélanger les deux bases ferait diverger le plafond de ce que
  -- l'écran annonce, sur un chiffre qui décide d'un refus.
  if coalesce(v_actuel, 0) + coalesce(new.taille_octets, 0) > 100000000000 then
    raise exception 'Plafond de stockage atteint pour ce compte (% octets).', v_actuel
      using errcode = 'DL036';
  end if;

  return new;
end;
$$;

create trigger order_media_plafond_stockage
  before insert on public.order_media
  for each row execute function public.verifier_plafond_stockage();

comment on function public.verifier_plafond_commandes() is
  'Borne le NOMBRE DE COMMANDES par compte et par mois. Les plafonds de la 013 sont par commande : ils ne bornaient aucun compte.';
comment on function public.verifier_plafond_stockage() is
  'Borne le STOCKAGE par compte. Lit le compteur tenu à l''écriture, jamais une somme sur les médias.';
