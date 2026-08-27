-- 102 — Le sous-titre de la liste des commandes est un CHIFFRE, pas une phrase.
--
-- POURQUOI. La planche `Commandes` écrit sous le titre « 184 commandes, 12 créées
-- cette semaine », et la planche `CommandesFiltreVide` « 184 commandes au total ».
-- Le produit y mettait une phrase fixe — « Chaque commande a sa page et son
-- lien » — qui ne dit rien que le vendeur ne sache déjà, à l'endroit exact où la
-- planche répond à la seule question qu'il se pose en arrivant : combien, et
-- combien de nouvelles.
--
-- « CRÉÉES CETTE SEMAINE » N'EST PAS DÉCORATIF. C'est le SIGNAL ROI de la phase
-- de validation, écrit noir sur blanc dans le brief §2 : « un fournisseur crée
-- plus de 15 commandes en une semaine sans relance ». Le vendeur le voit ici, et
-- nous le mesurons ailleurs — mais il vaut mieux que les deux comptent la même
-- chose.
--
-- POURQUOI DANS LA MÊME FONCTION. Elle fait déjà UN parcours des commandes non
-- archivées pour ses quatre `count(*) filter`. Deux agrégats de plus voyagent
-- dans ce parcours : ils ne coûtent ni une lecture de plus, ni un aller-retour de
-- plus. Les demander séparément aurait payé deux fois la même ligne.
--
-- ⚠️ `create or replace` NE PEUT PAS changer la table de retour d'une fonction —
-- Postgres refuse « cannot change return type of existing function ». Le `drop`
-- est donc obligatoire, et il est SANS AMBIGUÏTÉ ici : la fonction n'a aucun
-- argument, il n'existe pas de seconde surcharge à laquelle un appel pourrait se
-- résoudre en silence.

drop function if exists public.compter_commandes_par_etat();

create function public.compter_commandes_par_etat()
returns table (
  preparation bigint,
  en_transit bigint,
  jamais_ouvertes bigint,
  livrees bigint,
  total bigint,
  cette_semaine bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where o.status = 'preparation'),
    count(*) filter (where o.status = 'en_transit'),
    count(*) filter (where o.views_count = 0),
    count(*) filter (where o.status = 'livre'),
    count(*),
    -- SEPT JOURS GLISSANTS, et non « depuis lundi ». Le vendeur regarde son
    -- rythme, pas un calendrier : un compteur qui retombe à zéro chaque lundi
    -- matin annoncerait un effondrement d'activité tous les sept jours.
    count(*) filter (where o.created_at >= now() - interval '7 days')
  from public.orders o
  where o.archived_at is null;
$$;

comment on function public.compter_commandes_par_etat() is
  'Les compteurs de tête de la liste des commandes — les quatre cartes ET le sous-titre — lus SOUS RLS : la fonction ne voit que les commandes de son appelant.';

-- POSTGRES ACCORDE `EXECUTE` À `PUBLIC` PAR DÉFAUT, et le `drop` ci-dessus a
-- emporté les droits posés par la 084 avec l'ancienne fonction. Sans ces deux
-- lignes, la nouvelle naîtrait ouverte à `anon` — et le seul indice serait dans
-- le catalogue, jamais dans le corps de la fonction.
revoke all on function public.compter_commandes_par_etat() from public;
grant execute on function public.compter_commandes_par_etat() to authenticated;
