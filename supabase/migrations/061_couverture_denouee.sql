-- 061 — La couverture d'une commande ne survit pas au média qu'elle désigne.
--
-- DÉFAUT ÉTABLI PAR EXÉCUTION, SOUS LE RÔLE ET LES DROITS RÉELS DU VENDEUR —
-- c'est le seul des défauts d'invariant qui soit atteignable par un vendeur
-- ordinaire, sans privilège particulier :
--
--   delete from order_media where id = <la couverture>
--     → pointeur_reste = true, cible_existe = 0
--
-- La commande garde un pointeur vers un média qui n'existe plus. Rien en base
-- ne le rattrape : seule la Server Action qui supprime peut y penser, donc le
-- prochain chemin de suppression — une suppression groupée, une purge, un
-- import — le refera.
--
-- LA RÈGLE EXISTAIT POURTANT, ET REGARDAIT DU MAUVAIS CÔTÉ. `verifier_couverture`
-- refuse très correctement, à l'UPDATE de `orders`, une couverture qui désigne
-- le média d'une autre commande (DL028). Elle surveille la commande ; personne
-- ne surveillait le média. C'est L-025 : le garde a le champ de vision de la
-- correction, pas du problème.
--
-- `ON DELETE SET NULL` PLUTÔT QU'UN DÉCLENCHEUR : la suppression dénoue la
-- couverture, et la commande retombe sur son premier média — l'état exact
-- qu'elle avait avant qu'on choisisse une couverture. Une contrainte ne peut
-- pas être oubliée dans un nouveau chemin de code ; un déclencheur non plus,
-- mais la contrainte dit AUSSI l'intention à qui lit le schéma.

alter table public.orders
  add constraint orders_cover_media_id_fkey
  foreign key (cover_media_id) references public.order_media (id)
  on delete set null;
