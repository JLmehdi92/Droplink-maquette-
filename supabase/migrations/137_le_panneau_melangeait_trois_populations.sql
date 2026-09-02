/*
 * « N COMPTES ACTIFS, DONT X SUSPENDUS, Y SANS TYPE » — TROIS POPULATIONS
 * DIFFÉRENTES DANS UNE SEULE PHRASE.
 *
 * DÉFAUT MESURÉ LE 02/09/2026, écran et base à la même minute :
 *
 *   écran /fr/admin : « Comptes actifs | 12 | dont 2 suspendus, 10 sans type »
 *   base            : actifs 12 · suspendus 2 · sans_type 10 · dont actifs 8
 *
 * Le mot « dont » est faux deux fois. Les 2 suspendus ne sont PAS parmi les
 * 12 actifs — le total des inscrits est 14, et ce nombre n'apparaît nulle part.
 * Et sur les 12 actifs, 8 seulement sont sans type, pas 10 : `comptes_sans_type`
 * comptait sur TOUTE la table, suspendus compris.
 *
 * ⚠️ ET CE SONT DEUX CHIFFRES DE LA PHASE DE VALIDATION. Le brief dit que la
 * segmentation d'usage EST le livrable de cette phase, et que `account_type` est
 * nullable SANS DÉFAUT précisément pour rendre le manque VISIBLE plutôt que
 * silencieux. Un administrateur lisait donc « 10 comptes n'ont pas fini leur
 * onboarding » là où il y en a 8 — et « 14 inscrits » n'apparaissait pas.
 *
 * « Une métrique de verdict légèrement faussée est pire qu'une métrique cassée,
 * parce qu'elle reste crédible. »
 *
 * CE QUI CHANGE : `comptes_sans_type` compte désormais parmi les ACTIFS, ce que
 * le mot « dont » promet. Les suspendus, eux, restent comptés sur toute la
 * table — c'est leur définition — et le libellé de l'écran dit maintenant qu'ils
 * sont HORS de ce total, au lieu de laisser croire l'inverse.
 *
 * LA SIGNATURE NE CHANGE PAS : mêmes colonnes, mêmes types, donc
 * `create or replace` remplace bien la fonction. Le `drop` explicite qu'exige la
 * règle du projet vise les changements de LISTE — ici, l'ajouter ferait perdre
 * les droits pour rien.
 *
 * ⚠️ LE CORPS EST REPRIS DE `pg_get_functiondef`, et une seule ligne change.
 */

create or replace function public.compteurs_admin()
  returns table (
    comptes bigint,
    comptes_actifs bigint,
    comptes_suspendus bigint,
    comptes_sans_type bigint,
    colis_pris_en_charge_ce_mois bigint,
    colis_abandonnes_ce_mois bigint,
    commandes_creees_ce_mois bigint
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
    (select count(*) from public.profiles where status = 'suspended'),
    -- ⚠️ PARMI LES ACTIFS, et non sur toute la table. L'écran écrit « N actifs,
    -- dont Y sans type » : compter les suspendus ici faisait dire « dont » à
    -- propos de comptes qui ne sont pas dans le total annoncé.
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
      where u.period_month = date_trunc('month', now())::date);
end;
$$;

comment on function public.compteurs_admin() is
  'Compteurs du panneau d''administration. `comptes_sans_type` porte sur les comptes ACTIFS — c''est ce que le mot « dont » promet à l''écran ; `comptes_suspendus` porte sur toute la table, et l''écran dit qu''ils sont hors du total des actifs.';
