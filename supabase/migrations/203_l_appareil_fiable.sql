-- 203 — L'APPAREIL FIABLE : « se souvenir de cet appareil 30 jours ».
--
-- ── LA DÉCISION, WASSIM, 27/09/2026 ─────────────────────────────────────────
-- « À chaque fois que je me reconnecte c'est chiant de redemander le code ; fais
-- un truc comme les gros SaaS, enregistrer ce PC / cette session. » Choix
-- explicites : appareil fiable pendant 30 JOURS ; il ouvre l'espace VENDEUR sans
-- code, mais l'ADMINISTRATION garde toujours le code (la 186 n'est PAS touchée :
-- est_admin() exige `aal2`, et un appareil fiable reste `aal1`).
--
-- ── LE COMPROMIS ASSUMÉ ─────────────────────────────────────────────────────
-- C'est un affaiblissement, choisi en connaissance de cause : le vol de l'appareil
-- ou du cookie « fiable », plus le mot de passe, donne l'espace vendeur pendant
-- 30 jours SANS le second facteur. L'administration, elle, reste protégée.
--
-- ── POURQUOI LA GARDE 156 NE PEUT PAS LIRE UN COOKIE ────────────────────────
-- `exiger_aal_du_compte` (156) s'exécute dans Postgres et ne voit pas les cookies
-- HTTP, seulement le JWT. On marque donc la SESSION : le JWT porte `session_id`
-- (mesuré), et la garde autorise `aal1` si cette session figure dans
-- `sessions_fiables`. La preuve qu'un appareil est fiable est un cookie SIGNÉ,
-- vérifié EN BASE par HMAC (le secret ne quitte jamais la base) : ainsi une
-- session ne peut pas se déclarer fiable elle-même sans présenter le cookie.
--
--   1. Après un vrai code (aal2), `emettre_preuve_appareil` crée l'appareil et
--      rend une preuve signée ; le serveur la pose en cookie `httpOnly` 30 j.
--   2. À une reconnexion (aal1), `confirmer_appareil_fiable` vérifie la preuve et
--      inscrit la session courante dans `sessions_fiables`.
--   3. La garde autorise alors cette session `aal1` — pour l'espace vendeur.
--
-- Révoquer un appareil efface ses sessions fiables : l'accès retombe aussitôt.

-- ── 0. Le secret de signature, aléatoire par environnement ──────────────────
-- Généré à l'application de la migration : il n'est donc JAMAIS dans le dépôt
-- (public), et diffère entre production et base de tests.
create table public.config_appareils_fiables (
  unique_row boolean primary key default true check (unique_row),
  secret bytea not null
);
alter table public.config_appareils_fiables enable row level security;
alter table public.config_appareils_fiables force row level security;
revoke all on public.config_appareils_fiables from anon, authenticated;
insert into public.config_appareils_fiables (secret) values (extensions.gen_random_bytes(32));

comment on table public.config_appareils_fiables is
  'Le secret HMAC des preuves d''appareil fiable (203), aléatoire par environnement, jamais dans le dépôt. Aucune policy : lu par les seules fonctions security definer.';

-- ── 1. Les appareils fiables (liste durable, pour « Paramètres ») ───────────
create table public.appareils_fiables (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  agent      text        not null default '',
  cree_le    timestamptz not null default now(),
  expire_le  timestamptz not null,
  revoque_le timestamptz
);
alter table public.appareils_fiables enable row level security;
alter table public.appareils_fiables force row level security;
revoke all on public.appareils_fiables from anon, authenticated;
-- Le vendeur LIT ses propres appareils (l'écran Paramètres les affiche) ; il ne
-- les crée ni ne les modifie directement — seules les fonctions definer le font.
grant select on public.appareils_fiables to authenticated;
create policy appareils_fiables_lecture_de_soi on public.appareils_fiables
  for select using ((select auth.uid()) = user_id);
create index appareils_fiables_par_user_idx on public.appareils_fiables (user_id, revoque_le);

comment on table public.appareils_fiables is
  'Les appareils qu''un vendeur a marqués « fiables » pour 30 jours (203) : la 2FA y est sautée pour l''espace vendeur, jamais pour l''administration. Le vendeur les lit (Paramètres) et les révoque par `revoquer_appareil_fiable`.';

-- ── 2. Les sessions fiables (ce que la garde 156 interroge) ─────────────────
create table public.sessions_fiables (
  session_id  text        primary key,
  appareil_id uuid        not null references public.appareils_fiables (id) on delete cascade,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  expire_le   timestamptz not null
);
alter table public.sessions_fiables enable row level security;
alter table public.sessions_fiables force row level security;
revoke all on public.sessions_fiables from anon, authenticated;
create index sessions_fiables_par_appareil_idx on public.sessions_fiables (appareil_id);
-- La clé étrangère `user_id` doit préfixer un index (comme toute FK du dépôt) :
-- sans lui, la suppression d'un compte scannerait la table en entier.
create index sessions_fiables_par_user_idx on public.sessions_fiables (user_id);

comment on table public.sessions_fiables is
  'Les sessions (`session_id` du JWT) rattachées à un appareil fiable (203). La garde `exiger_aal_du_compte` y lit si une session `aal1` est fiable. Aucune policy : écrite par les seules fonctions definer, lue par la garde definer.';

-- ── 3. Émettre une preuve d'appareil — À aal2 SEULEMENT ─────────────────────
create function public.emettre_preuve_appareil(p_agent text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_id      uuid;
  v_exp     timestamptz := now() + interval '30 days';
  v_charge  text;
begin
  if (select auth.uid()) is null then
    raise exception 'non authentifie' using errcode = '42501';
  end if;
  -- ⚠️ SEUL UN VRAI SECOND FACTEUR CRÉE LA CONFIANCE. Un appareil ne devient
  -- fiable qu'après un code réellement saisi (aal2) — sinon la fonction
  -- fabriquerait la confiance qu'elle est censée exiger.
  if coalesce((select auth.jwt() ->> 'aal'), 'aal1') <> 'aal2' then
    raise exception 'verification en deux etapes requise' using errcode = '42501';
  end if;

  v_id := gen_random_uuid();
  insert into public.appareils_fiables (id, user_id, agent, expire_le)
  values (v_id, (select auth.uid()), left(coalesce(p_agent, ''), 400), v_exp);

  -- La charge : appareil | utilisateur | expiration (epoch). Le « | » ne peut
  -- entrer en collision ni avec un uuid (tirets) ni avec un entier.
  v_charge := v_id::text || '|' || (select auth.uid())::text || '|' || extract(epoch from v_exp)::bigint::text;

  return jsonb_build_object(
    'charge', v_charge,
    'signature', encode(
      extensions.hmac(convert_to(v_charge, 'utf8'), (select secret from public.config_appareils_fiables), 'sha256'),
      'hex'
    )
  );
end;
$$;

revoke all on function public.emettre_preuve_appareil(text) from public, anon;
grant execute on function public.emettre_preuve_appareil(text) to authenticated;

comment on function public.emettre_preuve_appareil(text) is
  'Crée un appareil fiable (203) et rend une preuve signée (HMAC, secret en base). Refuse à `aal1` : un appareil ne devient fiable qu''après un vrai second facteur. Le serveur pose la preuve en cookie httpOnly 30 j.';

-- ── 4. Confirmer une session à partir d'une preuve — À aal1 (garde exemptée) ─
create function public.confirmer_appareil_fiable(p_charge text, p_signature text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_attendue    bytea;
  v_fournie     bytea;
  v_diff        int := 0;
  i             int;
  v_appareil_id uuid;
  v_user        uuid;
  v_exp         timestamptz;
  v_session     text := (select auth.jwt() ->> 'session_id');
begin
  if (select auth.uid()) is null or v_session is null then
    return false;
  end if;

  -- Vérification de la signature. Un attaquant ne peut pas forger sans le secret,
  -- qui ne quitte pas la base. On compare les OCTETS du HMAC, pas leur hexa.
  v_attendue := extensions.hmac(convert_to(coalesce(p_charge, ''), 'utf8'), (select secret from public.config_appareils_fiables), 'sha256');
  -- `p_signature` est de l'hexa ; un format invalide lève et retombe en refus par
  -- le `when others` plus bas. La LONGUEUR d'un HMAC-SHA256 (32 octets) est
  -- publique : un écart de longueur est un refus franc. Le contenu, lui, se
  -- compare à TEMPS CONSTANT — un repli OR sur TOUS les octets, jamais un `<>`
  -- qui s'arrêterait au premier octet et fuiterait, octet par octet, combien du
  -- HMAC est déjà juste.
  v_fournie := decode(coalesce(p_signature, ''), 'hex');
  if octet_length(v_fournie) <> octet_length(v_attendue) then
    return false;
  end if;
  for i in 0 .. octet_length(v_attendue) - 1 loop
    v_diff := v_diff | (get_byte(v_attendue, i) # get_byte(v_fournie, i));
  end loop;
  if v_diff <> 0 then
    return false;
  end if;

  v_appareil_id := split_part(p_charge, '|', 1)::uuid;
  v_user        := split_part(p_charge, '|', 2)::uuid;
  v_exp         := to_timestamp(split_part(p_charge, '|', 3)::bigint);

  -- ⚠️ LA PREUVE EST LIÉE À SON PORTEUR : un cookie volé pour le compte X ne
  -- rend pas fiable la session du compte Y.
  if v_user <> (select auth.uid()) or v_exp <= now() then
    return false;
  end if;

  -- L'appareil doit toujours exister, ne pas être révoqué ni expiré.
  if not exists (
    select 1 from public.appareils_fiables a
     where a.id = v_appareil_id
       and a.user_id = (select auth.uid())
       and a.revoque_le is null
       and a.expire_le > now()
  ) then
    return false;
  end if;

  insert into public.sessions_fiables (session_id, appareil_id, user_id, expire_le)
  values (v_session, v_appareil_id, (select auth.uid()), v_exp)
  on conflict (session_id) do update set expire_le = excluded.expire_le, appareil_id = excluded.appareil_id;

  return true;
exception
  when others then
    -- Une charge malformée (uuid/entier invalide) est un refus, jamais une erreur
    -- qui remonterait à l'écran de connexion.
    return false;
end;
$$;

revoke all on function public.confirmer_appareil_fiable(text, text) from public, anon;
grant execute on function public.confirmer_appareil_fiable(text, text) to authenticated;

comment on function public.confirmer_appareil_fiable(text, text) is
  'Vérifie une preuve d''appareil fiable (203) et inscrit la session courante dans `sessions_fiables`. Exemptée de la garde 156 pour pouvoir s''exécuter à `aal1`, mais sûre : elle vérifie le HMAC en base et lie la preuve à l''appelant.';

-- ── 5. Révoquer un appareil ─────────────────────────────────────────────────
create function public.revoquer_appareil_fiable(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'non authentifie' using errcode = '42501';
  end if;
  update public.appareils_fiables
     set revoque_le = now()
   where id = p_id and user_id = (select auth.uid()) and revoque_le is null;
  -- Les sessions de cet appareil retombent AUSSITÔT sous la 2FA.
  delete from public.sessions_fiables where appareil_id = p_id and user_id = (select auth.uid());
end;
$$;

revoke all on function public.revoquer_appareil_fiable(uuid) from public, anon;
grant execute on function public.revoquer_appareil_fiable(uuid) to authenticated;

comment on function public.revoquer_appareil_fiable(uuid) is
  'Révoque un appareil fiable de l''appelant (203) et efface ses sessions fiables : l''accès retombe immédiatement sous la 2FA.';

-- ── 5 bis. Révoquer TOUS les appareils fiables de l'appelant ────────────────
-- ⚠️ LE GESTE DE REMÉDIATION. Sans lui, désactiver puis réenrôler la 2FA (le
-- seul chemin de rotation du dépôt), ou changer de mot de passe, laissait vivre
-- 30 jours les appareils déjà marqués fiables sous l'ANCIEN facteur : un couple
-- {charge, signature} volé (stockable hors du cookie httpOnly) rouvrait l'espace
-- vendeur malgré le nouveau facteur enrôlé pour l'exclure. On l'appelle donc à
-- chaque rotation du second facteur ET à chaque changement de mot de passe.
create function public.revoquer_tous_les_appareils_fiables()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'non authentifie' using errcode = '42501';
  end if;
  update public.appareils_fiables
     set revoque_le = now()
   where user_id = (select auth.uid()) and revoque_le is null;
  delete from public.sessions_fiables where user_id = (select auth.uid());
end;
$$;

revoke all on function public.revoquer_tous_les_appareils_fiables() from public, anon;
grant execute on function public.revoquer_tous_les_appareils_fiables() to authenticated;

comment on function public.revoquer_tous_les_appareils_fiables() is
  'Révoque TOUS les appareils fiables de l''appelant (203) : appelée à la rotation du second facteur et au changement de mot de passe, pour que la remédiation d''un vol de facteur soit réellement effective.';

-- ── 6. La garde 156, assouplie pour une session fiable ──────────────────────
create or replace function public.exiger_aal_du_compte()
  returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then
    return;
  end if;
  -- ⚠️ LA CONFIRMATION D'UN APPAREIL FIABLE S'EXÉCUTE À aal1 (203) : sans cette
  -- exemption, la fonction qui inscrit la session fiable serait elle-même
  -- refusée, et rien ne pourrait jamais devenir fiable. Elle est sûre : elle
  -- vérifie le HMAC en base avant d'inscrire quoi que ce soit.
  if current_setting('request.path', true) = '/rpc/confirmer_appareil_fiable' then
    return;
  end if;
  if exists (
    select 1
      from auth.mfa_factors f
     where f.user_id = auth.uid()
       and f.status = 'verified'
  ) then
    -- APPAREIL FIABLE (203) : une session marquée fiable et non expirée passe à
    -- aal1 — pour l'espace vendeur. L'administration exige aal2 par ailleurs
    -- (est_admin/session_double_facteur, 186), qu'un appareil fiable ne satisfait
    -- pas : la 186 reste entière.
    if exists (
      select 1
        from public.sessions_fiables sf
       where sf.session_id = (auth.jwt() ->> 'session_id')
         and sf.expire_le > now()
    ) then
      return;
    end if;
    raise exception 'verification en deux etapes requise'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.exiger_aal_du_compte() from public;
grant execute on function public.exiger_aal_du_compte() to anon, authenticated, service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
