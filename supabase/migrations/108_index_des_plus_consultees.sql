-- 108 — L'INDEX DU CLASSEMENT PAR CONSULTATIONS.
--
-- POURQUOI. La planche `Analyses` ferme l'écran sur « Vos commandes les plus
-- consultées » : trois lignes, triées par nombre de vues. Trois lignes rendues,
-- mais un tri qui porte sur TOUTES les commandes du vendeur — c'est la forme
-- exacte du piège de la pagination par décalage : le coût ne dépend pas de ce
-- qui est affiché, il dépend de ce qui est trié. Chez un vendeur à neuf mille
-- six cents commandes, sans index, la base lit tout pour en garder trois.
--
-- POURQUOI PARTIEL SUR `views_count > 0`. Une commande jamais ouverte ne peut
-- pas figurer dans un classement des plus consultées : elle est exclue par la
-- question elle-même, pas par un filtre d'affichage. Et c'est le cas majoritaire
-- au début de vie d'un compte, donc la partie exclue est la plus grosse. L'index
-- reste petit, et il ne coûte rien aux écritures qui n'y entrent jamais.
--
-- ⚠️ `first_content_at is not null` EST DANS LA CONDITION PARTIELLE, parce qu'il
-- est dans la requête. Un prédicat de la requête absent de l'index partiel
-- oblige Postgres à revenir à la table pour le vérifier ; un prédicat de l'index
-- absent de la requête empêche purement et simplement de s'en servir. Les deux
-- doivent se correspondre, et c'est le genre de désaccord qu'aucune relecture ne
-- voit — le plan change, le résultat non.
--
-- ⚠️ LE TRI SECONDAIRE FAIT PARTIE DE L'INDEX. À égalité de vues — deux
-- commandes à trois consultations, cas courant —, l'ordre serait autrement celui
-- que la base renvoie, c'est-à-dire aucun ordre : le classement changerait d'un
-- rafraîchissement à l'autre sans qu'aucune donnée ait bougé.

create index orders_plus_consultees_idx
  on public.orders (shop_id, views_count desc, created_at desc)
  where views_count > 0 and first_content_at is not null;
