-- 054 — Rendre à `lire_commande_publique` le droit d'exécution qu'elle déclare.
--
-- DÉFAUT CONSTATÉ PAR INTERROGATION DU CATALOGUE :
--
--   pg_proc.proacl = {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--
-- L'entrée `=X/postgres` est un droit d'exécution accordé à **PUBLIC**. Et
-- `anon` n'y figure pas : la page publique fonctionne parce qu'elle hérite du
-- droit de PUBLIC, pas parce qu'on le lui a donné. C'est l'inverse exact de ce
-- que les migrations 017 et 035 écrivent toutes les deux.
--
-- LA CAUSE N'EST PAS DÉTERMINABLE depuis le dépôt : les deux migrations posent
-- bien le `revoke`, leur texte appliqué est identique au fichier, et aucune
-- migration ultérieure ne touche cette fonction. On ne l'invente donc pas. Ce
-- qui est certain, c'est l'ÉTAT — et qu'il est le seul de ce genre dans tout le
-- schéma : c'est la seule fonction de `public` portant un droit à PUBLIC.
--
-- POURQUOI AUCUNE SONDE NE L'A VU. Le contrôle interroge
-- `has_function_privilege('anon', …)`, qui répond `true` pour un droit accordé
-- à PUBLIC exactement comme pour un droit accordé à `anon`. La sonde interroge
-- bien un effet — mais un effet trop grossier pour distinguer « ouvert à anon »
-- de « ouvert à tout le monde ». Elle interroge désormais `proacl` et refuse
-- tout bénéficiaire PUBLIC, sans exception admise.

revoke all on function public.lire_commande_publique(text) from public;
grant execute on function public.lire_commande_publique(text) to anon;
