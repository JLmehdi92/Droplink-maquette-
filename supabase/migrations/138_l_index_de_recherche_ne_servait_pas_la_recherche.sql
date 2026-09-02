/*
 * L'INDEX DE RECHERCHE NE POUVAIT PAS SERVIR LA REQUÊTE QUE LE PRODUIT ENVOIE.
 *
 * `orders_recherche_idx` est un B-tree en `text_pattern_ops`, qui n'aide qu'un
 * motif ANCRÉ À GAUCHE — `like 'creme%'`. Le dashboard, lui, envoie
 * `like '%creme%'` : un joker des deux côtés, parce qu'on cherche un mot au
 * milieu d'un libellé de client ou d'une référence produit.
 *
 * MESURÉ AU PLAFOND DU BRIEF, sur un jeu amorcé pour l'occasion — 9 600
 * commandes, et un COMPTE VOISIN de même volumétrie, sans quoi une requête peut
 * sembler rapide sur une base mono-compte et s'effondrer dès que l'isolation
 * filtre réellement :
 *
 *   like '%creme%'  →  Seq Scan · 439 blocs · 14 383 lignes écartées par filtre
 *   like 'creme%'   →  Index Scan · 3 blocs        (contre-épreuve)
 *
 * L'index de 22 Mo — le deuxième plus gros du schéma — était donc payé en
 * écriture et en `VACUUM` sans rendre le service pour lequel `CLAUDE.md` et le
 * brief §10 le réclament. Et le contre-test montre qu'il fonctionne : c'est bien
 * la FORME de la requête qui ne lui correspond pas.
 *
 * ⚠️ ET AUCUNE PORTE NE POUVAIT LE VOIR. `index-attendus` DÉRIVE son inventaire
 * des migrations : il certifie la PRÉSENCE de cet index et le déclarerait
 * conforme à jamais — le fichier le dit lui-même, « un index présent et
 * inutilisé passerait ici sans rien prouver, et c'est assumé ». Le seul
 * détecteur restant était `test:perf`, qui n'est pas dans les six portes.
 *
 * CE QUE CET INDEX CHANGE, mesuré après rodage jeté puis DEUX séries
 * concordantes de cinq exécutions :
 *
 *   AVEC  : 63 blocs · 0,214 à 0,295 ms   (Bitmap Index Scan, 98 candidates)
 *   SANS  : 439 blocs · 4,077 à 4,231 ms  (Seq Scan, 14 383 écartées)
 *
 * Le gain n'est pas le chronomètre — il est dans le nombre de lignes EXAMINÉES,
 * qui est la seule chose qui croît avec la volumétrie du vendeur.
 *
 * ⚠️ `shop_id` EST DANS L'INDEX, et c'est ce qui exige `btree_gin` : un GIN
 * trigramme seul sur `recherche` ferait remonter les candidates de TOUS les
 * vendeurs avant de les filtrer. L'isolation doit être dans l'index, pas
 * après lui.
 *
 * ⚠️ LES DEUX EXTENSIONS VONT DANS `extensions`, JAMAIS DANS `public`. Le
 * schéma `public` est celui que le `search_path` vide des fonctions
 * `security definer` exclut délibérément ; y poser une extension y ferait naître
 * des objets que ces fonctions ne verraient pas, et qu'un rôle applicatif
 * verrait. `unaccent` y est déjà, pour la même raison.
 *
 * L'ANCIEN INDEX EST CONSERVÉ. Il sert les tris et les comparaisons ancrées, il
 * porte `shop_id` en tête, et le supprimer ferait rougir `index-attendus`, qui
 * le dérive des migrations. Le remplacer serait un second sujet.
 */

create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gin with schema extensions;

/*
 * `concurrently` est volontairement ABSENT : il ne peut pas s'exécuter dans une
 * transaction, et le lanceur de migrations en ouvre une. Sur une table de
 * quelques milliers de lignes, la construction se compte en centaines de
 * millisecondes ; le jour où la volumétrie l'exigera, ce sera une migration
 * dédiée, hors transaction.
 */
create index if not exists orders_recherche_trgm_idx
  on public.orders
  using gin (shop_id, recherche extensions.gin_trgm_ops);

comment on index public.orders_recherche_trgm_idx is
  'Recherche du dashboard : `like ''%mot%''`, joker des DEUX côtés. Le B-tree `text_pattern_ops` voisin n''aide qu''un motif ancré à gauche — mesuré au plafond de 9 600 commandes : 439 blocs et 14 383 lignes écartées, contre 63 blocs ici. `shop_id` est dans l''index (d''où `btree_gin`) pour que l''isolation filtre AVANT la remontée des candidates.';
