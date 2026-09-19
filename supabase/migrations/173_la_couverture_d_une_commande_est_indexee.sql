-- 173 — LA COUVERTURE D'UNE COMMANDE EST INDEXÉE.
--
-- Audit du 20/09/2026. `orders.cover_media_id` référence `order_media` avec
-- `on delete set null`, sans aucun index : retirer UNE photo faisait balayer TOUTES les
-- commandes de la plateforme pour trouver celles dont c'était la couverture (EXPLAIN relevé
-- sur la base de tests : Seq Scan, 19 200 lignes). Le coût d'un geste de vendeur croissait
-- avec le volume de tous les vendeurs réunis.
--
-- PARTIEL : la colonne est vide sur la plupart des commandes, et un index ne sert qu'à
-- retrouver celles qui pointent vers une photo. `tests/rls/index-des-cles.test.ts` exige
-- désormais un index sur toute clé étrangère de `public`, sauf exception déclarée.

create index orders_cover_media_id_idx
  on public.orders (cover_media_id)
  where cover_media_id is not null;
