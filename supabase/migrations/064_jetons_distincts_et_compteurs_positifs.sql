-- 064 — « Un jeton, un pouvoir » devient une contrainte, et les compteurs
--       ne peuvent plus devenir négatifs.
--
-- LES DEUX JETONS POUVAIENT DEVENIR ÉGAUX. Établi par exécution : avec le
-- drapeau de rotation posé, `update orders set unsubscribe_token = public_token`
-- passe, et l'on obtient `public_token = unsubscribe_token`. Sans le drapeau
-- c'est refusé — mais par l'IMMUABILITÉ, pas par une règle d'inégalité. Le
-- catalogue confirmait qu'aucune contrainte de la forme
-- `public_token <> unsubscribe_token` n'existait.
--
-- POURQUOI ÇA COMPTE. Le jeton de désinscription circule dans des EMAILS, donc
-- chez le destinataire, et sur des chemins qu'on ne maîtrise pas. Le rendre
-- égal au jeton public transformerait un lien « je ne veux plus de messages »
-- en lien d'accès complet à la commande — définitivement, le jeton public étant
-- immuable à vie. Le principe reposait entièrement sur le fait que
-- `regenerer_jeton_public` appelle le générateur DEUX fois. Une migration
-- future qui l'écrirait autrement ne serait refusée par rien.
--
-- LES COMPTEURS SANS PLANCHER. `shops` en avait un, `orders.views_count` non,
-- et `usage_counters` seulement sur `tracking_api_calls`. Un `CHECK >= 0` ne
-- rend pas un compteur juste — il rend une divergence VISIBLE. Sans lui, un
-- décrément de trop passe inaperçu et la métrique reste crédible en étant
-- fausse, ce qui est pire qu'un compteur cassé.

alter table public.orders
  add constraint orders_jetons_distincts
  check (public_token <> unsubscribe_token);

alter table public.orders
  add constraint orders_views_count_positif
  check (views_count >= 0);

alter table public.usage_counters
  add constraint usage_counters_positifs
  check (
    parcels_registered >= 0
    and orders_created >= 0
    and media_count >= 0
    and (storage_bytes is null or storage_bytes >= 0)
  );
