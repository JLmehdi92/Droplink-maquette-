-- 187 — LE NIVEAU DE LA SESSION SE LIT SANS DROIT D'EXÉCUTION OUVERT.
--
-- La 186 a ouvert `session_double_facteur()` à `authenticated`. Ce n'était pas
-- nécessaire : elle n'est appelée que depuis `est_admin()` et
-- `journaliser_admin()`, toutes deux `security definer`, qui l'exécutent avec les
-- droits de leur propriétaire. Un droit ouvert sans appelant qui en a besoin est
-- une surface de plus que rien ne justifie — c'est la garde du catalogue
-- (`tests/rls/catalogue.test.ts`, sonde B) qui l'a relevé.
--
-- La 186 n'est pas rouverte : elle est appliquée (base de tests), et une
-- migration appliquée ne se réécrit jamais.

revoke execute on function public.session_double_facteur() from authenticated;
