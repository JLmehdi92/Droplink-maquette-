-- 079 — LES DEUX FONCTIONS DE PLAFOND NAISSAIENT EXÉCUTABLES PAR PUBLIC.
--
-- Postgres accorde `EXECUTE` à `PUBLIC` par défaut, et je l'ai oublié dans la
-- migration précédente — la même migration qui pose les plafonds censés protéger
-- le seul poste de coût du produit. C'est la sonde de catalogue qui l'a fait
-- lever, pas une relecture : UN DROIT D'EXÉCUTION NE S'ÉCRIT PAS DANS LE CORPS
-- D'UNE FONCTION, donc aucune relecture de code ne peut le voir.
--
-- La 053 pose bien `alter default privileges ... revoke ... on functions`, mais
-- elle vise `anon` et `authenticated` NOMMÉMENT. Le défaut accordé à `PUBLIC`
-- n'en fait pas partie, et il est plus large que les deux : il vaut pour tout
-- rôle présent ET futur. C'est aussi ce qui rend la sonde par
-- `has_function_privilege('anon', …)` insuffisante — elle répond « oui » sans
-- distinguer un droit donné à `anon` d'un droit donné à tout le monde.
--
-- Ces deux-là sont des fonctions de DÉCLENCHEUR : les appeler directement ne
-- donne rien d'utile, puisqu'elles lisent `new`. L'exposition n'était donc pas
-- exploitable en l'état. Elle reste à fermer : une protection qui tient à ce
-- qu'une fonction soit inutile à appeler n'est pas une protection, c'est une
-- circonstance.

revoke all on function public.verifier_plafond_commandes() from public, anon, authenticated;
revoke all on function public.verifier_plafond_stockage() from public, anon, authenticated;
