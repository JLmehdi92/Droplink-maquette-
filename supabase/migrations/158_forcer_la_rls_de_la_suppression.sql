/*
 * FORCER LA RLS DES DEUX TABLES DE LA MIGRATION 157.
 *
 * La 157 l'activait sans la FORCER, et `tests/rls/catalogue.test.ts` l'a refusé :
 * une RLS seulement activée ne s'applique pas au PROPRIÉTAIRE de la table. Ces
 * deux tables n'ont aucune policy par construction — conservation d'un an et
 * file de purge ne s'atteignent que par les fonctions de la 157 —, et c'est
 * `force` qui garantit qu'aucun rôle, pas même le propriétaire hors de ces
 * fonctions, ne les lit par une requête ordinaire.
 *
 * Une migration de plus plutôt que la 157 rouverte : elle est déjà appliquée à la
 * base de tests, et un fichier modifié après application fait diverger les
 * environnements sans que rien ne le dise.
 */
alter table public.comptes_supprimes force row level security;
alter table public.purges_r2 force row level security;
