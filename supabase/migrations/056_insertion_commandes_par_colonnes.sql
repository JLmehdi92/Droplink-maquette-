-- 056 — Restreindre l'INSERT sur `orders` aux colonnes du vendeur.
--
-- MÊME CAUSE QUE LA 055, autre table : `grant insert` a été posé sur la table
-- entière, donc sur toutes les colonnes. Constaté au catalogue :
-- `first_content_at`, `created_event_at`, `views_count` et `last_viewed_at`
-- sont insérables par `authenticated`. L'UPDATE les exclut correctement ; c'est
-- l'INSERT qui n'a jamais été inventorié.
--
-- CE QUE ÇA PERMET, ET POURQUOI C'EST GRAVE AUTREMENT. Ce n'est pas une atteinte
-- à l'isolation : la policy contrôle toujours le `shop_id`. C'est une atteinte
-- au LIVRABLE RÉEL de la phase de validation. Un vendeur peut poster des lignes
-- portant `first_content_at` et `views_count`, et le déclencheur
-- `orders_compter_commande_reelle` — posé `after insert or delete or update of
-- first_content_at` — incrémente alors `shops.commandes_reelles`. Le « signal
-- roi » du produit (plus de 15 commandes créées en une semaine) et le compteur
-- de vues deviennent fabricables sans jamais créer le moindre contenu.
--
-- Une métrique de verdict légèrement faussée est pire qu'une métrique cassée,
-- parce qu'elle reste crédible.
--
-- LES DEUX JETONS RESTENT INSÉRABLES, ET C'EST SANS DANGER : le déclencheur
-- `orders_aa_poser_jetons` (BEFORE INSERT) les ÉCRASE inconditionnellement,
-- quoi qu'on lui donne. L'immuabilité ne tient pas à ce qu'on interdise de les
-- fournir, elle tient à ce que la base les repose. On les retire quand même de
-- la liste : ce qui ne peut pas être fourni n'a pas à l'être.

revoke insert on public.orders from authenticated;

-- Les trois seules colonnes que les deux chemins de création écrivent : la
-- création d'un brouillon (`shop_id` seul) et la duplication en GABARIT
-- (`product_ref` et `internal_notes`, jamais le nom du client — envoyer une
-- page portant le pseudo d'un autre est le défaut le plus visible que ce
-- produit puisse produire).
grant insert (shop_id, product_ref, internal_notes)
  on public.orders to authenticated;
