-- 036 — L'écran des envois : depuis quand un colis ne bouge plus, et combien.
--
-- CE QUE LE VENDEUR VIENT CHERCHER SUR CET ÉCRAN, c'est la réponse à « lesquels
-- de mes colis sont bloqués ». Pas la liste de ceux qui avancent : ceux-là ne
-- posent aucune question. Le tri par défaut de l'écran est donc l'immobilité,
-- et un tri par défaut sans index lit toutes les lignes pour en rendre
-- cinquante — ce qui reste parfaitement invisible tant qu'un compte de test en
-- porte trente.
--
-- POURQUOI UNE COLONNE GÉNÉRÉE ET PAS UN TRI SUR `last_movement_at`.
--
-- Cette colonne est NULLE tant que le transporteur n'a rien scanné, et c'est
-- justement l'état le plus intéressant à faire remonter. Or la pagination par
-- curseur compare des COUPLES `(valeur, id)` : avec des valeurs nulles, la
-- comparaison ne rend ni vrai ni faux mais NULL, et la page suivante saute
-- silencieusement des lignes. Le défaut ne casse rien — il fait simplement
-- disparaître des colis d'une liste, ce que personne ne remarque avant d'en
-- chercher un précis.
--
-- `coalesce(last_movement_at, created_at)` n'est pas un bouche-trou : un colis
-- jamais scanné stagne DEPUIS SA CRÉATION, et c'est exactement l'ancienneté
-- qu'on veut afficher. La valeur est donc juste, et jamais nulle.
--
-- `stored` et non `virtual` : Postgres recalcule une colonne stockée à chaque
-- écriture de la ligne, donc elle suit `last_movement_at` sans intervention, et
-- surtout elle est INDEXABLE — une colonne virtuelle ne le serait pas, ce qui
-- reviendrait à ne rien avoir fait.

alter table public.tracked_parcels
  add column immobile_depuis timestamptz
    generated always as (coalesce(last_movement_at, created_at)) stored;

-- Le tri par défaut de l'écran, avec son départage par identifiant : c'est le
-- couple que la pagination compare, et un index sur la seule première colonne
-- laisserait le tri final se faire en mémoire.
create index tracked_parcels_immobilite_idx
  on public.tracked_parcels (shop_id, immobile_depuis asc, id asc);

-- LES COMPTEURS DE L'EN-TÊTE. Un index sur `(shop_id, normalized_status)`
-- permet de les obtenir sans lire les lignes elles-mêmes.
--
-- `include (abandoned_at)` : sans lui, chaque ligne serait relue dans la table
-- pour savoir si le colis est abandonné, et l'index ne servirait qu'à trouver
-- les lignes au lieu de répondre à leur place.
create index tracked_parcels_compteurs_idx
  on public.tracked_parcels (shop_id, normalized_status)
  include (abandoned_at, immobile_depuis);

/*
 * LES COMPTEURS, EN UNE SEULE PASSE.
 *
 * Cinq requêtes séparées liraient cinq fois le même ensemble de lignes. Un
 * `count(*) filter` les obtient toutes d'un seul parcours.
 *
 * `security invoker` — et c'est le point qui compte : la fonction s'exécute avec
 * les droits de l'appelant, donc SOUS SA RLS. Elle ne peut compter que les
 * colis de sa propre boutique parce que la base le lui impose, pas parce que le
 * `where` est bien écrit. Une fonction `security definer` ici aurait exigé de
 * refaire l'isolation à la main, et une isolation refaite à la main est une
 * isolation qu'on peut oublier dans un nouveau chemin.
 *
 * `p_silence_jours` est un ARGUMENT et non une constante : le seuil de silence
 * vaut dix jours dans le produit, et cette valeur vit déjà dans le module
 * `silence.ts`. La réécrire ici en dur créerait une seconde source de vérité qui
 * divergerait au premier ajustement — et personne ne penserait à regarder dans
 * une migration.
 */
create function public.compter_envois(p_silence_jours int)
  returns table (
    total bigint,
    preparation bigint,
    expedie bigint,
    en_transit bigint,
    livre bigint,
    silencieux bigint,
    abandonnes bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where tp.normalized_status = 'preparation'),
    count(*) filter (where tp.normalized_status = 'expedie'),
    count(*) filter (where tp.normalized_status = 'en_transit'),
    count(*) filter (where tp.normalized_status = 'livre'),
    -- LE SILENCE NE CONCERNE QUE CE QUI EST ENCORE EN ROUTE. Un colis livré ne
    -- bouge plus par définition : le compter comme silencieux ferait grossir
    -- l'alerte avec les livraisons réussies, c'est-à-dire avec le succès. Une
    -- alerte qui se déclenche quand tout va bien est une alerte qu'on apprend à
    -- ignorer.
    count(*) filter (
      where tp.normalized_status <> 'livre'
        and tp.abandoned_at is null
        and tp.immobile_depuis < now() - make_interval(days => p_silence_jours)
    ),
    count(*) filter (where tp.abandoned_at is not null)
  from public.tracked_parcels tp
$$;

comment on function public.compter_envois(int) is
  'Compteurs de l''écran des envois, sous la RLS de l''appelant.';

-- Postgres accorde EXECUTE à PUBLIC par défaut, et un droit ne s''écrit pas dans
-- le corps d'une fonction : aucune relecture de code ne peut le voir. La
-- révocation est ce qui referme.
revoke all on function public.compter_envois(int) from public;
grant execute on function public.compter_envois(int) to authenticated;
