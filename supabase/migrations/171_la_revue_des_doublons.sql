-- 171 — LA REVUE DE LA 170 : UN FAUX POSITIF ET TROIS FAUX NÉGATIFS.
--
-- Revue de la base du 20/09/2026, avant tout déploiement de la 170 (appliquée à la base de TESTS
-- seulement, donc jamais rouverte — les correctifs sont une nouvelle migration).
--
--   🔴 FAUX POSITIF : `instagram.com/stories/highlights/<id>`, le lien d'un TEMPS FORT, rendait
--      « instagram:highlights » — le MÊME identifiant pour tous les vendeurs qui en partagent un.
--      Un temps fort ne porte aucun nom de compte. Avec lui, la liste fermée des pages du service
--      s'allonge des chemins qu'Instagram réserve, et qu'aucun compte ne peut donc porter.
--   ⚠️ FAUX NÉGATIFS : « www.m. » ne perdait que « www. » (l'hôte restait `m.tiktok.com`) ; une
--      requête portant un « ? » littéral commençait au DERNIER « ? ».
--   La fonction est aussi déclarée `parallel safe`, ce qu'elle est (aucune lecture, aucun état) :
--   le parcours des boutiques peut se paralléliser.
--
-- ⚠️ CE QUI RESTE HORS DE PORTÉE, ET C'EST DIT : un domaine accentué (`crème.fr`) ne produit aucun
-- identifiant — les contraintes des migrations 085 et 133 refusent déjà un hôte non ASCII à
-- l'écriture, le cas ne peut donc pas se présenter en base. Et une liste de paramètres de pistage
-- reste une liste : un paramètre inconnu SÉPARE deux liens du même site, il n'en rapproche jamais.

-- ── 1. La même fonction, corrigée (même signature : ses droits sont conservés) ──
create or replace function public.identifiant_public(p_lien text)
  returns text
  language plpgsql
  immutable
  parallel safe
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
  -- Les préfixes « www. » et « m. », même EMPILÉS, un point final, un port : aucun ne change le site.
  v_hote  := regexp_replace(v_hote, ':[0-9]+$', '');
  v_hote  := rtrim(v_hote, '.');
  v_hote  := regexp_replace(v_hote, '^((www|m)\.)+', '');
  if v_hote = '' or v_hote !~ '^[a-z0-9.-]+$' then
    return null;
  end if;

  v_chemin  := coalesce(substring(v_reste from '^[^?#]*'), '');
  -- La requête commence au PREMIER « ? » : `[^#]*` avalait tout jusqu'au dernier.
  v_requete := coalesce(substring(v_reste from '^[^?#]*\?([^#]*)'), '');
  v_segs    := array_remove(string_to_array(v_chemin, '/'), '');

  -- ── Instagram : le nom de compte, premier segment du chemin ──
  if v_hote in ('instagram.com', 'instagr.am') then
    v_nom := v_segs[1];
    if v_nom in ('_u', 'stories') then
      v_nom := v_segs[2];
    end if;
    v_nom := ltrim(coalesce(v_nom, ''), '@');
    -- Une publication, une vidéo, une page du service : ce n'est le compte de personne.
    -- « highlights » : un TEMPS FORT (`stories/highlights/<id>`) ne porte aucun nom de compte.
    if v_nom in ('', 'p', 'reel', 'reels', 'tv', 'explore', 'accounts', 'direct', 'about',
                 'legal', 'developer', 'web', 's', 'ar', 'stories', '_u', 'challenge', 'emails',
                 'highlights', 'directory', 'privacy', 'help', 'press', 'api', 'oauth', 'session',
                 'graphql', 'lite', 'download', 'nametag', 'invites', 'create', 'static', 'topics',
                 'locations', 'terms')
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

-- ── 2. Une dépendance qui doit se lire ──────────────────────────────────────────
comment on function public.identifiants_des_comptes() is
  'Paires distinctes (compte, identifiant public) de toutes les boutiques (170). Interne : appelée par compter_doublons_admin et lister_doublons_admin, jamais accordée. ⚠️ SECURITY INVOKER : elle ne voit TOUTES les boutiques que parce que ses deux appelants sont security definer — appelée d''ailleurs, elle lirait sous la RLS de l''appelant et rendrait MOINS de lignes, sans erreur (171).';
