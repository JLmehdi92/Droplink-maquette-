-- 074 — DEUX PASSAGES CONCURRENTS NE PAIENT PLUS DEUX FOIS LE MÊME COLIS.
--
-- `colis_a_interroger` était `language sql stable`, sans aucun verrou : deux
-- passages simultanés de la tâche de fond rendaient EXACTEMENT LA MÊME LISTE, et
-- chaque colis était donc interrogé deux fois — donc facturé deux fois.
--
-- CE DÉFAUT N'EST PAS THÉORIQUE, ET IL N'EST PAS ENCORE ACTIF. Il ne l'est pas
-- parce que `CRON_SECRET` est absent et qu'aucun planificateur n'appelle la
-- route. Il ne sera plus théorique au premier déploiement, pour une raison
-- précise : LA VEILLE MUTUELLE PRÉVUE AU BRIEF crée exactement cette situation.
-- Deux planificateurs indépendants qui se surveillent l'un l'autre, c'est deux
-- planificateurs qui peuvent passer en même temps.
--
-- C'est le motif L-029 dans sa forme la plus nette : la protection tenait à une
-- ABSENCE — l'absence de second appelant. « Ce serait doublement facturé si
-- quelqu'un ajoutait un deuxième planificateur » est la phrase juste, et c'est
-- ce qu'on est en train de planifier.
--
-- ET C'EST UNE COURSE QUI DÉGRADE AU LIEU DE CASSER (L-030) : rien n'échoue,
-- rien n'est incohérent, la facture est simplement plus élevée que l'usage. On
-- ne peut pas l'attribuer après coup — c'est pour cela que la garde doit être
-- STRUCTURELLE et non une convention entre appelants.
--
-- LA CORRECTION : la sélection DEVIENT la réservation. `for update skip locked`
-- fait sauter au second passage les lignes que le premier tient déjà, et
-- `last_query_at` est posé DANS LE MÊME ORDRE SQL — donc dans la même
-- transaction que la lecture. Un colis rendu à un passage ne peut plus être
-- rendu à l'autre, quelle que soit la vitesse relative des deux.
--
-- La fonction cesse d'être `stable` : elle écrit. C'est aussi ce qui la rend
-- APPELABLE par PostgREST en écriture — une fonction `stable` y est exécutée en
-- transaction LECTURE SEULE, et l'`update` aurait échoué à l'exécution, pas à
-- la compilation.

drop function public.colis_a_interroger(integer);

create function public.colis_a_interroger(p_limite integer)
  returns table (
    id uuid,
    tracking_number text,
    carrier_code integer,
    normalized_status public.parcel_status,
    registered_at timestamptz,
    last_movement_at timestamptz,
    last_query_at timestamptz,
    empty_count integer
  )
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels p
     -- LA RÉSERVATION EST L'ÉCRITURE. `marquer_interroge` reste appelée ensuite
     -- par l'appelant : elle sert le cas où l'interrogation échoue APRÈS la
     -- réservation, et repose la date une seconde fois sans dommage.
     set last_query_at = now()
   where p.id in (
     select c.id
     from public.tracked_parcels c
     where c.abandoned_at is null
       and c.normalized_status <> 'livre'
       -- Trois heures : l'intervalle le plus COURT de la cadence. Filtrer plus
       -- finement ici dupliquerait la décision, et deux copies d'une même
       -- décision divergent au premier ajustement de l'une des deux.
       and (c.last_query_at is null or c.last_query_at < now() - interval '3 hours')
     -- `nulls first` n'est pas un détail d'ordre : un colis JAMAIS interrogé est
     -- celui dont le vendeur vient de coller le numéro, et il attend devant son
     -- écran. Le servir en dernier serait servir en dernier le seul qui regarde.
     order by c.last_query_at asc nulls first
     limit greatest(1, least(coalesce(p_limite, 50), 200))
     for update skip locked
   )
  returning p.id, p.tracking_number, p.carrier_code, p.normalized_status,
            p.registered_at, p.last_movement_at, p.last_query_at, p.empty_count;
$$;

comment on function public.colis_a_interroger(integer) is
  'Réserve et rend les colis à interroger. La sélection EST la réservation : deux passages concurrents ne peuvent pas rendre le même colis.';

revoke execute on function public.colis_a_interroger(integer) from public, anon, authenticated;

/*
 * `marquer_prise_en_charge` DEVIENT IDEMPOTENTE.
 *
 * Elle incrémentait `query_count` à chaque appel, sans condition. Rejouée — par
 * un réessai côté application, ou par deux passages concurrents avant le verrou
 * ci-dessus — elle rapprochait donc le colis de sa fenêtre d'abandon (sept jours
 * ou seize interrogations) sans qu'aucune interrogation supplémentaire ait eu
 * lieu. Un colis pouvait être abandonné pour avoir été trop interrogé, alors
 * qu'il l'avait été une fois.
 *
 * La garde est la clause `where` : une prise en charge n'a lieu qu'une fois, et
 * c'est la BASE qui le dit, pas la discipline de l'appelant.
 */
create or replace function public.marquer_prise_en_charge(
  p_parcel_id uuid,
  p_abandonne boolean
)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels
     set registered_at = case when p_abandonne then registered_at else now() end,
         abandoned_at = case when p_abandonne then now() else abandoned_at end,
         query_count = query_count + 1
   where id = p_parcel_id
     and registered_at is null
     and abandoned_at is null;
$$;

comment on function public.marquer_prise_en_charge(uuid, boolean) is
  'Marque la prise en charge, UNE SEULE FOIS. Rejouée, elle ne rapproche plus le colis de sa fenêtre d''abandon.';

revoke execute on function public.marquer_prise_en_charge(uuid, boolean)
  from public, anon, authenticated;
