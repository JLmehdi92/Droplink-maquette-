-- 168 — LE VENDEUR VOIT QUE SON LIEN EST BLOQUÉ, ET PEUT LE CONTESTER.
--
-- Décision de Wassim, 19/09/2026 : « oui il doit le savoir », et « le vendeur ou fournisseur
-- peut faire une contestation, et dedans il explique pourquoi et il a la possibilité
-- d'envoyer une image même si c'est pas obligatoire ».
--
-- CE QUE LA CONTESTATION EST :
--   1. Une explication OBLIGATOIRE (20 à 2 000 caractères) et UNE image FACULTATIVE, posée
--      sur R2 privé sous `contestations/{boutique}/{commande}/` — clé générée par le SERVEUR.
--   2. Rattachée à UN blocage (`blocked_at` = l'horodatage du blocage contesté) : un
--      déblocage puis un second blocage ouvrent un nouveau dossier.
--   3. Une seule en attente à la fois, trois au plus par blocage : sans borne, une
--      contestation refusée se renverrait en boucle.
--   4. L'administrateur la LIT — texte et image, que le vendeur lui envoie de son plein gré —
--      et chaque lecture est écrite au journal AVANT de rendre quoi que ce soit, comme toute
--      consultation d'une donnée tierce (contrainte 6). Il répond en DÉBLOQUANT (le lien
--      revient, le même : contrainte 5) ou en REFUSANT avec un motif que le vendeur lit.
--
-- CE QU'ELLE N'EST PAS : un canal de discussion. Pas de fil, pas de pièce jointe du côté de
-- l'administration, pas d'email — un écran de plus à lire, pas une boîte de réception.

-- ── 1. La table ──────────────────────────────────────────────────────────────────
create type public.contest_status as enum ('en_attente', 'refusee', 'acceptee');

create table public.link_contests (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  shop_id        uuid not null references public.shops (id) on delete cascade,
  blocked_at     timestamptz not null,
  message        text not null
                 check (char_length(btrim(message)) between 20 and 2000),
  image_key      text
                 check (image_key is null or image_key ~ '^contestations/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'),
  status         public.contest_status not null default 'en_attente',
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles (id) on delete set null,
  admin_response text check (admin_response is null or char_length(admin_response) <= 1000)
);

comment on table public.link_contests is
  'Contestations d''un lien bloqué par l''administration. Écrites par fonctions security definer seulement.';

create index link_contests_commande_idx on public.link_contests (order_id, created_at desc);
create index link_contests_boutique_idx on public.link_contests (shop_id);
-- Une seule contestation EN ATTENTE par commande : la règle vit dans un index, pas dans un
-- contrôle applicatif qu'une course entre deux onglets franchirait.
create unique index link_contests_une_en_attente on public.link_contests (order_id)
  where status = 'en_attente';

alter table public.link_contests enable row level security;
alter table public.link_contests force row level security;

-- Le vendeur LIT les contestations de sa boutique ; il n'écrit rien directement.
create policy link_contests_lecture_vendeur on public.link_contests
  for select to authenticated
  using (shop_id = public.mon_shop_id());

revoke all on public.link_contests from anon, authenticated;
-- COLONNE PAR COLONNE : `decided_by` désigne un administrateur, et le vendeur n'a pas à
-- savoir lequel a tranché. Il lit la décision et sa raison, pas son auteur.
grant select (id, order_id, blocked_at, message, image_key, status, created_at, decided_at, admin_response)
  on public.link_contests to authenticated;

-- ── 2. L'image part avec la contestation ─────────────────────────────────────────
-- Une contestation disparaît avec sa commande ou son compte (cascade) : son image est mise
-- en file de purge R2 (157), que l'application et la veille rejouent jusqu'au succès.
create function public.purger_image_de_contestation()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if old.image_key is not null then
    insert into public.purges_r2 (cle) values (old.image_key) on conflict (cle) do nothing;
  end if;
  return old;
end;
$$;

revoke all on function public.purger_image_de_contestation() from public;

create trigger link_contests_purge_image
  after delete on public.link_contests
  for each row execute function public.purger_image_de_contestation();

-- ── 3. Contester — le vendeur ────────────────────────────────────────────────────
create function public.contester_blocage(
  p_commande  uuid,
  p_message   text,
  p_image_key text
)
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_shop      uuid;
  v_bloque_le timestamptz;
  v_message   text := btrim(coalesce(p_message, ''));
  v_nombre    integer;
  v_id        uuid;
begin
  -- Un compte SUSPENDU ne conteste pas un lien : la suspension coupe déjà tout, et c'est
  -- elle qu'il faudrait contester.
  select s.id into v_shop
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where p.user_id = (select auth.uid())
    and p.status = 'active';

  select o.admin_blocked_at into v_bloque_le
  from public.orders o
  where o.id = p_commande
    and o.shop_id = v_shop
  for update of o;

  if not found then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_bloque_le is null then
    raise exception 'lien non bloque' using errcode = 'DL061';
  end if;

  if char_length(v_message) < 20 or char_length(v_message) > 2000 then
    raise exception 'explication hors bornes' using errcode = 'DL064';
  end if;

  -- La clé de l'image doit vivre sous SA commande : une clé choisie ailleurs ferait lire à
  -- l'administrateur l'objet d'un autre vendeur.
  if p_image_key is not null
     and p_image_key not like 'contestations/' || v_shop::text || '/' || p_commande::text || '/%' then
    raise exception 'image hors de la commande' using errcode = 'DL065';
  end if;

  if exists (
    select 1 from public.link_contests c
    where c.order_id = p_commande and c.status = 'en_attente'
  ) then
    raise exception 'contestation deja en attente' using errcode = 'DL062';
  end if;

  select count(*) into v_nombre
  from public.link_contests c
  where c.order_id = p_commande and c.blocked_at = v_bloque_le;

  if v_nombre >= 3 then
    raise exception 'trop de contestations' using errcode = 'DL063';
  end if;

  insert into public.link_contests (order_id, shop_id, blocked_at, message, image_key)
  values (p_commande, v_shop, v_bloque_le, v_message, p_image_key)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.contester_blocage(uuid, text, text) is
  'Le vendeur conteste le blocage du lien d''une de ses commandes. Une en attente, trois par blocage.';

revoke all on function public.contester_blocage(uuid, text, text) from public;
grant execute on function public.contester_blocage(uuid, text, text) to authenticated;

-- ── 4. Lesquelles attendent une réponse — pour la liste de l'administration ──────
-- Même patron que liens_bloques_parmi (166) : des identifiants qu'elle a déjà, bornés à
-- 200, sans rien écrire au journal — ils ne disent que « une contestation attend ».
create function public.contestations_en_attente_parmi(p_commandes uuid[])
  returns setof uuid
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if coalesce(array_length(p_commandes, 1), 0) > 200 then
    raise exception 'trop de commandes' using errcode = 'DL058';
  end if;

  return query
    select c.order_id
    from public.link_contests c
    where c.order_id = any (p_commandes)
      and c.status = 'en_attente';
end;
$$;

comment on function public.contestations_en_attente_parmi(uuid[]) is
  'Pour l''administration : parmi ces commandes, celles dont une contestation attend une réponse.';

revoke all on function public.contestations_en_attente_parmi(uuid[]) from public;
grant execute on function public.contestations_en_attente_parmi(uuid[]) to authenticated;

-- ── 5. Lire la contestation en attente d'une commande — l'administration, tracée ──
create function public.lire_contestation_admin(p_commande uuid, p_ip_hash text)
  returns table (
    id         uuid,
    message    text,
    image_key  text,
    created_at timestamptz,
    rang       integer
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_proprietaire uuid;
  v_id           uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  select s.owner_id, c.id into v_proprietaire, v_id
  from public.link_contests c
  join public.shops s on s.id = c.shop_id
  where c.order_id = p_commande
    and c.status = 'en_attente';

  if v_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- La lecture est TRACÉE AVANT d'être rendue : c'est une donnée écrite par un tiers.
  perform public.journaliser_admin(
    'contestations.detail', 'link_contests', v_id::text, v_proprietaire, p_ip_hash, '{}'::jsonb
  );

  return query
    select c.id, c.message, c.image_key, c.created_at,
           (select count(*)::integer from public.link_contests x
             where x.order_id = c.order_id and x.blocked_at = c.blocked_at)
    from public.link_contests c
    where c.id = v_id;
end;
$$;

comment on function public.lire_contestation_admin(uuid, text) is
  'L''administration lit la contestation en attente d''une commande. Chaque lecture est tracée.';

revoke all on function public.lire_contestation_admin(uuid, text) from public;
grant execute on function public.lire_contestation_admin(uuid, text) to authenticated;

-- ── 6. Refuser — l'administration, avec une réponse que le vendeur lit ───────────
create function public.refuser_contestation(p_contestation uuid, p_reponse text, p_ip_hash text)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id     uuid;
  v_reponse      text := nullif(btrim(coalesce(p_reponse, '')), '');
  v_proprietaire uuid;
  v_commande     uuid;
  v_statut       public.contest_status;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_reponse is null then
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  if char_length(v_reponse) > 1000 then
    raise exception 'reponse trop longue' using errcode = 'DL066';
  end if;

  select s.owner_id, c.order_id, c.status into v_proprietaire, v_commande, v_statut
  from public.link_contests c
  join public.shops s on s.id = c.shop_id
  where c.id = p_contestation
  for update of c;

  if v_proprietaire is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_statut <> 'en_attente' then
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.contestation_refusee', 'link_contests', p_contestation::text, v_proprietaire, p_ip_hash,
    jsonb_build_object('motif', v_reponse, 'commande', v_commande)
  );

  update public.link_contests
     set status = 'refusee', decided_at = now(), decided_by = v_admin_id, admin_response = v_reponse
   where id = p_contestation;

  return true;
end;
$$;

comment on function public.refuser_contestation(uuid, text, text) is
  'L''administration refuse une contestation ; sa réponse est lue par le vendeur. Le lien reste bloqué.';

revoke all on function public.refuser_contestation(uuid, text, text) from public;
grant execute on function public.refuser_contestation(uuid, text, text) to authenticated;

-- ── 7. Débloquer ferme la contestation en attente ────────────────────────────────
-- Recopiée de la 166, signature inchangée (create or replace garde ses droits) ; seule
-- s'ajoute la clôture : un lien débloqué n'a plus rien à contester, et laisser le dossier
-- « en attente » ferait lire au vendeur une attente qui n'existe plus (contrainte 8). Le
-- motif du déblocage devient la réponse que le vendeur lit.
create or replace function public.debloquer_lien_commande(
  p_commande uuid,
  p_motif    text,
  p_ip_hash  text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id     uuid;
  v_motif        text := nullif(btrim(coalesce(p_motif, '')), '');
  v_proprietaire uuid;
  v_bloque_le    timestamptz;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_motif is null then
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  select s.owner_id, o.admin_blocked_at into v_proprietaire, v_bloque_le
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = p_commande
  for update of o;

  if v_proprietaire is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_bloque_le is null then
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.deblocage_lien', 'orders', p_commande::text, v_proprietaire, p_ip_hash,
    jsonb_build_object('motif', v_motif, 'bloque_depuis', v_bloque_le)
  );

  update public.orders set admin_blocked_at = null where id = p_commande;

  update public.link_contests
     set status = 'acceptee', decided_at = now(), decided_by = v_admin_id,
         admin_response = left(v_motif, 1000)
   where order_id = p_commande
     and status = 'en_attente';

  return true;
end;
$$;
