-- 021 — Une seule définition de la fenêtre de limitation de débit.
--
-- CE QUI A MOTIVÉ CETTE MIGRATION, ET COMMENT ON L'A SU.
--
-- `consommer_quota` (005) et `quota_depasse` (019) calculaient chacune leur
-- fenêtre, avec deux expressions identiques écrites séparément. Une falsification
-- a doublé celle de la consultation pour vérifier que le test le voyait. Le test
-- est resté VERT — non parce qu'il regardait ailleurs, mais parce que l'exécution
-- tombait sur une minute paire, où les deux fenêtres coïncident. Une minute plus
-- tard il aurait échoué.
--
-- Le défaut n'était donc pas dans le test : un test qui échoue une fois sur deux
-- n'est pas un test, et le borner n'aurait rien réglé. Le défaut est qu'une même
-- décision était écrite à deux endroits. Deux expressions identiques ne restent
-- identiques que tant que personne ne touche à l'une des deux, et la dérive
-- serait MUETTE : la consultation regarderait une fenêtre vide pendant que la
-- consommation en remplirait une autre, le seuil des jetons inconnus cesserait
-- de mordre, et rien n'échouerait.
--
-- Une définition unique ne se teste pas : elle rend la divergence impossible.
--
-- `create or replace` suffit ici, et seulement ici : les DEUX fonctions gardent
-- exactement la même liste d'arguments. Le jour où elle changerait, Postgres
-- créerait une SECONDE fonction, les deux coexisteraient, et un appel résoudrait
-- l'ANCIENNE sans la moindre erreur.

create function public.fenetre_courante(p_fenetre_secondes integer)
  returns timestamptz
  language sql
  stable
  set search_path = ''
as $$
  select to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_fenetre_secondes) * p_fenetre_secondes
  );
$$;

comment on function public.fenetre_courante(integer) is
  'La fenêtre de limitation de débit, définie UNE fois. Deux définitions dérivent en silence.';

-- Elle ne divulgue rien à elle seule, mais elle n'a rien à faire entre les mains
-- d'un client : Postgres accorde EXECUTE à PUBLIC par défaut, et ce droit ne
-- s'écrit pas dans le corps d'une fonction.
revoke execute on function public.fenetre_courante(integer) from public, anon, authenticated;

create or replace function public.consommer_quota(
  p_cle text,
  p_plafond integer,
  p_fenetre_secondes integer
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_debut timestamptz;
  v_compte integer;
begin
  if p_plafond <= 0 or p_fenetre_secondes <= 0 then
    raise exception 'plafond et fenêtre doivent être strictement positifs'
      using errcode = '22023';
  end if;

  v_debut := public.fenetre_courante(p_fenetre_secondes);

  insert into public.rate_limit as r (cle, fenetre_debut, compte)
  values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut)
    do update set compte = r.compte + 1
  returning r.compte into v_compte;

  -- Purge opportuniste et BORNÉE : sans elle le coût de chaque appel croîtrait
  -- avec le trafic passé, sur un chemin qui est celui de chaque requête
  -- protégée.
  if v_compte = 1 then
    delete from public.rate_limit
    where ctid in (
      select ctid from public.rate_limit
      where fenetre_debut < v_debut - make_interval(secs => p_fenetre_secondes * 2)
      limit 200
    );
  end if;

  return v_compte <= p_plafond;
end;
$$;

create or replace function public.quota_depasse(
  p_cle text,
  p_plafond integer,
  p_fenetre_secondes integer
)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_compte integer;
begin
  if p_plafond <= 0 or p_fenetre_secondes <= 0 then
    raise exception 'plafond et fenêtre doivent être strictement positifs'
      using errcode = '22023';
  end if;

  select r.compte into v_compte
  from public.rate_limit r
  where r.cle = p_cle
    and r.fenetre_debut = public.fenetre_courante(p_fenetre_secondes);

  return coalesce(v_compte, 0) >= p_plafond;
end;
$$;
