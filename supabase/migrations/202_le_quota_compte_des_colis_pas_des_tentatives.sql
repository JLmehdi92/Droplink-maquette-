-- 202 — LE QUOTA COMPTE DES COLIS, PAS DES TENTATIVES.
--
-- ── LE DÉFAUT, TROUVÉ PAR LA RELECTURE ECC DU 27/09/2026 ─────────────────────
-- Depuis la 198, le quota de colis se compte sur une consommation qui ne
-- redescend jamais, incrémentée par le déclencheur `tracked_parcels_plafond`.
-- Ce déclencheur est BEFORE INSERT (125). Or `attacher_colis` (172) écrit par
-- `insert … on conflict (shop_id, tracking_number) do update`, à CHAQUE
-- sauvegarde du numéro OU du transporteur — et Postgres exécute un déclencheur
-- BEFORE INSERT pour chaque ligne PROPOSÉE, avant de savoir qu'elle finira en
-- mise à jour.
--
-- Mesuré sur la base de tests : UN colis réel, TROIS colis consommés après deux
-- changements de transporteur. Pire : à 15/15, préciser le transporteur d'un
-- colis EXISTANT était refusé (DL070) — alors que c'est le seul geste qui
-- relance le suivi d'un numéro que le fournisseur n'a pas reconnu (164).
-- Avant la 198, le comptage `count(*)` ne voyait pas ce défaut : une mise à jour
-- ne change pas le nombre de lignes.
--
-- ── LE REMÈDE ───────────────────────────────────────────────────────────────
-- Le même déclencheur, en AFTER INSERT. Postgres ne l'exécute que pour une ligne
-- RÉELLEMENT insérée : la branche `do update` d'un conflit déclenche les
-- déclencheurs de mise à jour, pas celui-ci. Et il refuse toujours : une
-- exception levée après l'insertion annule l'instruction entière, colis compris.
--
-- La fonction `verifier_plafond_colis` (201) ne change pas : garde anti-oracle,
-- verrou consultatif pris avant le comptage, règle du plan. Sa valeur de retour
-- est ignorée en AFTER — elle rendait déjà `new`, sans jamais le modifier.
--
-- Les COMMANDES ne sont pas concernées : aucune insertion dans `orders` ne passe
-- par `on conflict` (la duplication crée une commande neuve, qui compte).

drop trigger if exists tracked_parcels_plafond on public.tracked_parcels;

create trigger tracked_parcels_plafond
  after insert on public.tracked_parcels
  for each row execute function public.verifier_plafond_colis();

comment on trigger tracked_parcels_plafond on public.tracked_parcels is
  'Quota de colis (verifier_plafond_colis). AFTER INSERT et non BEFORE (202) : un BEFORE INSERT se déclenche aussi pour les lignes que `on conflict do update` transforme en mise à jour, et chaque changement de transporteur consommait un colis. En AFTER, seule une ligne réellement créée compte, et le refus annule toujours l''insertion.';
