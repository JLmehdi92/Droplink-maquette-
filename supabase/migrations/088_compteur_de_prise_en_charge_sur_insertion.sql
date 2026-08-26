-- ═══════════════════════════════════════════════════════════════════════════
-- LE COMPTEUR FACTURABLE OUVRE SUR `tg_op` AVANT DE LIRE `OLD`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ CE QUE L'AUDIT A SIGNALÉ, ET CE QUE LA MESURE A ÉTABLI — les deux ne
-- disent PAS la même chose, et il faut le dire.
--
-- L'audit du 26/08/2026 signalait que `compter_prise_en_charge()`, branchée
-- `after insert or update of registered_at`, lisait `old.registered_at` sans
-- ouvrir sur `tg_op`, et qu'un INSERT posant `registered_at` lèverait
-- « record "old" is not assigned yet » (SQLSTATE 55000) — donc annulerait
-- l'insertion entière, sur le SEUL compteur qui corresponde à une facture.
--
-- VÉRIFIÉ PAR EXÉCUTION SUR LA BASE RÉELLE (PostgreSQL 17.6,
-- `plpgsql.extra_errors = none`) : **CELA NE SE PRODUIT PAS**. Dans un
-- déclencheur de LIGNE, `OLD` est un enregistrement NULL sur INSERT, pas un
-- enregistrement non assigné ; `old.registered_at is not null` vaut donc
-- simplement `false`, et l'insertion réussit — et compte, ce qui est le
-- comportement voulu. L'erreur « not assigned » concerne les déclencheurs
-- d'INSTRUCTION, pas ceux de ligne.
--
-- LA CORRECTION EST DONC UNE CORRECTION DE FORME, PAS DE DÉFAUT. On la fait
-- quand même, pour deux raisons qui tiennent toutes seules :
--
--   1. le comportement juste dépendait d'une SÉMANTIQUE IMPLICITE — celle d'un
--      `OLD` nul comparé avec `is not null`. Il suffirait de `SET
--      plpgsql.extra_errors = 'all'`, d'une version antérieure, ou d'une
--      réécriture de la condition en `old.registered_at is null` pour que le
--      résultat change. Une règle qui tient à ce que personne ne touche à la
--      forme de la condition n'est pas une règle ;
--   2. c'était le SEUL des cinq déclencheurs multi-opérations du dépôt à ne pas
--      ouvrir sur `tg_op`. Une exception unique dans un ensemble cohérent est
--      exactement ce qu'une relecture ne remarque pas.
--
-- CE QUE LA CORRECTION PRÉSERVE, à l'identique : une prise en charge compte
-- UNE SEULE FOIS, au passage de « pas encore pris en charge » à « pris en
-- charge ». Sur UPDATE, cela veut dire `old.registered_at is null` ; sur
-- INSERT, il n'y a pas d'état antérieur, donc une ligne insérée avec
-- `registered_at` déjà posée EST une prise en charge et doit compter.
--
-- `create or replace` suffit : la signature ne change pas (une fonction de
-- déclencheur n'a pas d'argument), et le déclencheur pointe sur le nom.

create or replace function public.compter_prise_en_charge()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  -- Rien à compter tant que le colis n'est pas pris en charge.
  if new.registered_at is null then
    return new;
  end if;

  -- ON OUVRE SUR L'OPÉRATION AVANT DE TOUCHER À `OLD`. C'est la correction :
  -- `OLD` n'existe que sur UPDATE et DELETE. Le lire ailleurs lève, et le
  -- court-circuit qui l'évitait jusqu'ici tenait à l'ordre des conditions.
  if tg_op = 'UPDATE' and old.registered_at is not null then
    -- Déjà compté au passage précédent : une modification ultérieure de la
    -- ligne ne doit pas refacturer le même colis.
    return new;
  end if;

  select s.owner_id into v_profil from public.shops s where s.id = new.shop_id;
  if v_profil is null then
    return new;
  end if;

  insert into public.usage_counters (profile_id, period_month, parcels_registered)
  values (v_profil, date_trunc('month', new.registered_at)::date, 1)
  on conflict (profile_id, period_month) do update
    set parcels_registered = public.usage_counters.parcels_registered + 1,
        updated_at = now();

  return new;
end;
$$;

comment on function public.compter_prise_en_charge() is
  'Compte une prise en charge, UNE SEULE FOIS. Ouvre sur tg_op avant de lire '
  'OLD : sur un INSERT, OLD n''est pas assigné et le lire annule l''insertion '
  'entière. Un colis inséré déjà pris en charge compte, comme il le doit.';

revoke all on function public.compter_prise_en_charge() from public;
