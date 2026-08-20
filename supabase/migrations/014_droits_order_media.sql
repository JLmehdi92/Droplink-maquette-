-- 014 — Refermer les droits par défaut sur `order_media`.
--
-- DÉFAUT TROUVÉ PAR EXÉCUTION : `taille_octets` et `cle` étaient réécrivables
-- par n'importe quel vendeur, sur ses propres médias.
--
-- La migration 013 énumérait pourtant les colonnes modifiables :
--   grant update (position, cle_vignette, largeur, hauteur, duree_s) ...
-- Elle n'ajoutait RIEN. Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon`
-- et `authenticated` sur toute table du schéma `public`, par défaut. Un
-- `grant` de colonnes posé APRÈS un droit de table ne le restreint pas : il
-- s'y ajoute. Le fichier de migration, lui, décrit une intention parfaitement
-- correcte — c'est ce qui rend le défaut invisible à la relecture.
--
-- La migration 006 avait fait le geste juste sur `orders` (`revoke all` avant
-- les `grant`). Il manquait ici.
--
-- Conséquences si ce trou était resté :
--   `taille_octets` fonde le MODÈLE DE COÛT. Un vendeur pouvait déclarer un
--   média de 80 Mo comme pesant un octet, sans jamais toucher au fichier — donc
--   sans qu'aucun compteur d'usage ne bouge.
--   `cle` désigne l'objet dans le stockage. La faire pointer sur le préfixe d'un
--   AUTRE vendeur affichait le média de cet autre vendeur sur sa propre page
--   publique. La RLS ne l'aurait pas vu : la ligne appartient bien à l'appelant,
--   c'est sa VALEUR qui désigne autre chose.

revoke all on public.order_media from anon, authenticated;

grant select, insert, delete on public.order_media to authenticated;

-- `taille_octets`, `cle`, `type`, `order_id`, `source` et `created_at` sont
-- volontairement absentes : elles sont écrites UNE FOIS, à l'insertion, avec des
-- valeurs que le serveur a établies lui-même.
grant update (position, cle_vignette, largeur, hauteur, duree_s)
  on public.order_media to authenticated;
