-- 169 — LE VENDEUR LIT LE MOTIF DU BLOCAGE DE SON LIEN.
--
-- Décision de Wassim, 20/09/2026 : « oui on montre la raison au vendeur ». Jusqu'ici le motif
-- ne vivait que dans le journal d'audit (166), que le vendeur ne lit pas : il voyait son lien
-- bloqué sans savoir pourquoi, et contestait à l'aveugle.
--
-- ⚠️ LE MOTIF EST DÉSORMAIS UN TEXTE DESTINÉ AU VENDEUR. L'administrateur l'écrit en le sachant
-- — l'écran le lui dit. Le journal garde sa copie : c'est la pièce opposable, qui survit au
-- déblocage ; la colonne, elle, ne décrit que le blocage EN COURS et s'efface avec lui.

-- ── 1. La colonne ───────────────────────────────────────────────────────────────
-- Lisible par le vendeur comme toute la ligne (SELECT accordé sur la table, 006) ; écrite par
-- PERSONNE d'autre que les deux fonctions ci-dessous : UPDATE sur orders est accordé colonne par
-- colonne (006, 056, 059), et celle-ci n'y figure pas.
alter table public.orders add column admin_block_reason text
  check (admin_block_reason is null or char_length(admin_block_reason) <= 1000);

comment on column public.orders.admin_block_reason is
  'Motif du blocage EN COURS, lu par le vendeur (169). Null quand le lien n''est pas bloqué.';

-- Les liens déjà bloqués retrouvent leur motif dans le journal : le dernier blocage de chaque
-- commande encore bloquée.
update public.orders o
   set admin_block_reason = left(j.motif, 1000)
  from (
    select distinct on (l.resource_id) l.resource_id, l.payload ->> 'motif' as motif
      from public.admin_audit_log l
     where l.action = 'compte.blocage_lien'
     order by l.resource_id, l.occurred_at desc
  ) j
 where o.id::text = j.resource_id
   and o.admin_blocked_at is not null;

-- ── 2. Bloquer écrit aussi le motif sur la commande ─────────────────────────────
-- Recopiée de la 166, signature inchangée (create or replace garde ses droits) ; seule s'ajoute
-- l'écriture de la colonne.
create or replace function public.bloquer_lien_commande(
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

  if v_bloque_le is not null then
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.blocage_lien', 'orders', p_commande::text, v_proprietaire, p_ip_hash,
    jsonb_build_object('motif', v_motif)
  );

  update public.orders
     set admin_blocked_at = now(), admin_block_reason = left(v_motif, 1000)
   where id = p_commande;

  return true;
end;
$$;

-- ── 3. Débloquer efface le motif ────────────────────────────────────────────────
-- Recopiée de la 168 (qui clôt la contestation en attente) ; seule s'ajoute l'effacement du
-- motif : le lien n'est plus bloqué, il n'y a plus rien à expliquer au vendeur.
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

  update public.orders set admin_blocked_at = null, admin_block_reason = null where id = p_commande;

  update public.link_contests
     set status = 'acceptee', decided_at = now(), decided_by = v_admin_id,
         admin_response = left(v_motif, 1000)
   where order_id = p_commande
     and status = 'en_attente';

  return true;
end;
$$;
