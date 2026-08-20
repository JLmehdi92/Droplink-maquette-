-- 011 — Index PARTIELS pour le tri par défaut du tableau de bord.
--
-- DÉFAUT DE LA 006, trouvé par la MESURE DU PLAN et invisible au chronomètre.
--
-- `orders_tri_defaut_idx` portait `(shop_id, archived_at, created_at desc, id desc)`
-- et n'a jamais servi. Mesuré au plafond, sur 9 600 commandes avec un compte
-- voisin de même volumétrie, le plan de la première page était :
--
--     Limit <- Sort (top-N heapsort) <- Index Scan sur orders_qc_idx
--     condition d'index : (shop_id = mon_shop_id())
--     9 120 lignes lues pour en rendre 50, en 5,4 ms
--
-- Cinq millisecondes : le chronomètre n'aurait jamais sonné. C'est le PLAN qui
-- dit la vérité — l'écran lit toutes les commandes actives du vendeur puis les
-- trie, à chaque affichage. Le coût croît donc linéairement avec le succès du
-- vendeur, et le premier à en souffrir est celui qui a le plus de données.
--
-- POURQUOI L'INDEX D'ORIGINE NE POUVAIT PAS SERVIR. `archived_at` était au
-- MILIEU de la clé. Postgres sait employer `IS NULL` comme condition de
-- parcours, mais un test de nullité n'est pas une égalité : il ne permet pas de
-- garantir que les colonnes SUIVANTES restent triées. L'ordre demandé
-- (`created_at desc, id desc`) était donc perdu, et il fallait trier.
--
-- LE REMÈDE. Sortir `archived_at` de la clé et le passer en CONDITION PARTIELLE.
-- La clé se réduit alors à `(shop_id, created_at desc, id desc)`, qui correspond
-- exactement à ce que l'écran demande. Deux index plutôt qu'un, mais chacun ne
-- couvre que les lignes de sa vue — leur somme est donc plus petite que l'index
-- unique qu'ils remplacent.

drop index public.orders_tri_defaut_idx;

-- La vue par défaut du tableau de bord : les commandes actives, les plus
-- récentes d'abord. `id` termine la clé pour que le curseur de pagination soit
-- total — deux commandes créées dans la même milliseconde doivent avoir un ordre
-- stable, sinon une page peut sauter ou répéter une ligne.
create index orders_actives_recentes_idx
  on public.orders (shop_id, created_at desc, id desc)
  where archived_at is null;

-- La vue « archivées » a le même besoin. Sans son propre index, elle
-- retomberait exactement dans le défaut qu'on vient de corriger — et personne ne
-- s'en apercevrait, puisque c'est l'écran le moins regardé.
create index orders_archivees_recentes_idx
  on public.orders (shop_id, created_at desc, id desc)
  where archived_at is not null;
