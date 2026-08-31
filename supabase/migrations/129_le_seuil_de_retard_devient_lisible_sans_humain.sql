-- ═══════════════════════════════════════════════════════════════════════════
-- LE SEUIL DE RETARD DEVIENT LISIBLE SANS HUMAIN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La veille mutuelle posée par la migration 128 doit comparer un silence à un
-- SEUIL. Ce seuil existe déjà, il est réglable depuis l'écran d'administration
-- (`retard_veilleur_minutes`, borné par `parametres_admis` depuis la 087) — mais
-- il n'est lisible que par `lire_parametre_entier`, qui commence par
-- `est_admin()`.
--
-- UN PLANIFICATEUR N'EST PERSONNE. C'est la distinction même entre `admin.ts` et
-- `system.ts` : le client admin impose un audit parce qu'un HUMAIN y lit les
-- données d'un tiers ; un veilleur n'en lit aucune. Lui ouvrir la fonction
-- admin, ou l'auditer, percerait cette séparation pour économiser dix lignes.
--
-- ⚠️ CE QU'ON ÉVITE EN NE PRENANT AUCUN ARGUMENT.
--
-- La tentation était d'écrire `lire_seuil_systeme(p_cle, p_defaut)`, générique.
-- La migration 117 a déjà tranché cette question et sa raison vaut ici mot pour
-- mot : « sans argument, à dessein : `lire_parametre_entier` prend une clé et
-- servirait d'ORACLE D'EXISTENCE sur n'importe quelle clé devinée ». Une
-- fonction qui répond différemment selon qu'une clé existe ou non renseigne sur
-- le contenu de `system_settings` sans jamais le lire.
--
-- ⚠️ ET POURQUOI LE DÉFAUT EST ÉCRIT ICI, EN DUR, À 90.
--
-- Il vaut exactement `RETARD_VEILLEUR_MINUTES_DEFAUT` côté TypeScript, et c'est
-- une duplication ASSUMÉE plutôt que subie : la valeur est comparée dans les
-- deux sens par la suite `parametres.test.ts`, qui échoue si l'une des deux
-- bouge sans l'autre. Faire venir le défaut de l'appel — comme le fait
-- `lire_parametre_entier` — donnerait à un appelant machine le pouvoir de
-- choisir son propre seuil d'alerte, ce qui est précisément ce qu'un seuil ne
-- doit pas être.
--
-- Une ligne absente reste un état NORMAL : « jamais réglé », pas « cassé ».

create function public.lire_retard_veilleur_minutes()
  returns int
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_valeur int;
begin
  select (s.value #>> '{}')::int into v_valeur
  from public.system_settings s
  where s.key = 'retard_veilleur_minutes';

  -- Bornes reprises de `parametres_admis` : une valeur écrite hors bornes avant
  -- que l'inventaire n'existe ne doit pas produire un veilleur qui n'alerte
  -- jamais (seuil énorme) ni qui alerte toujours (seuil nul).
  return least(greatest(coalesce(v_valeur, 90), 5), 10080);
end;
$$;

comment on function public.lire_retard_veilleur_minutes() is
  'Le seuil de retard du veilleur, lisible par une tâche qui tourne sans humain. Sans argument, à dessein : une fonction qui prend une clé sert d''oracle d''existence. Défaut 90, aligné sur RETARD_VEILLEUR_MINUTES_DEFAUT.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin.
revoke execute on function public.lire_retard_veilleur_minutes() from public, anon, authenticated;
grant execute on function public.lire_retard_veilleur_minutes() to service_role;
