-- 068 — Le vendeur voit le même « commande créée » que nous.
--
-- Défaut trouvé par audit : `analyser_activite` comptait toutes les lignes de
-- `orders`, brouillons compris, alors que `order_created` et
-- `shops.commandes_reelles` ne comptent que le PREMIER CONTENU RÉEL. Deux
-- définitions du même mot cohabitaient, l'une sur l'écran du vendeur, l'autre
-- sur celui de l'admin.
--
-- La liste d'arguments ne change pas : `create or replace` remplace bien la
-- fonction, sans créer de seconde surcharge.

create or replace function public.analyser_activite(p_depuis timestamptz)
  returns table (
    commandes_creees bigint,
    commandes_ouvertes bigint,
    vues_totales bigint,
    qc_approuve bigint,
    qc_refuse bigint,
    qc_en_attente bigint,
    avec_suivi bigint,
    archivees bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*),
    -- LE CHIFFRE QUI DIT SI LE PRODUIT SERT À QUELQUE CHOSE. Un lien créé mais
    -- jamais ouvert est un lien que le vendeur n'a pas envoyé, ou que son client
    -- n'a pas cliqué : les deux sont des signaux, et les confondre avec un
    -- succès rendrait toute la mesure inutilisable.
    count(*) filter (where o.views_count > 0),
    coalesce(sum(o.views_count), 0),
    count(*) filter (where o.qc_status = 'approuve'),
    count(*) filter (where o.qc_status = 'refuse'),
    -- « En attente » N'EST PAS l'absence de réponse : c'est l'état d'une
    -- commande dont le client n'a pas encore tranché. Le déduire par
    -- soustraction produirait un total faux le jour où une valeur d'énumération
    -- s'ajoute, et personne ne le verrait — les trois chiffres continueraient de
    -- s'afficher.
    count(*) filter (where o.qc_status = 'en_attente'),
    count(*) filter (where o.tracking_number is not null and o.tracking_number <> ''),
    count(*) filter (where o.archived_at is not null)
  from public.orders o
  -- LE MÊME « COMMANDE CRÉÉE » QUE PARTOUT AILLEURS.
  --
  -- L'agrégat ne filtrait que sur la date : il comptait donc les BROUILLONS,
  -- en contradiction avec la décision 20 et avec `shops.commandes_reelles`,
  -- que le panneau admin emploie. Un vendeur qui clique dix fois « nouvelle
  -- commande » et n'en remplit qu'une voyait « 10 commandes créées » quand
  -- l'admin lisait 1.
  --
  -- Le taux d'ouverture divisait par ce dénominateur gonflé : 10 % là où la
  -- réalité est 100 %. Deux chiffres portant le même nom, l'un gonflé du côté
  -- rassurant — le volume —, l'autre déprimé du côté alarmant — le taux. Le
  -- vendeur doit voir exactement ce que nous regardons.
  where o.created_at >= p_depuis
    and o.first_content_at is not null
$$;

