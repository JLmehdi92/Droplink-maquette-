-- ═══════════════════════════════════════════════════════════════════════════
-- LE TRI « MODIFIÉES » N'AVAIT AUCUN INDEX
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DÉFAUT TROUVÉ À L'AUDIT DU 26/08/2026, et c'est LITTÉRALEMENT le piège que le
-- brief nomme : « index sur (shop_id, created_at), (shop_id, status), ET SUR LE
-- TRI PAR DÉFAUT — facile à oublier, invisible à faible volumétrie ».
--
-- La migration 011 l'a corrigé pour `created_at`, en remplaçant l'index unique
-- par deux index partiels. Le tri « modifiées », lui, ordonne par `updated_at`,
-- et AUCUN des sept index d'`orders` ne porte cette colonne :
--
--   orders_statut_idx             (shop_id, status, created_at desc)
--   orders_qc_idx                 (shop_id, qc_status, created_at desc)
--   orders_suivi_idx              (shop_id, tracking_number)          partiel
--   orders_recherche_idx          (shop_id, recherche text_pattern_ops)
--   orders_actives_recentes_idx   (shop_id, created_at desc, id desc) partiel
--   orders_archivees_recentes_idx (shop_id, created_at desc, id desc) partiel
--   orders_jamais_ouvert_idx      (shop_id, created_at desc, id desc) partiel
--
-- CE QUE ÇA COÛTE, ET POURQUOI ÇA EMPIRE AVEC LE NUMÉRO DE PAGE.
--
-- Sans index sur la colonne de tri, le plan est `Limit ← Sort (top-N) ← Index
-- Scan (shop_id)` : Postgres lit TOUTES les commandes du vendeur pour en rendre
-- cinquante. À 9 600 commandes, c'est 9 600 lignes lues par page.
--
-- Et surtout, la comparaison de couple du curseur — `(updated_at, id) < (…, …)`
-- — ne peut pas devenir une BORNE d'index : elle reste un filtre appliqué après
-- lecture. Le commentaire de `liste.ts` promet que « le coût ne croît pas avec
-- le numéro de page » ; c'est vrai pour les trois tris servis par un index
-- partiel, et FAUX pour celui-ci. Une promesse tenue à 75 %, invisible tant que
-- personne n'a beaucoup de données — donc invisible jusqu'au jour où elle
-- gênerait celui qu'on veut le plus garder.
--
-- POURQUOI DEUX INDEX PARTIELS ET NON UN SEUL.
--
-- On suit exactement le motif de la 011, et pour la même raison : l'écran filtre
-- toujours sur `archived_at`, dans un sens ou dans l'autre. Un index complet
-- porterait les lignes des deux vues, obligeant à en lire puis à en rejeter la
-- moitié ; deux index partiels ne couvrent chacun que leur vue, et leur somme
-- est plus petite que l'index unique qu'ils remplaceraient.
--
-- `id desc` termine la clé pour que le curseur soit TOTAL : deux commandes
-- modifiées dans la même milliseconde doivent avoir un ordre stable, sinon une
-- page saute ou répète une ligne. C'est la même raison qu'en 011, et elle vaut
-- doublement ici : `updated_at` bouge à chaque sauvegarde automatique, donc les
-- ex æquo y sont bien plus fréquents que sur `created_at`.

create index orders_actives_modifiees_idx
  on public.orders (shop_id, updated_at desc, id desc)
  where archived_at is null;

create index orders_archivees_modifiees_idx
  on public.orders (shop_id, updated_at desc, id desc)
  where archived_at is not null;

comment on index public.orders_actives_modifiees_idx is
  'Tri « modifiées » de la vue active. Sans lui, le curseur ne borne pas '
  'l''index et le coût croît avec le numéro de page.';

comment on index public.orders_archivees_modifiees_idx is
  'Même tri pour la vue archivée. Séparé pour la même raison qu''en 011 : '
  'l''écran filtre toujours sur archived_at.';
