-- 053 — Fermer les droits par défaut des TABLES et des SÉQUENCES.
--
-- DÉFAUT CONSTATÉ PAR INTERROGATION DU CATALOGUE, pas par relecture :
--
--   pg_default_acl · schema public · objtype 'r' (tables)
--     {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--
-- Toute table créée demain dans `public` naît donc avec SELECT, INSERT, UPDATE
-- et DELETE pour `anon` et pour `authenticated`. Les quinze tables actuelles
-- sont fermées — chacune porte son `revoke all` — mais la protection tient à ce
-- que quelqu'un pense à l'écrire à chaque fois.
--
-- CE N'EST PAS HYPOTHÉTIQUE : C'EST DÉJÀ ARRIVÉ. La migration 013 a créé
-- `order_media` sans `revoke all`, et la 014 existe pour rattraper. Son en-tête
-- dit exactement pourquoi le défaut est invisible : « un `grant` de colonnes
-- posé APRÈS un droit de table ne le restreint pas, il s'y ajoute ».
--
-- La migration 001 avait posé `alter default privileges` sur les FONCTIONS
-- seulement. Le même geste manquait pour les tables et les séquences — et une
-- séquence ouverte laisse lire et avancer un compteur d'identifiants.
--
-- CE QUE CETTE MIGRATION NE PEUT PAS FAIRE. `alter default privileges` ne vaut
-- que pour les objets créés PAR LE RÔLE qui l'émet. Les entrées appartenant à
-- `supabase_admin` restent ouvertes et ne sont pas modifiables ici : elles
-- concernent les objets que Supabase crée lui-même, notamment les extensions.
-- C'est la raison pour laquelle une SONDE accompagne cette migration : ce qu'on
-- ne peut pas fermer, on le surveille.

alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

-- Le même geste pour les fonctions, déjà posé en 001, est répété ici SANS
-- effet attendu : le répéter coûte une ligne et referme le cas où la 001
-- n'aurait pas porté. Un `alter default privileges` est idempotent.
alter default privileges in schema public
  revoke all on functions from anon, authenticated;
