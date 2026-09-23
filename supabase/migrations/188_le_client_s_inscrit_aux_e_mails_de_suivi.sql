-- 188 — LE CLIENT S'INSCRIT LUI-MÊME AUX E-MAILS DE SUIVI.
--
-- Décision de Wassim du 23/09/2026 : c'est le CLIENT FINAL qui donne son adresse,
-- sur sa page de commande, et qui la confirme (double consentement). Au plus
-- trois e-mails par commande : expédié, en transit, livré.
--
-- `orders.notify_email` et `orders.unsubscribe_token` existaient depuis la 006
-- sans qu'aucun chemin ne les lise. Ils servent enfin, et une porte se ferme :
--
-- ⚠️ UN VENDEUR POUVAIT ÉCRIRE `notify_email` POUR N'IMPORTE QUELLE ADRESSE — le
-- droit d'UPDATE de colonne (006) et le droit d'INSERT de table le permettaient,
-- sans aucun écran. Brancher l'envoi sans fermer ça aurait fait de DropLink un
-- relais de spam : n'importe quel compte gratuit envoyait nos e-mails à qui il
-- voulait. Désormais l'adresse n'entre QUE par la confirmation du client.
--
-- LE JETON DE CONFIRMATION N'EST JAMAIS STOCKÉ EN CLAIR : la base garde son
-- empreinte SHA-256. Une lecture de la table (sauvegarde, incident) ne donne le
-- pouvoir de confirmer personne.
--
-- Toutes les fonctions sont réservées à `service_role` : ce sont les route
-- handlers du serveur qui les appellent, après leur propre contrôle de débit.
-- Aucune n'est ouverte à `anon` ni à `authenticated`.

-- ── L'adresse n'est plus écrivable par le vendeur ────────────────────────────
revoke update (notify_email) on public.orders from authenticated;

-- L'INSERT est un droit de TABLE (006) : le retirer colonne par colonne
-- redécoupait tout le droit d'insertion. Un déclencheur le ferme à la place, et
-- il ferme aussi toute voie future — un rôle de l'API ne pose jamais l'adresse.
create function public.refuser_adresse_posee_par_l_api()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.notify_email is not null
     and (tg_op = 'INSERT' or new.notify_email is distinct from old.notify_email)
     and current_user in ('anon', 'authenticated') then
    raise exception 'l''adresse de notification ne se pose que par la confirmation du client'
      using errcode = 'DL073';
  end if;
  return new;
end;
$$;
revoke all on function public.refuser_adresse_posee_par_l_api() from public;

create trigger orders_adresse_du_client_seulement
  before insert or update of notify_email on public.orders
  for each row execute function public.refuser_adresse_posee_par_l_api();

-- ── Les demandes en attente de confirmation ──────────────────────────────────
create table public.notification_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  email       text not null check (
    length(email) <= 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  ),
  -- SHA-256 hexadécimal du jeton envoyé par e-mail. Jamais le jeton lui-même.
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at  timestamptz not null default now() + interval '24 hours',
  created_at  timestamptz not null default now()
);
alter table public.notification_requests enable row level security;
revoke all on public.notification_requests from anon, authenticated;
create index notification_requests_order on public.notification_requests (order_id, created_at);

-- ── Ce qui a été envoyé : UNE ligne par commande et par étape ────────────────
-- La clé primaire EST le verrou d'idempotence : deux passages concurrents de la
-- tâche ne peuvent pas réserver la même étape, donc pas envoyer deux fois.
create table public.notifications_sent (
  order_id   uuid not null references public.orders (id) on delete cascade,
  etape      public.order_status not null,
  sent_at    timestamptz not null default now(),
  primary key (order_id, etape)
);
alter table public.notifications_sent enable row level security;
revoke all on public.notifications_sent from anon, authenticated;

-- ── 1. Le client demande à être prévenu ──────────────────────────────────────
-- Rend la langue et le nom de la boutique, pour écrire l'e-mail de confirmation
-- dans la langue de la page ; ne rend RIEN si le lien est inconnu, archivé ou
-- bloqué — le même vide dans les trois cas, pour ne pas servir d'oracle.
create function public.demander_notification(p_jeton_public text, p_email text, p_token_hash text)
  returns table (langue text, nom_boutique text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_langue text;
  v_nom text;
  v_recentes integer;
begin
  select o.id, s.default_language::text, s.name
    into v_order, v_langue, v_nom
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.public_token = p_jeton_public
    and o.archived_at is null
    and o.admin_blocked_at is null;

  if v_order is null then
    return;
  end if;

  -- TROIS DEMANDES PAR HEURE ET PAR COMMANDE. Au-delà, la page d'un client ne
  -- sert pas à inonder une boîte de liens de confirmation.
  select count(*) into v_recentes
  from public.notification_requests r
  where r.order_id = v_order and r.created_at > now() - interval '1 hour';
  if v_recentes >= 3 then
    raise exception 'trop de demandes pour cette commande' using errcode = 'DL074';
  end if;

  insert into public.notification_requests (order_id, email, token_hash)
  values (v_order, lower(trim(p_email)), p_token_hash);

  return query select v_langue, v_nom;
end;
$$;
revoke all on function public.demander_notification(text, text, text) from public, anon, authenticated;
grant execute on function public.demander_notification(text, text, text) to service_role;

-- ── 2. Le client confirme depuis sa boîte ────────────────────────────────────
-- Pose l'adresse, efface les demandes de la commande, et MARQUE L'ÉTAPE COURANTE
-- comme déjà annoncée : s'inscrire sur un colis déjà en transit ne doit pas
-- déclencher dans la minute un e-mail « votre colis est en transit ». Le premier
-- e-mail est la PROCHAINE étape.
create function public.confirmer_notification(p_token_hash text)
  returns table (langue text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_email text;
  v_etape public.order_status;
  v_langue text;
begin
  select r.order_id, r.email into v_order, v_email
  from public.notification_requests r
  where r.token_hash = p_token_hash and r.expires_at > now();

  if v_order is null then
    return;
  end if;

  update public.orders set notify_email = v_email where id = v_order
  returning status into v_etape;

  delete from public.notification_requests where order_id = v_order;

  insert into public.notifications_sent (order_id, etape)
  values (v_order, v_etape)
  on conflict do nothing;

  select s.default_language::text into v_langue
  from public.orders o join public.shops s on s.id = o.shop_id
  where o.id = v_order;

  return query select v_langue;
end;
$$;
revoke all on function public.confirmer_notification(text) from public, anon, authenticated;
grant execute on function public.confirmer_notification(text) to service_role;

-- ── 3. Le client se désinscrit ───────────────────────────────────────────────
-- Par `unsubscribe_token`, immuable (007) et distinct du jeton public : le lien
-- de désinscription ne donne pas accès à la commande.
create function public.desabonner_notification(p_jeton text)
  returns table (langue text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_langue text;
begin
  update public.orders o set notify_email = null
  from public.shops s
  where o.unsubscribe_token = p_jeton and s.id = o.shop_id
  returning s.default_language::text into v_langue;

  if v_langue is null then
    return;
  end if;
  return query select v_langue;
end;
$$;
revoke all on function public.desabonner_notification(text) from public, anon, authenticated;
grant execute on function public.desabonner_notification(text) to service_role;

-- ── 4. Ce qu'il reste à envoyer ──────────────────────────────────────────────
-- Les commandes dont le client est inscrit, dont l'étape courante est l'une des
-- trois annoncées, et qui ne l'ont pas encore été. Une commande archivée ou dont
-- le lien est bloqué n'écrit plus à personne.
create function public.notifications_a_envoyer(p_limite integer)
  returns table (
    order_id uuid,
    etape public.order_status,
    email text,
    jeton_public text,
    jeton_desinscription text,
    langue text,
    nom_boutique text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.id, o.status, o.notify_email, o.public_token, o.unsubscribe_token,
         s.default_language::text, s.name
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.notify_email is not null
    and o.status in ('expedie', 'en_transit', 'livre')
    and o.archived_at is null
    and o.admin_blocked_at is null
    and not exists (
      select 1 from public.notifications_sent n
      where n.order_id = o.id and n.etape = o.status
    )
  order by o.updated_at
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$$;
revoke all on function public.notifications_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.notifications_a_envoyer(integer) to service_role;

-- ── 5. Réserver une étape AVANT d'envoyer, la rendre si l'envoi échoue ───────
create function public.reserver_notification(p_order uuid, p_etape public.order_status)
  returns boolean
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  with ins as (
    insert into public.notifications_sent (order_id, etape)
    values (p_order, p_etape)
    on conflict do nothing
    returning 1
  )
  select exists (select 1 from ins)
$$;
revoke all on function public.reserver_notification(uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.reserver_notification(uuid, public.order_status) to service_role;

create function public.rendre_notification(p_order uuid, p_etape public.order_status)
  returns void
  language sql
  volatile
  security definer
  set search_path = ''
as $$
  delete from public.notifications_sent where order_id = p_order and etape = p_etape
$$;
revoke all on function public.rendre_notification(uuid, public.order_status) from public, anon, authenticated;
grant execute on function public.rendre_notification(uuid, public.order_status) to service_role;
