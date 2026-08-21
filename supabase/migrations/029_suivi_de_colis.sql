-- 029 — Le colis est une entité DISTINCTE de la commande.
--
-- POURQUOI. Un même numéro de suivi peut porter plusieurs commandes — un
-- fournisseur groupe régulièrement plusieurs achats d'un même client dans un
-- colis — et le fournisseur de suivi facture **à la prise en charge**, pas à
-- l'interrogation. Porter l'état sur `orders` aurait rendu la double
-- facturation NATURELLE : deux commandes, deux prises en charge, deux fois le
-- prix pour un seul colis. L'unicité `(shop_id, tracking_number)` la rend
-- impossible.
--
-- L'unicité s'arrête à la FRONTIÈRE DU VENDEUR, et pas au numéro seul : deux
-- vendeurs peuvent légitimement employer le même numéro — le transporteur les
-- réutilise, et surtout un revendeur et son fournisseur suivent le MÊME colis.
-- Une unicité globale aurait fait que le second à saisir le numéro se serait vu
-- attribuer le colis du premier, avec ses points de passage.
--
-- CE QUI N'EST PAS ICI. Aucune référence au fournisseur de suivi dans les noms :
-- un seul fichier de l'application connaîtra jamais 17TRACK, son adaptateur. La
-- justification n'est pas d'en changer un jour — c'est de rendre la
-- NORMALISATION testable sans réseau.

create type public.parcel_status as enum (
  -- Les quatre étapes de la frise, et rien d'autre. La granularité vit dans le
  -- DÉTAIL des points de passage : un client qui voit douze étapes ne sait plus
  -- laquelle compte.
  'preparation',
  'expedie',
  'en_transit',
  'livre'
);

create table public.tracked_parcels (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  tracking_number text not null,
  -- Code transporteur du fournisseur de suivi. Entier chez lui, `null` tant
  -- qu'il ne l'a pas détecté — et il le détecte souvent seul.
  carrier_code integer,
  normalized_status public.parcel_status not null default 'preparation',
  -- Le statut brut du fournisseur, CONSERVÉ TEL QUEL à côté du nôtre. Sans lui,
  -- un statut qu'on n'a pas su traduire disparaîtrait sans laisser de trace, et
  -- on ne saurait jamais qu'il a existé.
  raw_status text,
  first_movement_at timestamptz,
  last_movement_at timestamptz,
  -- Compte les interrogations FACTURÉES. C'est le seul poste de coût variable
  -- du produit : il est compté en base, pas déduit d'un journal.
  query_count integer not null default 0,
  -- Les retours vides comptent dans le coût mais ne déclenchent NI la cadence du
  -- silence NI l'abandon : un numéro fraîchement collé n'est simplement pas
  -- encore scanné.
  empty_count integer not null default 0,
  registered_at timestamptz,
  abandoned_at timestamptz,
  estimated_from timestamptz,
  estimated_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracked_parcels_numero_taille check (
    length(tracking_number) between 4 and 64
  ),
  unique (shop_id, tracking_number)
);

comment on table public.tracked_parcels is
  'Un colis suivi. UNIQUE (shop_id, tracking_number) : la règle de coût rendue structurelle.';

-- La tâche de fond réveille les colis à interroger : ceux qui ne sont ni livrés
-- ni abandonnés, du plus anciennement bougé au plus récent.
create index tracked_parcels_a_interroger_idx
  on public.tracked_parcels (last_movement_at nulls first)
  where abandoned_at is null and normalized_status <> 'livre';

create index tracked_parcels_shop_idx on public.tracked_parcels (shop_id, updated_at desc);

/*
 * LE LIEN COMMANDE ↔ COLIS, plusieurs à plusieurs.
 *
 * Un colis peut porter plusieurs commandes (le groupage), et une commande
 * pourrait un jour partir en deux colis. La table de liaison dit les deux sans
 * qu'aucune des deux tables n'ait à changer.
 */
create table public.order_parcels (
  order_id uuid not null references public.orders (id) on delete cascade,
  parcel_id uuid not null references public.tracked_parcels (id) on delete cascade,
  primary key (order_id, parcel_id)
);

create index order_parcels_parcel_idx on public.order_parcels (parcel_id);

/*
 * LES POINTS DE PASSAGE.
 *
 * L'unicité porte sur (colis, instant, description) : le fournisseur renvoie
 * l'historique COMPLET à chaque interrogation, et sans cette contrainte chaque
 * appel dupliquerait tout ce qui précède. La déduplication est donc une
 * contrainte, pas un filtre écrit dans le code qui insère — un filtre s'oublie
 * dans le prochain chemin d'écriture.
 */
create table public.parcel_checkpoints (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.tracked_parcels (id) on delete cascade,
  occurred_at timestamptz not null,
  location text,
  description text not null,
  -- L'étape brute du fournisseur, conservée : elle sert à mettre en évidence
  -- l'arrivée dans le pays, que le client attend plus que le reste.
  stage text,
  created_at timestamptz not null default now(),
  unique (parcel_id, occurred_at, description)
);

create index parcel_checkpoints_parcel_idx
  on public.parcel_checkpoints (parcel_id, occurred_at desc);

/*
 * LES RÉPONSES BRUTES.
 *
 * PURGÉES 90 JOURS APRÈS LE DERNIER MOUVEMENT, jamais après la création : un
 * colis bloqué en douane depuis quatre mois est précisément celui pour lequel on
 * a le plus besoin de la réponse brute. Purger sur la création l'aurait effacée
 * juste avant qu'on en ait besoin.
 */
create table public.tracking_snapshots (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.tracked_parcels (id) on delete cascade,
  raw_payload jsonb not null,
  normalized_status public.parcel_status,
  fetched_at timestamptz not null default now()
);

create index tracking_snapshots_parcel_idx on public.tracking_snapshots (parcel_id, fetched_at desc);

-- RLS SUR TOUTES, activée ET forcée dès cette migration. Supabase accorde
-- SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : une table créée sans ce
-- retrait est grande ouverte, et le fichier de migration ne le dirait pas.
alter table public.tracked_parcels enable row level security;
alter table public.tracked_parcels force row level security;
alter table public.order_parcels enable row level security;
alter table public.order_parcels force row level security;
alter table public.parcel_checkpoints enable row level security;
alter table public.parcel_checkpoints force row level security;
alter table public.tracking_snapshots enable row level security;
alter table public.tracking_snapshots force row level security;

revoke all on public.tracked_parcels from anon, authenticated;
revoke all on public.order_parcels from anon, authenticated;
revoke all on public.parcel_checkpoints from anon, authenticated;
revoke all on public.tracking_snapshots from anon, authenticated;

-- Le vendeur LIT ses colis et leurs points de passage. Il n'écrit RIEN :
-- l'écriture vient du transporteur, par le point de réception, et un vendeur qui
-- pourrait écrire ses propres points de passage pourrait raconter à son client
-- une expédition qui n'a pas eu lieu.
grant select on public.tracked_parcels to authenticated;
grant select on public.order_parcels to authenticated;
grant select on public.parcel_checkpoints to authenticated;

-- `tracking_snapshots` n'est PAS lisible par le vendeur : la réponse brute du
-- fournisseur contient des champs que nous n'exposons pas, et son seul usage est
-- le diagnostic. Ce qui n'est pas lisible ne peut pas fuiter.

create policy "vendeur lit ses colis"
  on public.tracked_parcels for select
  to authenticated
  using (shop_id = public.mon_shop_id());

create policy "vendeur lit les liens de ses commandes"
  on public.order_parcels for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_parcels.order_id and o.shop_id = public.mon_shop_id()
    )
  );

create policy "vendeur lit les points de passage de ses colis"
  on public.parcel_checkpoints for select
  to authenticated
  using (
    exists (
      select 1 from public.tracked_parcels p
      where p.id = parcel_checkpoints.parcel_id and p.shop_id = public.mon_shop_id()
    )
  );

-- `updated_at` tenue par déclencheur : une colonne que l'application écrit finit
-- par affirmer ce qu'on veut plutôt que ce qui s'est passé.
create trigger tracked_parcels_updated_at
  before update on public.tracked_parcels
  for each row execute function public.toucher_updated_at();
