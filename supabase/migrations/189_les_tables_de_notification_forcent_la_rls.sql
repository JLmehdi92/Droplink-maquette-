-- 189 — LES DEUX TABLES DE NOTIFICATION FORCENT LA RLS.
--
-- La 188 l'avait ACTIVÉE sur `notification_requests` et `notifications_sent`,
-- sans la FORCER : le propriétaire de la table la contournait. Toute table de ce
-- schéma est activée ET forcée ; la garde du catalogue (sonde A) l'a relevé.
--
-- Aucune policy, et c'est le mécanisme : ces tables ne sont atteintes que par les
-- fonctions `security definer` de la 188, réservées au rôle de service. Un
-- vendeur y lirait les adresses des clients des autres ; personne n'a à les lire.
--
-- La 188 n'est pas rouverte : elle est appliquée, et une migration appliquée ne
-- se réécrit jamais.

alter table public.notification_requests force row level security;
alter table public.notifications_sent force row level security;
