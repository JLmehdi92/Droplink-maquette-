-- 033 — La cadence d'interrogation et le battement du veilleur.
--
-- CE QUE LA BASE FAIT ICI, ET CE QU'ELLE NE FAIT PAS. Elle pré-filtre
-- GROSSIÈREMENT — colis ni livré ni abandonné, pas interrogé depuis au moins
-- l'intervalle le plus court — et rend au plus N lignes. La décision FINE reste
-- dans le module pur `schedule.ts`, qui est éprouvable sans base ni horloge.
--
-- Le partage n'est pas arbitraire : ce qui doit rester en base est ce qui borne
-- le COÛT (ne pas lire dix mille lignes pour en traiter cinquante), et ce qui
-- doit rester en TypeScript est ce qui décide (et qu'on ne peut pas éprouver en
-- attendant qu'un vrai colis traverse la moitié du monde).
--
-- `last_query_at` EST UNE COLONNE À PART, et pas `updated_at`. `updated_at`
-- bouge à chaque écriture — y compris l'attache d'une commande — et la cadence
-- se réglerait alors sur des gestes qui n'ont rien à voir avec le fournisseur.
-- Deux faits différents, deux colonnes.

alter table public.tracked_parcels add column last_query_at timestamptz;

comment on column public.tracked_parcels.last_query_at is
  'Dernière interrogation du fournisseur. Distincte d''updated_at, qui bouge pour d''autres raisons.';

-- L'index qui sert la tâche de fond. PARTIEL : elle ne réveille jamais un colis
-- livré ou abandonné, et un index complet ferait payer toutes les écritures pour
-- servir une question qu'on ne pose pas.
drop index public.tracked_parcels_a_interroger_idx;
create index tracked_parcels_a_interroger_idx
  on public.tracked_parcels (last_query_at nulls first)
  where abandoned_at is null and normalized_status <> 'livre';

/*
 * Les colis à examiner, du plus anciennement interrogé au plus récent.
 *
 * `nulls first` n'est pas un détail d'ordre : un colis JAMAIS interrogé est
 * celui dont le vendeur vient de coller le numéro, et il attend devant son
 * écran. Le servir en dernier serait servir en dernier le seul qui regarde.
 */
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
  stable
  security definer
  set search_path = ''
as $$
  select p.id, p.tracking_number, p.carrier_code, p.normalized_status,
         p.registered_at, p.last_movement_at, p.last_query_at, p.empty_count
  from public.tracked_parcels p
  where p.abandoned_at is null
    and p.normalized_status <> 'livre'
    -- Trois heures : l'intervalle le plus COURT de la cadence. Filtrer plus
    -- finement ici dupliquerait la décision, et deux copies d'une même décision
    -- divergent au premier ajustement de l'une des deux.
    and (p.last_query_at is null or p.last_query_at < now() - interval '3 hours')
  order by p.last_query_at asc nulls first
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$$;

revoke execute on function public.colis_a_interroger(integer) from public, anon, authenticated;

/*
 * Marque un colis comme interrogé, quoi qu'il en soit ressorti.
 *
 * Séparée de l'application d'un état parce qu'elle doit avoir lieu MÊME quand
 * le fournisseur est injoignable : sans elle, un colis dont l'interrogation
 * échoue serait réessayé à chaque passage de la tâche de fond, en boucle, et
 * chaque tentative se paie.
 */
create function public.marquer_interroge(p_parcel_id uuid)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels set last_query_at = now() where id = p_parcel_id;
$$;

revoke execute on function public.marquer_interroge(uuid) from public, anon, authenticated;

/*
 * Abandonne le suivi d'un colis, avec son motif.
 *
 * L'abandon est une DÉCISION du module pur, pas de la base : c'est lui qui sait
 * qu'un colis n'a jamais rien dit depuis sept jours, et lui seul distingue ce
 * cas de celui — bien plus fréquent — du colis bloqué en douane, qui ne doit
 * JAMAIS être abandonné.
 */
create function public.abandonner_colis(p_parcel_id uuid, p_motif text)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels
     set abandoned_at = now(),
         raw_status = coalesce(nullif(p_motif, ''), raw_status)
   where id = p_parcel_id and abandoned_at is null;
$$;

revoke execute on function public.abandonner_colis(uuid, text) from public, anon, authenticated;

/*
 * LE BATTEMENT DU VEILLEUR.
 *
 * L'ABSENCE DE LIGNE EST L'INFORMATION. Trois états, pas deux :
 *
 *   aucune ligne   → « jamais déployé ». Une tâche posée ce matin n'a pas encore
 *                    eu son premier passage : la signaler ferait chercher une
 *                    panne dans un mécanisme qui n'existe pas encore.
 *   ligne ancienne → « en retard ». C'est la seule alerte qui vaille.
 *   ligne fraîche  → « actif ».
 *
 * Sans le premier état, un veilleur jamais déployé se présenterait comme « en
 * retard » — et une alerte qui se trompe est une alerte qu'on apprend à ignorer.
 */
create table public.scheduler_heartbeat (
  source text primary key,
  beat_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

comment on table public.scheduler_heartbeat is
  'Battement des tâches de fond. L''ABSENCE de ligne signifie « jamais déployé », pas « en retard ».';

alter table public.scheduler_heartbeat enable row level security;
alter table public.scheduler_heartbeat force row level security;

-- Aucune policy, délibérément : la table n'est atteignable que par la fonction
-- ci-dessous. UN VEILLEUR DONT LE BATTEMENT EST ÉCRIVABLE ANONYMEMENT EST PIRE
-- QU'UN VEILLEUR ABSENT — on cesse de le chercher, en croyant qu'il veille.
revoke all on public.scheduler_heartbeat from anon, authenticated;

create function public.battre(p_source text, p_detail jsonb)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.scheduler_heartbeat (source, beat_at, detail)
  values (p_source, now(), coalesce(p_detail, '{}'::jsonb))
  on conflict (source) do update set beat_at = now(), detail = excluded.detail;
$$;

revoke execute on function public.battre(text, jsonb) from public, anon, authenticated;
