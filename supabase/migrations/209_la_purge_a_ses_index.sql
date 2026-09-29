-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LA PURGE DES DURÉES A SES INDEX — audit ECC du 29/09/2026                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- `purger_donnees_expirees` (206) passe tous les quarts d'heure et filtre trois
-- colonnes : `link_views.viewed_at` (13 mois), `notification_requests.expires_at`
-- (24 h) et `payment_events.received_at` (3 ans). Aucun index ne COMMENÇAIT par
-- l'une d'elles : `link_views_order_idx` et `link_views_jour_idx` ont `order_id`
-- en tête (018, 146), `notification_requests_order` aussi (188), et
-- `payment_events` n'avait que sa clé et `profile_id` (179). Chaque passage lisait
-- donc les trois tables en entier — et `link_views` est la plus grosse du
-- produit, une ligne par ouverture de lien.
--
-- `tests/rls/rgpd-conservation.test.ts` interroge le catalogue et a rougi sur les
-- trois avant cette migration.
--
-- Pas de `concurrently` : l'outil applique chaque migration dans une transaction,
-- où il est interdit. Aux volumes actuels, le verrou d'écriture dure une fraction
-- de seconde.

create index if not exists link_views_viewed_at_idx
  on public.link_views (viewed_at);

create index if not exists notification_requests_expires_at_idx
  on public.notification_requests (expires_at);

create index if not exists payment_events_received_at_idx
  on public.payment_events (received_at);
