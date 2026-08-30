-- LE PLAFOND DE COMPTAGE DOIT ÊTRE DEMANDÉ, PAS SUBI.
--
-- La migration 118 a borné `compter_journal_admin` à 10 001 lignes, sur mesure :
-- le comptage exact coûtait 313 à 511 ms au plafond de 517 031 lignes, pour une
-- page qui en coûte 0. Le gain est réel et il est conservé.
--
-- ⚠️ MAIS CETTE BORNE A CASSÉ UNE PREUVE, ET C'EST PIRE QUE LE PROBLÈME QU'ELLE
-- RÉSOLVAIT.
--
-- `admin-socle.test.ts` porte un test décrit comme « la propriété qui porte
-- tout » : les trois familles PARTITIONNENT le journal, leur somme égale le
-- total. C'est lui qui justifie de définir `consultation` PAR EXCLUSION plutôt
-- que par une liste positive — une liste positive laisserait la prochaine action
-- introuvable par tous les filtres, et personne ne le remarquerait, un filtre
-- qui rend zéro ligne ressemblant à un filtre qui n'a rien trouvé.
--
-- Avec un plafond subi, cette somme cesse d'être vérifiable dès que la table
-- dépasse 10 001 lignes — ce qui est déjà le cas de la base de test (17 031).
-- La preuve serait devenue silencieusement inopérante : le test aurait mesuré
-- trois plafonds égaux à un quatrième plafond.
--
-- ON N'ÉCHANGE PAS UNE CORRECTION DE PERFORMANCE CONTRE UNE PREUVE PERDUE.
-- Le plafond devient donc un ARGUMENT :
--
--   - l'écran passe 10 001, et paie 4 à 10 ms ;
--   - le test passe une valeur assez haute pour ne jamais mordre, paie le
--     temps qu'il faut, et continue de prouver la partition EXACTEMENT.
--
-- Un plafond nul ou négatif signifie « ne borne pas ». Il n'a pas de valeur par
-- défaut : un défaut aurait rendu le coût invisible à l'appel, et c'est
-- précisément ce coût qu'on veut voir écrit sur chaque site d'appel.
--
-- ⚠️ L'ARITÉ CHANGE, DONC LE `drop` EST OBLIGATOIRE. `create or replace` ne
-- remplace PAS une fonction dont la liste d'arguments change : il en crée une
-- SECONDE, les deux coexistent, et un appel résout l'ANCIENNE sans erreur. Ce
-- défaut a déjà été rencontré sur ce projet (migration 093, surcharge orpheline
-- trouvée par un test de catalogue et non par relecture).

drop function if exists public.compter_journal_admin(text, int);

create function public.compter_journal_admin(
  p_famille text,
  p_depuis_jours int,
  p_plafond int
)
  returns bigint
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_famille text := nullif(btrim(coalesce(p_famille, '')), '');
  v_depuis timestamptz := case
    when coalesce(p_depuis_jours, 0) > 0 then now() - make_interval(days => p_depuis_jours)
    else null
  end;
  -- `null` = aucune borne. `limit null` est légal en SQL et ne borne rien :
  -- c'est donc la même requête dans les deux cas, sans branche à maintenir.
  v_plafond int := case when coalesce(p_plafond, 0) > 0 then p_plafond else null end;
  v_total bigint;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_famille is not null and v_famille not in ('suspension', 'consultation', 'parametre') then
    raise exception 'famille d''action inconnue : %', v_famille using errcode = 'DL050';
  end if;

  -- LE `limit` VIT DANS LA SOUS-REQUÊTE, jamais autour du `count`. Un
  -- `count(*) ... limit N` ne borne rien : il produit UNE ligne, et la borne
  -- s'applique à ce résultat unique. C'est la sous-requête qui doit cesser de
  -- lire.
  select count(*) into v_total
  from (
    select 1
    from public.admin_audit_log a
    where (v_depuis is null or a.occurred_at >= v_depuis)
      and (
        v_famille is null
        or (v_famille = 'suspension' and a.action like 'compte.%')
        or (v_famille = 'parametre' and a.action like 'parametre.%')
        or (v_famille = 'consultation'
            and a.action not like 'compte.%'
            and a.action not like 'parametre.%')
      )
    limit v_plafond
  ) borne;

  return v_total;
end;
$$;

-- LES DROITS SE REPOSENT APRÈS UN `drop`. Postgres ne les conserve pas, et une
-- fonction recréée sans eux hérite du défaut : `EXECUTE` accordé à PUBLIC.
revoke all on function public.compter_journal_admin(text, int, int) from public;
grant execute on function public.compter_journal_admin(text, int, int) to authenticated;

comment on function public.compter_journal_admin(text, int, int) is
  'Compte les entrées du journal. `p_plafond` borne la lecture ; nul ou négatif '
  'signifie « ne borne pas ». L''écran passe 10 001 et paie 4 à 10 ms ; un test '
  'qui doit prouver que les trois familles partitionnent le journal passe une '
  'valeur assez haute pour ne jamais mordre. Le coût est écrit sur chaque site '
  'd''appel, plutôt que caché dans un défaut.';
