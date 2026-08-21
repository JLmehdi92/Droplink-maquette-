-- 023 — Le journal d'une commande.
--
-- POURQUOI MAINTENANT. Le principe V dit que la révocation du lien « écrit un
-- événement ». Elle n'en écrivait aucun, faute de table où l'écrire — une
-- exigence tenue pour acquise pendant deux lots parce que rien ne la contredisait
-- visiblement. C'est exactement le motif qui revient : un document affirme un
-- état que personne n'a exécuté.
--
-- Le journal sert trois choses qui ne se remplacent pas : l'historique que
-- l'éditeur montre au vendeur, la trace de l'arbitrage QC de son client, et la
-- preuve qu'un lien a bien été révoqué à telle date — celle qu'on produirait en
-- cas de litige.
--
-- LE TYPE EST CONTRAINT, PAS LIBRE. Un type mal orthographié s'écrirait sans
-- erreur et disparaîtrait du journal pour toujours : une ligne présente mais
-- introuvable est pire qu'une ligne absente. Un test compare cette liste au
-- catalogue TypeScript DANS LES DEUX SENS — un type déclaré ici sans exister
-- côté code est une exigence sans écriture, un type émis côté code sans exister
-- ici fait ÉCHOUER la mutation entière, la transaction étant partagée.
--
-- APPEND-ONLY. Aucune policy d'écriture, aucune de mise à jour, aucune de
-- suppression : un journal qu'on peut corriger n'est pas un journal. Le seul
-- chemin d'écriture est `security definer`, donc contrôlé.

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  -- Qui a agi. `vendeur`, `client` (celui qui consulte le lien, sans compte),
  -- ou `systeme`. Pas une clé étrangère : le client n'a JAMAIS de compte, et
  -- une colonne qui pointerait vers `profiles` inviterait à lui en fabriquer un.
  actor text not null,
  occurred_at timestamptz not null default now(),
  constraint order_events_type_connu check (
    type in (
      'commande_creee',
      'commande_modifiee',
      'commande_archivee',
      'commande_dupliquee',
      'media_ajoute',
      'media_supprime',
      'medias_reordonnes',
      'lien_revoque',
      'qc_approuve',
      'qc_refuse'
    )
  ),
  constraint order_events_acteur_connu check (actor in ('vendeur', 'client', 'systeme')),
  -- La charge utile est bornée : un journal sans plafond est une table dont le
  -- coût croît avec l'usage, sur le chemin d'écriture de chaque mutation.
  constraint order_events_payload_taille check (length(payload::text) <= 4000)
);

comment on table public.order_events is
  'Journal append-only d''une commande. Aucune policy d''écriture : le seul chemin est security definer.';

-- L'historique se lit du plus récent au plus ancien, par commande. Sans cet
-- index, l'écran d'historique lirait toute la table — invisible à faible
-- volumétrie, décisif à quelques centaines de milliers de lignes.
create index order_events_order_idx on public.order_events (order_id, occurred_at desc);

alter table public.order_events enable row level security;
alter table public.order_events force row level security;

-- Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : une table
-- créée sans ce retrait est grande ouverte, et le fichier de migration ne le
-- dirait pas.
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;

create policy "vendeur lit le journal de ses commandes"
  on public.order_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.shops s on s.id = o.shop_id
      join public.profiles p on p.id = s.owner_id
      where o.id = order_events.order_id
        and p.user_id = (select auth.uid())
    )
  );

/*
 * Écrit une entrée de journal. Point d'écriture UNIQUE.
 *
 * Un fait, un point d'émission : trois insertions dispersées pour le même
 * événement rendent le double comptage inévitable, et un journal qui compte
 * double se relit comme une activité qui n'a pas eu lieu.
 */
create function public.journaliser(
  p_order_id uuid,
  p_type text,
  p_actor text,
  p_payload jsonb default '{}'::jsonb
)
  returns uuid
  language sql
  security definer
  set search_path = ''
as $$
  insert into public.order_events (order_id, type, actor, payload)
  values (p_order_id, p_type, p_actor, coalesce(p_payload, '{}'::jsonb))
  returning id;
$$;

comment on function public.journaliser(uuid, text, text, jsonb) is
  'Point d''écriture unique du journal de commande.';

-- Postgres accorde EXECUTE à PUBLIC par défaut, et ce droit ne s'écrit pas dans
-- le corps de la fonction. Un journal dans lequel n'importe qui peut écrire est
-- pire qu'un journal absent : on cesse de le vérifier.
revoke execute on function public.journaliser(uuid, text, text, jsonb)
  from public, anon, authenticated;
