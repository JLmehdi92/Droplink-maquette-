-- 022 — RLS FORCÉE sur `link_views`.
--
-- Défaut trouvé par la sonde d'inventaire du catalogue, pas par une relecture :
-- la migration 018 active la RLS mais ne la FORCE pas. Aucune relecture du
-- fichier ne l'aurait vu, parce qu'il n'y a rien à voir — c'est une ligne
-- ABSENTE. Une sonde qui rend TOUTES les tables et laisse le test déclarer ses
-- exceptions le voit, une sonde qui vérifie les tables auxquelles son auteur a
-- pensé ne le voit pas.
--
-- CE QUE « FORCÉE » AJOUTE : sans elle, le propriétaire de la table échappe à
-- ses propres policies. Ce n'est pas théorique ici — l'écriture des vues passe
-- par une fonction `security definer`, donc précisément par le propriétaire. La
-- RLS non forcée ne protégeait donc pas le seul chemin d'écriture qui existe.

alter table public.link_views force row level security;
