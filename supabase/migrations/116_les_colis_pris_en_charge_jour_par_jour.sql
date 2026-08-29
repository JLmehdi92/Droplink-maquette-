-- 116 — Les colis pris en charge, JOUR PAR JOUR.
--
-- POURQUOI CE N'EST PAS DÉJÀ LISIBLE. `usage_counters` tient le compteur au
-- MOIS : il répond « combien ce mois-ci », jamais « depuis quand ça monte ».
-- Or c'est le seul poste que le fournisseur de suivi nous facture, et un total
-- mensuel ne dit pas si les 3 400 colis sont arrivés régulièrement ou en deux
-- jours. La première question qu'on se pose devant une facture inattendue est
-- QUAND — et elle n'avait pas de réponse.
--
-- LES JOURS VIDES SONT RENDUS, avec zéro. Une frise qui saute les jours sans
-- colis tasse le temps et fait disparaître exactement ce qu'on cherche : un
-- creux. `generate_series` produit l'axe, la jointure externe y accroche les
-- comptes.
--
-- ⚠️ `count(tp.id)` ET NON `count(*)`. Sur une jointure externe, `count(*)`
-- compte la LIGNE PRODUITE PAR LA JOINTURE, donc UN pour un jour vide. Le même
-- piège avait été attrapé sur la frise des semaines en migration 107 ; il ne se
-- voit qu'un jour où il ne s'est rien passé, c'est-à-dire jamais en
-- développement sur un jeu dense.
--
-- L'INDEX EXISTE DÉJÀ : `tracked_parcels_facturation_idx` sur `registered_at`,
-- partiel sur les lignes non nulles. La fenêtre étant bornée à quelques
-- semaines, la lecture ne dépend pas du volume total du produit.
--
-- `stable` ET SANS AUDIT : un agrégat par jour, tous vendeurs confondus, ne
-- désigne les données de personne. C'est la même règle que
-- `stockage_total_admin`.

create function public.colis_par_jour_admin(p_jours int)
  returns table (jour date, n bigint)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  -- BORNÉ DES DEUX CÔTÉS. Sans plancher, `0` rendrait une frise vide ; sans
  -- plafond, un appelant pourrait demander dix ans de jours à la ligne.
  v_jours int := least(greatest(coalesce(p_jours, 14), 1), 90);
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select s.jour::date,
         count(tp.id)
    from generate_series(
           (now() at time zone 'utc')::date - (v_jours - 1),
           (now() at time zone 'utc')::date,
           interval '1 day'
         ) as s(jour)
    left join public.tracked_parcels tp
           on tp.registered_at is not null
          and (tp.registered_at at time zone 'utc')::date = s.jour::date
   group by s.jour
   order by s.jour;
end;
$$;

revoke all on function public.colis_par_jour_admin(int) from public;
grant execute on function public.colis_par_jour_admin(int) to authenticated;

comment on function public.colis_par_jour_admin(int) is
  'Colis pris en charge par jour, jours vides compris. Garde interne : '
  'est_admin(). N''écrit rien : un agrégat tous vendeurs confondus ne désigne '
  'les données de personne.';
