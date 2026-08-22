-- 081 — UN ARCHIVAGE PAR LOT LAISSE UNE TRACE PAR COMMANDE.
--
-- L'archivage unitaire écrit une ligne dans `order_events` ; l'archivage par lot
-- n'en écrivait AUCUNE. Deux cents commandes pouvaient donc être archivées sans
-- laisser la moindre trace, et leur historique — l'écran qui répond « qui a
-- modifié quoi, quand » — restait muet sur le seul geste qui les avait touchées.
--
-- LE DÉFAUT SE LIT À L'ENVERS DE CE QU'ON CROIT. Ce n'est pas le lot qui a
-- oublié le journal : c'est que la trace vivait dans l'APPELANT. `cycle.ts`
-- appelle `journaliser` après sa mutation, et le chemin du lot, écrit plus tard,
-- ne l'a pas fait — rien ne le lui rappelait. Une règle applicative peut être
-- oubliée dans un nouveau chemin de code ; une règle en base ne peut pas l'être.
--
-- La trace est donc écrite ICI, dans la même transaction que l'archivage. Cela
-- étend l'atomicité au journal : un lot qui échoue n'a rien archivé ET n'a rien
-- tracé, ce qui est la seule combinaison qui ne mente pas.
--
-- ELLE PASSE PAR `journaliser_vendeur`, qui revérifie la propriété de chaque
-- commande. C'est redondant avec la RLS qui vient de filtrer l'`update` — et
-- c'est voulu : `archiver_lot` est `security invoker` justement pour que la RLS
-- fasse le contrôle, tandis que `journaliser_vendeur` est `security definer` et
-- doit donc porter le sien. Chacune reste correcte prise isolément, ce qui est
-- la seule façon qu'elles le restent quand l'une des deux changera.

create or replace function public.archiver_lot(p_ids uuid[], p_archiver boolean)
  returns integer
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  v_ids uuid[];
  v_demandes integer;
  v_modifiees integer;
  v_id uuid;
begin
  -- Dédoublonnée ET débarrassée des nuls : un tableau venu d'une sélection
  -- d'interface peut porter les deux, et aucun des deux ne décrit une commande.
  select array_agg(distinct x) into v_ids
  from unnest(coalesce(p_ids, '{}'::uuid[])) as x
  where x is not null;

  v_demandes := coalesce(array_length(v_ids, 1), 0);

  if v_demandes = 0 then
    return 0;
  end if;

  if v_demandes > 200 then
    raise exception 'lot trop grand : % commandes', v_demandes using errcode = 'DL037';
  end if;

  update public.orders
     set archived_at = case when p_archiver then now() else null end
   where id = any(v_ids);

  get diagnostics v_modifiees = row_count;

  if v_modifiees <> v_demandes then
    -- Le message ne dit PAS lesquelles ont échoué : ce serait révéler
    -- l'existence des commandes d'un autre vendeur à qui en devine les
    -- identifiants. Il dit combien, ce qui suffit à l'écran pour être honnête.
    raise exception 'lot refusé : % commandes sur % sont hors de portée',
      v_demandes - v_modifiees, v_demandes
      using errcode = 'DL038';
  end if;

  -- APRÈS la mutation, jamais avant. Une trace écrite d'avance décrit une action
  -- qui peut ne pas avoir eu lieu, et c'est exactement le genre de ligne qu'on
  -- croira en cas de litige.
  --
  -- `par_lot` distingue les deux chemins DANS LA TRACE elle-même. Sans lui,
  -- l'historique d'une commande dirait « archivée » sans qu'on puisse savoir si
  -- quelqu'un l'a visée ou si elle était dans une sélection de deux cents.
  foreach v_id in array v_ids loop
    perform public.journaliser_vendeur(
      v_id,
      'commande_archivee',
      jsonb_build_object('archivee', p_archiver, 'par_lot', true, 'taille_lot', v_demandes)
    );
  end loop;

  return v_modifiees;
end;
$$;

comment on function public.archiver_lot(uuid[], boolean) is
  'Archivage par lot, tout-ou-rien, journal COMPRIS : un lot qui échoue n''a rien archivé et rien tracé.';

revoke execute on function public.archiver_lot(uuid[], boolean) from public, anon;
grant execute on function public.archiver_lot(uuid[], boolean) to authenticated;
