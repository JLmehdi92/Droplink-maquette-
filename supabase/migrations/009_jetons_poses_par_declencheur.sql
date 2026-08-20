-- 009 — Les jetons sont posés par un DÉCLENCHEUR, plus par un défaut de colonne.
--
-- DÉFAUT DE LA 006, attrapé par les tests : un défaut de colonne est évalué avec
-- les privilèges du rôle QUI INSÈRE. `generer_jeton_public()` ayant son droit
-- d'exécution retiré à `authenticated`, toute création de commande échouait sur
-- « permission denied for function ». La table était inutilisable.
--
-- Le remède évident aurait été d'accorder le droit d'exécution. Le déclencheur
-- fait mieux, et pour une raison qui n'a rien à voir avec le défaut d'origine :
--
--   un défaut de colonne ne s'applique QUE si le client ne fournit pas de
--   valeur. Aujourd'hui `public_token` n'est pas dans les colonnes accordées à
--   `authenticated`, donc personne ne peut en fournir — mais c'est une
--   protection qui tient à une ABSENCE. Le jour où un `grant` serait ajouté, ou
--   un chemin passerait par le rôle service, un client pourrait CHOISIR son
--   jeton, donc en choisir un devinable, ou reprendre celui d'un autre.
--
-- Le déclencheur écrase la valeur à l'insertion, quoi qu'on lui donne. Le jeton
-- devient une propriété de la base, pas une valeur qu'on veut bien lui laisser
-- calculer.

create function public.poser_jetons()
  returns trigger
  language plpgsql
  -- `security definer` : le déclencheur s'exécute alors avec les droits de son
  -- propriétaire, ce qui lui donne accès au générateur sans qu'aucun rôle client
  -- n'ait besoin de pouvoir l'appeler.
  security definer
  set search_path = ''
as $$
begin
  new.public_token := public.generer_jeton_public();
  new.unsubscribe_token := public.generer_jeton_public();
  return new;
end;
$$;

revoke execute on function public.poser_jetons() from public, anon, authenticated;

-- Le déclencheur doit tourner AVANT celui qui marque le premier contenu ? Non :
-- ils sont indépendants, mais l'ordre d'exécution de deux déclencheurs `before`
-- suit l'ordre alphabétique de leur nom. Celui-ci est nommé pour passer en
-- premier, de sorte qu'un déclencheur ajouté plus tard et qui lirait le jeton
-- le trouve déjà posé.
create trigger orders_aa_poser_jetons
  before insert on public.orders
  for each row execute function public.poser_jetons();

-- Les défauts de colonne deviennent inutiles. On les retire plutôt que de les
-- laisser : un défaut qui n'est jamais employé finit par être cru actif, et
-- quelqu'un s'appuierait dessus après avoir retiré le déclencheur.
alter table public.orders alter column public_token drop default;
alter table public.orders alter column unsubscribe_token drop default;
