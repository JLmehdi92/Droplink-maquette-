-- 002 — Déplacer `unaccent` hors du schéma public.
--
-- Défaut trouvé par la sonde de droits d'exécution juste après la 001 :
-- `unaccent`, `unaccent_init` et `unaccent_lexize` étaient exécutables par
-- `public`, `anon` et `authenticated`.
--
-- Cause : la 001 dit `create extension unaccent` sans préciser de schéma, donc
-- l'extension est née dans `public`. Le `alter default privileges` de la 001 ne
-- pouvait pas la fermer — il ne régit que les objets créés APRÈS son exécution,
-- et l'extension existait déjà. C'est la forme exacte de L-029 : la protection
-- tenait à une absence, pas à un droit.
--
-- Le projet a déjà un schéma `extensions` où vivent `pgcrypto`, `uuid-ossp` et
-- `pg_stat_statements`. `unaccent` était la seule à ne pas y être.
--
-- Le déplacement est fait MAINTENANT parce qu'aucun objet n'en dépend encore.
-- Dès que l'index d'expression de la recherche (lot 4) s'appuiera dessus, un
-- `set schema` deviendrait une rupture.
--
-- Conséquence à propager : toute référence ultérieure doit être qualifiée
-- `extensions.unaccent(...)`. Dans un index d'expression en particulier, une
-- référence non qualifiée dépendrait du `search_path` de la session qui
-- construit l'index — donc du hasard.
--
-- ⚠️ CE QUI PROTÈGE ICI, C'EST LE `set schema`, PAS LES `revoke`.
--
-- Constaté par interrogation du catalogue après application : les quatre
-- `revoke execute` ci-dessous n'ont RIEN révoqué. `extensions.unaccent` porte
-- toujours `anon` et `authenticated`. Cause : ces fonctions appartiennent à
-- `supabase_admin`, et la migration s'exécute en tant que `postgres`. Un REVOKE
-- émis par un non-propriétaire sans grant option est un AVERTISSEMENT, pas une
-- erreur — la migration a donc répondu « succès » en n'ayant rien fait.
--
-- C'est la forme la plus dangereuse de L-020 et L-024 : l'instruction EXISTE
-- dans le fichier, elle a l'air d'une protection, et une relecture de code la
-- comptabiliserait comme telle. Seul le catalogue dit qu'elle est vide.
--
-- Les lignes sont conservées telles qu'appliquées (la migration ne se rouvre
-- pas) mais ne doivent être créditées d'aucune protection.
--
-- La propriété réellement établie, et celle que la sonde assert :
--   AUCUNE fonction du schéma `public` n'est exécutable par `anon` ni par
--   `authenticated`.
-- Elle tient parce que PostgREST n'expose que `public` : ce qui vit dans
-- `extensions` n'est atteignable par aucun porteur de clé publiable. Sortir
-- `unaccent` de `public` l'a donc mise hors de portée, ce que le revoke aurait
-- prétendu faire sans le faire.

alter extension unaccent set schema extensions;

-- Sans effet (voir ci-dessus). Conservées parce qu'appliquées.

revoke execute on function extensions.unaccent(text) from public, anon, authenticated;
revoke execute on function extensions.unaccent(regdictionary, text) from public, anon, authenticated;
revoke execute on function extensions.unaccent_init(internal) from public, anon, authenticated;
revoke execute on function extensions.unaccent_lexize(internal, internal, internal, internal) from public, anon, authenticated;
