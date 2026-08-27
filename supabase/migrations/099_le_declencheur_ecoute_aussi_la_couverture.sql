-- 099 — LE DÉCLENCHEUR DE CLÉS ÉCOUTE AUSSI LA COUVERTURE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE TROU, TROUVÉ PAR UN TEST QUI VOULAIT PROUVER LE CONTRAIRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Les 097 et 098 ont appris à `verifier_cles_media()` à contrôler que
-- `cle_couverture` est bien DÉRIVÉE de `cle`. Le corps de la fonction était
-- juste. Le DÉCLENCHEUR, lui, était resté :
--
--     BEFORE INSERT OR UPDATE OF cle, cle_vignette
--
-- Une liste de colonnes, écrite avant que `cle_couverture` existe. Un UPDATE ne
-- touchant QUE `cle_couverture` ne réveillait donc personne : le contrôle était
-- écrit, appelé nulle part sur ce chemin, et la relecture du corps de la
-- fonction ne pouvait pas le voir — la garde n'est pas dans le corps, elle est
-- dans l'attache.
--
-- ⚠️ CE N'ÉTAIT PAS EXPLOITABLE, ET C'EST PRÉCISÉMENT LE PROBLÈME. La 098
-- n'accorde délibérément que `insert (cle_couverture)`, jamais `update` : aucun
-- vendeur ne peut donc réécrire cette colonne aujourd'hui. La phrase juste était
-- « ce serait ouvert si quelqu'un accordait l'UPDATE » — c'est-à-dire une
-- protection qui tient à une ABSENCE, donc pas une protection (L-029). Le jour
-- où un chemin légitime demanderait ce droit, la garde serait déjà tombée, et
-- personne n'aurait de raison d'aller regarder l'attache d'un déclencheur.
--
-- Ce que cela aurait coûté : une clé de couverture pointant sous le préfixe d'un
-- AUTRE vendeur, donc la photo d'un autre affichée en grand sur sa page
-- publique. La RLS ne l'aurait pas vu — la ligne appartient bien à l'appelant,
-- c'est sa VALEUR qui désigne autre chose.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- UN DÉCLENCHEUR NE SE REMPLACE PAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Il n'existe pas de `create or replace trigger` en Postgres 17 pour changer la
-- liste de colonnes : il faut le retirer puis le reposer. La fonction, elle, ne
-- bouge pas — c'est bien l'attache qui était fausse, pas le contrôle.
drop trigger order_media_cles_par_valeur on public.order_media;

create trigger order_media_cles_par_valeur
  before insert or update of cle, cle_vignette, cle_couverture
  on public.order_media
  for each row
  execute function public.verifier_cles_media();

comment on trigger order_media_cles_par_valeur on public.order_media is
  'Contrôle PAR VALEUR les trois clés d''un média. La liste de colonnes doit '
  'énumérer TOUTE clé contrôlée par la fonction : une colonne oubliée ici rend '
  'le contrôle muet sur son chemin, sans que le corps de la fonction le dise.';
