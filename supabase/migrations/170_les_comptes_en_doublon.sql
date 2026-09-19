-- 170 — LES COMPTES EN DOUBLON.
--
-- Décision de Wassim, 20/09/2026 : « j'aime bien l'idée des doublons détectés dans l'admin […]
-- faut que la feature soit vraiment parfaite quand elle va détecter les doublons, aucune
-- erreur ». Le cas visé : un vendeur qui dépasse ses commandes gratuites, ouvre un second
-- compte, et recommence.
--
-- Un DOUBLON est un identifiant public — Instagram, TikTok, WhatsApp, site — affiché par les
-- boutiques d'au moins DEUX comptes distincts. C'est un FAIT, jamais une accusation : deux
-- associés peuvent partager un Instagram. Rien ici n'agit ; l'administrateur lit et décide.
--
-- ⚠️ « AUCUNE ERREUR » A DEUX SENS, ET LES DEUX SONT TENUS ICI, PAR UNE SEULE FONCTION :
--   - pas de FAUX NÉGATIF sur les écritures équivalentes d'un même identifiant — majuscules,
--     « www. », « m. », paramètres de partage (?igsh=, ?utm_…), barre finale, `wa.me/336…`
--     contre `api.whatsapp.com/send?phone=336…`, un Instagram saisi dans le champ « site » ;
--   - pas de FAUX POSITIF : rien n'est deviné. Un lien qui ne désigne pas un COMPTE (une
--     publication Instagram, un lien court TikTok, un lien de message WhatsApp, l'accueil nu
--     d'une plateforme partagée) ne produit AUCUN identifiant, donc ne rapproche personne.
--     Aucun indicatif téléphonique n'est ajouté ni retiré : « 0612… » et « 33612… » restent
--     deux chaînes différentes — les rapprocher supposerait le pays.
--
-- Les colonnes contiennent toujours une URL complète (contraintes des migrations 085 et 133) ;
-- la fonction accepte aussi ce que ces contraintes refusent, parce qu'elle ne doit dépendre
-- d'aucune d'elles pour rester juste.

-- ── 1. L'identifiant canonique d'un lien ────────────────────────────────────────
-- 'instagram:<nom>', 'tiktok:<nom>', 'whatsapp:<chiffres>', 'site:<hôte>[/<chemin>][?<requête>]',
-- ou NULL quand le lien ne désigne personne. IMMUTABLE : la même entrée rend toujours la même
-- sortie, sans lire aucune table.
create function public.identifiant_public(p_lien text)
  returns text
  language plpgsql
  immutable
  set search_path = ''
as $$
declare
  v          text := lower(btrim(coalesce(p_lien, '')));
  v_hote     text;
  v_reste    text;
  v_chemin   text;
  v_requete  text;
  v_segs     text[];
  v_nom      text;
  v_chiffres text;
  v_params   text;
begin
  if v = '' then
    return null;
  end if;

  -- Les deux caractères qu'un lien partagé encode le plus souvent.
  v := replace(replace(v, '%40', '@'), '%2b', '+');
  v := regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');

  v_hote  := substring(v from '^[^/?#]*');
  v_reste := substr(v, length(v_hote) + 1);
  -- Un seul préfixe « www. » ou « m. », un point final, un port : aucun ne change le site.
  v_hote  := regexp_replace(v_hote, ':[0-9]+$', '');
  v_hote  := rtrim(v_hote, '.');
  v_hote  := regexp_replace(v_hote, '^(www\.|m\.)', '');
  if v_hote = '' or v_hote !~ '^[a-z0-9.-]+$' then
    return null;
  end if;

  v_chemin  := coalesce(substring(v_reste from '^[^?#]*'), '');
  v_requete := coalesce(substring(v_reste from '^[^#]*\?([^#]*)'), '');
  v_segs    := array_remove(string_to_array(v_chemin, '/'), '');

  -- ── Instagram : le nom de compte, premier segment du chemin ──
  if v_hote in ('instagram.com', 'instagr.am') then
    v_nom := v_segs[1];
    if v_nom in ('_u', 'stories') then
      v_nom := v_segs[2];
    end if;
    v_nom := ltrim(coalesce(v_nom, ''), '@');
    -- Une publication, une vidéo, une page du service : ce n'est le compte de personne.
    if v_nom in ('', 'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'about',
                 'legal', 'developer', 'web', 's', 'ar', 'stories', '_u', 'challenge', 'emails')
       or v_nom !~ '^[a-z0-9._]{1,30}$' or v_nom ~ '^\.+$' then
      return null;
    end if;
    return 'instagram:' || v_nom;
  end if;

  -- ── TikTok : « @nom », premier segment du chemin ──
  if v_hote = 'tiktok.com' then
    v_nom := coalesce(v_segs[1], '');
    if v_nom !~ '^@[a-z0-9._]{1,30}$' or v_nom ~ '^@\.+$' then
      return null;
    end if;
    return 'tiktok:' || substr(v_nom, 2);
  end if;

  -- ── WhatsApp : le numéro, et seulement le numéro ──
  if v_hote = 'wa.me' then
    -- `wa.me/c/<numéro>` est le CATALOGUE du même numéro : même identifiant que `wa.me/<numéro>`.
    if v_segs[1] = 'c' then
      v_segs := v_segs[2:];
    end if;
    v_chiffres := coalesce(v_segs[1], '');
    -- `wa.me/message/…`, `wa.me/qr/…` : un lien opaque, pas un numéro.
    if v_chiffres !~ '^\+?[0-9]+$' or v_segs[2] is not null then
      return null;
    end if;
  elsif v_hote in ('api.whatsapp.com', 'web.whatsapp.com', 'whatsapp.com') then
    if coalesce(v_segs[1], '') <> 'send' then
      return null;
    end if;
    v_chiffres := coalesce(substring('&' || v_requete from '&phone=([^&]*)'), '');
    if v_chiffres !~ '^[+ ]?[0-9]+$' then
      return null;
    end if;
  end if;
  if v_chiffres is not null then
    v_chiffres := regexp_replace(v_chiffres, '[^0-9]', '', 'g');
    -- « 00 » est l'écriture internationale de « + » : les deux désignent le même numéro.
    v_chiffres := regexp_replace(v_chiffres, '^00', '');
    if length(v_chiffres) not between 8 and 15 then
      return null;
    end if;
    return 'whatsapp:' || v_chiffres;
  end if;

  -- ── Les autres hôtes d'un réseau : un lien court ou une page du service, jamais un compte ──
  if v_hote ~ '(^|\.)(instagram\.com|instagr\.am|tiktok\.com|whatsapp\.com|wa\.me)$' then
    return null;
  end if;

  -- ── Le site : hôte, chemin, et la requête sans ses paramètres de pistage ──
  -- L'ACCUEIL NU D'UNE PLATEFORME PARTAGÉE ne désigne personne : deux vendeurs qui écrivent
  -- « linktr.ee » ou « vinted.fr » sans chemin n'ont rien en commun.
  if array_length(v_segs, 1) is null and v_hote in (
       'linktr.ee', 'linktree.com', 'beacons.ai', 'bio.link', 'linkin.bio', 'campsite.bio',
       'taplink.cc', 'carrd.co', 'lnk.bio', 'solo.to', 'wa.link',
       'facebook.com', 'fb.com', 'snapchat.com', 't.me', 'telegram.me', 'youtube.com',
       'youtu.be', 'x.com', 'twitter.com', 'threads.net', 'pinterest.com', 'pinterest.fr',
       'vinted.fr', 'vinted.com', 'leboncoin.fr', 'ebay.fr', 'ebay.com', 'etsy.com',
       'depop.com', 'google.com', 'sites.google.com', 'myshopify.com', 'shopify.com',
       'wixsite.com', 'wix.com', 'square.site', 'gumroad.com', 'discord.gg', 'discord.com') then
    return null;
  end if;

  select string_agg(p, '&' order by p) into v_params
    from unnest(string_to_array(v_requete, '&')) as p
   where p <> ''
     and split_part(p, '=', 1) !~ '^(utm_.*|fbclid|gclid|dclid|msclkid|igsh|igshid|si|ref|ref_src|mc_cid|mc_eid|_ga|_gl|srsltid|feature)$';

  return 'site:' || v_hote
      || case when array_length(v_segs, 1) is null then '' else '/' || array_to_string(v_segs, '/') end
      || case when v_params is null then '' else '?' || v_params end;
end;
$$;

revoke all on function public.identifiant_public(text) from public;
revoke all on function public.identifiant_public(text) from anon, authenticated;

comment on function public.identifiant_public(text) is
  'Identifiant canonique d''un lien de boutique (170) : instagram:, tiktok:, whatsapp:, site: — ou NULL quand le lien ne désigne aucun compte. Ne devine rien (aucun indicatif).';

-- ── 2. Les paires (compte, identifiant) — une seule définition pour compter et lister ──
-- Un compte qui affiche le même Instagram dans deux champs n'est pas un doublon de lui-même :
-- DISTINCT sur (compte, identifiant).
create function public.identifiants_des_comptes()
  returns table (profil_id uuid, identifiant text)
  language sql
  stable
  set search_path = ''
as $$
  select distinct s.owner_id, i.identifiant
    from public.shops s
   cross join lateral (values (s.instagram_url), (s.tiktok_url), (s.whatsapp_url), (s.site_url)) as l(lien)
   cross join lateral (select public.identifiant_public(l.lien) as identifiant) as i
   where i.identifiant is not null;
$$;

revoke all on function public.identifiants_des_comptes() from public;
revoke all on function public.identifiants_des_comptes() from anon, authenticated;

comment on function public.identifiants_des_comptes() is
  'Paires distinctes (compte, identifiant public) de toutes les boutiques (170). Interne : appelée par compter_doublons_admin et lister_doublons_admin, jamais accordée.';

-- ── 3. Compter : des NOMBRES, donc aucune entrée au journal ─────────────────────
-- Même règle que les tuiles de la liste des comptes : compter n'est pas consulter.
create function public.compter_doublons_admin()
  returns table (identifiants bigint, comptes bigint)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  with paires as (
    select * from public.identifiants_des_comptes()
  ), groupes as (
    select pa.identifiant
      from paires pa
     group by pa.identifiant
    having count(*) >= 2
  )
  select (select count(*) from groupes)::bigint,
         (select count(distinct pa.profil_id)
            from paires pa
            join groupes g on g.identifiant = pa.identifiant)::bigint;
end;
$$;

revoke all on function public.compter_doublons_admin() from public;
grant execute on function public.compter_doublons_admin() to authenticated;

comment on function public.compter_doublons_admin() is
  'Nombre d''identifiants partagés par au moins deux comptes, et nombre de comptes concernés (170). Des nombres seulement : aucune trace. Garde interne : est_admin().';

-- ── 4. Lister : des adresses de tiers, donc la trace PRÉCÈDE la lecture ─────────
-- Les 100 identifiants les plus partagés, puis les plus récents. Une ligne par (identifiant,
-- compte). La valeur partagée est rendue : c'est elle qui permet de juger si le rapprochement
-- a un sens, et le vendeur l'affiche lui-même sur chacune de ses pages client.
create function public.lister_doublons_admin(p_ip_hash text)
  returns table (
    genre        text,
    valeur       text,
    profil_id    uuid,
    email        text,
    boutique_nom text,
    statut       public.account_status,
    inscrit_le   timestamptz,
    commandes    bigint
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  perform public.journaliser_admin(
    'comptes.doublons', 'profiles', null, null, p_ip_hash,
    jsonb_build_object('limite', 100)
  );

  return query
  with paires as (
    select * from public.identifiants_des_comptes()
  ), groupes as (
    select pa.identifiant, count(*) as taille, max(p.created_at) as recent
      from paires pa
      join public.profiles p on p.id = pa.profil_id
     group by pa.identifiant
    having count(*) >= 2
     order by count(*) desc, max(p.created_at) desc, pa.identifiant
     limit 100
  )
  select split_part(g.identifiant, ':', 1),
         substr(g.identifiant, strpos(g.identifiant, ':') + 1),
         p.id, p.email, s.name, p.status, p.created_at,
         coalesce(s.commandes_reelles, 0)::bigint
    from groupes g
    join paires pa on pa.identifiant = g.identifiant
    join public.profiles p on p.id = pa.profil_id
    left join public.shops s on s.owner_id = p.id
   order by g.taille desc, g.recent desc, g.identifiant, p.created_at, p.id;
end;
$$;

revoke all on function public.lister_doublons_admin(text) from public;
grant execute on function public.lister_doublons_admin(text) to authenticated;

comment on function public.lister_doublons_admin(text) is
  'Comptes distincts qui affichent le même identifiant public (170). Trace atomique « comptes.doublons », une entrée par consultation, AVANT la lecture. Garde interne : est_admin().';
