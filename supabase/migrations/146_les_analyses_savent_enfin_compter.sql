-- 146 — L'ÉCRAN DES ANALYSES SAVAIT MONTRER CINQ CHOSES SUR DIX.
--
-- POURQUOI. Comparé au pixel à `AnalyticsView` du kit vendeur le 12/09/2026,
-- l'écran rendait 54 éléments de moins que sa référence. Cinq ne manquaient pas
-- par oubli de dessin : la base ne savait pas les compter.
--
--   · les commandes LIVRÉES de la période — le kit en fait sa deuxième tuile ;
--   · le TEMPS MOYEN DE LIVRAISON — sa cinquième ;
--   · la RÉPARTITION PAR TRANSPORTEUR — un panneau entier ;
--   · les OUVERTURES DE LIENS PAR JOUR — le graphe « Liens clients ».
--
-- ⚠️ POURQUOI DE LA SQL PLUTÔT QUE DU TYPESCRIPT. Les agrégats groupés de
-- PostgREST sont DÉSACTIVÉS sur ce projet — mesuré, pas supposé : un
-- `select=carrier_code,count()` répond « Use of aggregate functions is not
-- allowed ». Il ne restait qu'à lire les lignes et à les regrouper côté serveur
-- applicatif, ce qui veut dire lire, au plafond du brief, plusieurs dizaines de
-- milliers de lignes pour dessiner six barres — ou les plafonner et rendre une
-- distribution TRONQUÉE présentée comme complète. Le §11 du brief nomme ce
-- résultat : une métrique légèrement faussée est pire qu'une métrique cassée,
-- parce qu'elle reste crédible.
--
-- ⚠️ LES QUATRE FONCTIONS SONT `security invoker`, comme celles de la 037.
-- Elles s'exécutent sous la RLS de l'appelant : elles ne peuvent
-- structurellement compter que ses propres lignes, et il n'y a AUCUN filtre de
-- propriété à écrire dans leur corps — donc aucun à oublier dans un futur
-- chemin de code. C'est la même raison qui a fait écarter une vue : une vue
-- s'exécute avec les droits de celui qui l'a créée.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LES COMMANDES LIVRÉES REJOIGNENT LES COMPTEURS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Elles se comptent sur `orders` SEULE, comme tout le reste de cette fonction :
-- `status` porte la position qui fait foi — le colis l'écrit quand il bouge
-- (migration 090) et le vendeur l'amorce avant la remise au transporteur
-- (décision 2). Aller la chercher sur `tracked_parcels` créerait une seconde
-- source, et une commande sans colis attaché — la moitié d'entre elles —
-- disparaîtrait du compte.
--
-- ⚠️ LE `DROP` EST OBLIGATOIRE ET IL EMPORTE LES DROITS. `create or replace` ne
-- peut pas changer la table de retour. Après le `drop`, la fonction recréée naît
-- avec `EXECUTE` accordé à `PUBLIC` : les deux dernières lignes du bloc ne
-- répètent pas la 106, elles la remplacent.

drop function if exists public.analyser_activite(timestamptz, timestamptz);

create function public.analyser_activite(
  p_depuis timestamptz,
  p_precedent timestamptz
)
  returns table (
    commandes_creees bigint,
    commandes_ouvertes bigint,
    vues_totales bigint,
    qc_approuve bigint,
    qc_refuse bigint,
    qc_en_attente bigint,
    avec_suivi bigint,
    archivees bigint,
    creees_periode_precedente bigint,
    commandes_livrees bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*) filter (where o.created_at >= p_depuis),
    -- LE CHIFFRE QUI DIT SI LE PRODUIT SERT À QUELQUE CHOSE. Un lien créé mais
    -- jamais ouvert est un lien que le vendeur n'a pas envoyé, ou que son client
    -- n'a pas cliqué : les deux sont des signaux, et les confondre avec un
    -- succès rendrait toute la mesure inutilisable.
    count(*) filter (where o.created_at >= p_depuis and o.views_count > 0),
    coalesce(sum(o.views_count) filter (where o.created_at >= p_depuis), 0),
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'approuve'),
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'refuse'),
    -- « En attente » N'EST PAS l'absence de réponse : c'est l'état d'une
    -- commande dont le client n'a pas encore tranché. Le déduire par
    -- soustraction produirait un total faux le jour où une valeur d'énumération
    -- s'ajoute, et personne ne le verrait.
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'en_attente'),
    count(*) filter (
      where o.created_at >= p_depuis
        and o.tracking_number is not null
        and o.tracking_number <> ''
    ),
    count(*) filter (where o.created_at >= p_depuis and o.archived_at is not null),
    -- LA FENÊTRE PRÉCÉDENTE EST FERMÉE DES DEUX CÔTÉS : le `where` la borne en
    -- bas, ce filtre la borne en haut. Sans la borne haute, elle contiendrait la
    -- période courante et le delta serait toujours négatif.
    count(*) filter (where o.created_at < p_depuis),
    count(*) filter (where o.created_at >= p_depuis and o.status = 'livre')
  from public.orders o
  -- LE MÊME « COMMANDE CRÉÉE » QUE PARTOUT AILLEURS : le premier contenu réel,
  -- comme `order_created` et `shops.commandes_reelles`. Compter les brouillons
  -- gonflerait le volume et déprimerait le taux d'ouverture — deux erreurs de
  -- sens opposé sous le même nom.
  where o.created_at >= p_precedent
    and o.first_content_at is not null
$$;

comment on function public.analyser_activite(timestamptz, timestamptz) is
  'Compteurs de l''écran des analyses sur la période, plus les commandes de la période précédente, sous la RLS de l''appelant.';

revoke all on function public.analyser_activite(timestamptz, timestamptz) from public;
grant execute on function public.analyser_activite(timestamptz, timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA RÉPARTITION PAR TRANSPORTEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Elle rend le CODE, jamais un nom : `carrier_code` est l'identifiant numérique
-- du fournisseur de suivi, et sa traduction vit dans le dépôt
-- (`lib/tracking/transporteurs.json`, 3 502 entrées recopiées de la source
-- officielle de 17TRACK). Mettre un nom en base le figerait à la date de la
-- migration, alors que le fournisseur en ajoute.
--
-- ELLE N'EST PAS PLAFONNÉE, ET ELLE N'EN A PAS BESOIN : une ligne par
-- transporteur DISTINCT d'une seule boutique, c'est-à-dire quelques dizaines au
-- pire. C'est précisément ce qu'un regroupement côté serveur applicatif ne
-- pouvait pas faire sans lire tous les colis.
--
-- `carrier_code` NUL EST UNE LIGNE COMME UNE AUTRE. Un colis dont le
-- transporteur n'a pas été identifié existe, et l'écarter ferait que la somme
-- des parts ne vaudrait plus le total affiché ailleurs — le genre d'écart qu'on
-- ne remarque qu'en additionnant.

create function public.repartir_transporteurs(p_depuis timestamptz)
  returns table (
    carrier_code integer,
    nombre bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select c.carrier_code, count(*)
  from public.tracked_parcels c
  where c.created_at >= p_depuis
  group by c.carrier_code
  order by count(*) desc, c.carrier_code
$$;

comment on function public.repartir_transporteurs(timestamptz) is
  'Nombre de colis par code transporteur sur la période, sous la RLS de l''appelant. Le NOM se résout dans le dépôt, jamais en base.';

revoke all on function public.repartir_transporteurs(timestamptz) from public;
grant execute on function public.repartir_transporteurs(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. LE TEMPS MOYEN DE LIVRAISON
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il se mesure entre le PREMIER et le DERNIER mouvement d'un colis LIVRÉ, et
-- pas autrement :
--
--   · pas depuis la création de la commande — le vendeur peut coller un numéro
--     trois jours après, et on mesurerait sa procrastination ;
--   · pas depuis `registered_at` — c'est la date de prise en charge par le
--     fournisseur de suivi, notre calendrier, pas celui du colis.
--
-- ⚠️ IL REND `null` PLUTÔT QUE ZÉRO QUAND AUCUN COLIS N'EST LIVRÉ. « 0 jour »
-- affirmerait une livraison instantanée ; l'absence de colis livré n'est pas une
-- performance. Les deux se ressemblent dans une tuile et se confondent dans une
-- comparaison de périodes.
--
-- La borne `first_movement_at is not null` n'est pas décorative : un colis peut
-- être marqué livré par un scan unique, sans premier mouvement enregistré, et
-- `null - timestamptz` rend `null` qui disparaîtrait silencieusement de la
-- moyenne. On l'écarte explicitement, pour que le compte de colis retenus soit
-- lisible à côté de la moyenne.

create function public.delai_moyen_livraison(p_depuis timestamptz)
  returns table (
    jours numeric,
    colis bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    round(
      avg(extract(epoch from (c.last_movement_at - c.first_movement_at)) / 86400)::numeric,
      1
    ),
    count(*)
  from public.tracked_parcels c
  where c.created_at >= p_depuis
    and c.normalized_status = 'livre'
    and c.first_movement_at is not null
    and c.last_movement_at is not null
$$;

comment on function public.delai_moyen_livraison(timestamptz) is
  'Durée moyenne en jours entre le premier et le dernier mouvement des colis livrés de la période, et le nombre de colis retenus. `null` quand il n''y en a aucun.';

revoke all on function public.delai_moyen_livraison(timestamptz) from public;
grant execute on function public.delai_moyen_livraison(timestamptz) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LES OUVERTURES DE LIENS, JOUR PAR JOUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ C'EST LA SEULE LECTURE DE CET ÉCRAN QUI TOUCHE `link_views`, ET LA 037
-- EXPLIQUE POURQUOI ON L'AVAIT ÉVITÉE : c'est la table qui grossit le plus vite
-- du produit — une ligne par visiteur ET PAR JOUR — et un agrégat complet ne se
-- rattrape par aucun index.
--
-- CE QUI REND CELLE-CI ACCEPTABLE, et c'est une borne, pas un espoir :
--
--   · elle est bornée à la PÉRIODE choisie — 7, 30 ou 90 jours, jamais depuis
--     le début ;
--   · elle est bornée à UNE boutique par la RLS, qui remonte
--     `orders → shops → profiles` ;
--   · l'index posé ci-dessous couvre exactement sa jointure et son
--     regroupement, si bien que le parcours reste un balayage d'index.
--
-- Ordre de grandeur au plafond du brief — 9 600 commandes par mois, trois
-- visiteurs-jours chacune, sur 90 jours : ~86 000 lignes pour UNE boutique.
-- C'est la requête la plus lourde de l'écran, et l'écran des analyses n'est pas
-- le chemin chaud du produit : la liste des commandes l'est. Si elle devient un
-- problème, la réponse n'est pas un index de plus mais une colonne `shop_id`
-- dénormalisée sur `link_views` — la même réponse que `views_count` sur
-- `orders`, pour la même raison.
--
-- ⚠️ ELLE REND LES JOURS SANS OUVERTURE, ET C'EST TOUT L'INTÉRÊT. Un graphe qui
-- saute les jours vides n'est plus un graphe : ses barres deviennent équidistantes
-- alors que le temps ne l'est pas, et une semaine morte se lit comme une semaine
-- pleine. `generate_series` pose la grille, la jointure externe la remplit.
--
-- `viewed_on` EST UNE COLONNE GÉNÉRÉE depuis `viewed_at` (migration 018) : elle
-- porte la définition de la métrique — un visiteur, un JOUR. Regrouper sur
-- `viewed_at::date` referait ce calcul à côté d'elle, avec un autre fuseau.

create index if not exists link_views_jour_idx
  on public.link_views (order_id, viewed_on);

create function public.compter_ouvertures_par_jour(
  p_depuis date,
  p_jusqu_a date
)
  returns table (
    jour date,
    total bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    g.jour::date,
    count(v.id)
  from generate_series(p_depuis, p_jusqu_a, interval '1 day') as g(jour)
  left join public.link_views v on v.viewed_on = g.jour::date
  group by g.jour
  order by g.jour
$$;

comment on function public.compter_ouvertures_par_jour(date, date) is
  'Ouvertures de liens par jour sur la période, JOURS VIDES COMPRIS, sous la RLS de l''appelant.';

revoke all on function public.compter_ouvertures_par_jour(date, date) from public;
grant execute on function public.compter_ouvertures_par_jour(date, date) to authenticated;
