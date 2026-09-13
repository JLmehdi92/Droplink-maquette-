/*
 * « DONT N SANS TYPE » AVAIT REPERDU SA BORNE.
 *
 * CE QUE C'EST. La migration 137 avait corrigé exactement ce défaut : sur
 * l'écran, « Comptes actifs : 12 — dont 10 sans type » faisait dire « dont » à
 * propos de comptes qui ne sont PAS dans le total annoncé, puisque le compteur
 * parcourait toute la table, suspendus compris. Elle avait donc borné le calcul
 * aux comptes actifs.
 *
 * ⚠️ ET LA 148 L'A DÉFAIT, SANS QUE RIEN NE LE DISE. Elle devait ajouter deux
 * colonnes (`boutiques`, `boutiques_nommees`), ce qui impose un `drop` puis un
 * `create` — `create or replace` ne peut pas changer la table de retour. En
 * réécrivant le corps, le `and status = 'active'` de la ligne des sans-type
 * n'a pas été recopié. Aucune erreur, aucun type différent, un chiffre
 * simplement plus grand.
 *
 * CE QUI L'A ATTRAPÉ, et c'est le point : `tests/rls/panneau-admin.test.ts`
 * compare le compteur à la requête qu'il PRÉTEND décrire, et non à une valeur
 * écrite d'avance. Un test qui aurait figé « 2 » serait passé au vert le jour où
 * le jeu de mesure change ; celui-là échoue sur la PROMESSE du mot « dont ».
 *
 * ⚠️ LEÇON POUR LA PROCHAINE RÉÉCRITURE DE FONCTION : une migration qui recrée
 * une fonction pour en changer la signature RÉÉCRIT tout son corps, donc elle
 * hérite de la responsabilité de TOUTES les corrections passées de ce corps.
 * Relire les migrations qui l'ont modifiée n'est pas facultatif.
 */

drop function if exists public.compteurs_admin();

create function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint,
    commandes_creees_ce_mois bigint,
    boutiques bigint,
    boutiques_nommees bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where status = 'active'),
    -- `comptes_suspendus` porte sur TOUTE la table, et l'écran le dit : « hors
    -- de ce total ». C'est l'autre moitié de la décision de la migration 137.
    (select count(*) from public.profiles where status = 'suspended'),
    -- ⚠️ BORNÉ AUX ACTIFS, ET C'EST LE SUJET DE CETTE MIGRATION. L'écran écrit
    -- « Comptes actifs : N — dont M sans type » : le mot « dont » promet un
    -- sous-ensemble du total annoncé juste au-dessus.
    (select count(*) from public.profiles
      where account_type is null and status = 'active'),
    (select coalesce(sum(u.parcels_registered), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    (select count(*) from public.tracked_parcels
      where abandoned_at >= date_trunc('month', now())),
    -- MÊME SOURCE, MÊME BORNE que les colis : le mois courant du compteur, et
    -- non une fenêtre glissante. Deux fenêtres différentes sur la même carte
    -- feraient comparer des chiffres qui ne décrivent pas la même période.
    (select coalesce(sum(u.orders_created), 0)
       from public.usage_counters u
      where u.period_month = date_trunc('month', now())::date),
    (select count(*) from public.shops),
    -- ⚠️ DEUX CHIFFRES, PAS UN. Une boutique est créée À L'INSCRIPTION, donc il
    -- y en a exactement autant que de comptes : rendre ce seul nombre
    -- afficherait « 20 boutiques » pour vingt comptes dont dix-huit n'ont jamais
    -- rien configuré. Celui qui INFORME est le second.
    (select count(*) from public.shops where name is not null and btrim(name) <> '');
end;
$$;

revoke all on function public.compteurs_admin() from public;
grant execute on function public.compteurs_admin() to authenticated;

comment on function public.compteurs_admin() is
  'Compteurs du panneau d''administration. `comptes_sans_type` porte sur les comptes ACTIFS — c''est ce que le mot « dont » promet à l''écran ; `comptes_suspendus` porte sur toute la table, et l''écran dit qu''ils sont hors du total des actifs. Garde interne : est_admin().';
