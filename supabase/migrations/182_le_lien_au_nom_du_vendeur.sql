-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE LIEN AU NOM DU VENDEUR — fonctionnalité Pro, décision de Wassim 20/09 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- « fait lien customisé la features tu l'implémente parfaitement avec ecc […]
-- et le lien a ton nom c'est une features pro ! »
--
-- `droplink.fr/atelier-nord/xK9…` au lieu de `droplink.fr/p/xK9…`. Le client du
-- vendeur reçoit un lien qui porte le nom de SA boutique, pas le nôtre.
--
-- ── CE QUI EXISTAIT, ET CE QUI N'EXISTAIT PAS ──────────────────────────────
--
-- `shops.slug` est posée depuis les débuts, avec sa contrainte UNIQUE, et
-- depuis ce jour-là : aucune contrainte de FORME, aucun droit d'écriture pour
-- `authenticated`, et AUCUNE route qui la serve. Une colonne dormante.
--
-- ── LA DÉCISION QUI STRUCTURE TOUT : UN ANCIEN SLUG NE MEURT JAMAIS ────────
--
-- Décision de Wassim, 20/09/2026, après lui avoir montré la conséquence :
-- « changeable, anciens gardés ».
--
-- ⚠️ POURQUOI ÇA COMPTE PLUS QUE LE CONFORT DU VENDEUR. Un lien brandé part
-- dans le DM d'un CLIENT — quelqu'un qui n'a pas de compte chez nous, qui n'a
-- rien demandé, et qui ne sera jamais prévenu. Si renommer sa boutique cassait
-- ses anciens liens, le vendeur punirait ses propres clients pour un geste
-- qu'ils ignorent. C'est la même règle que le `public_token` immuable, vue
-- depuis l'autre bout : ce qui est parti doit continuer de répondre.
--
-- D'où `shop_slugs`, qui garde TOUS les noms qu'une boutique a portés. Le slug
-- courant vit toujours dans `shops.slug` — c'est lui qu'on AFFICHE —, et
-- l'historique sert à RÉSOUDRE. Les deux rôles sont distincts, et les confondre
-- ferait soit afficher un ancien nom, soit casser un ancien lien.
--
-- CONSÉQUENCE ASSUMÉE : un slug abandonné reste réservé À VIE. Personne d'autre
-- ne pourra le prendre. C'est le prix de la promesse, et il est juste — laisser
-- un concurrent récupérer « atelier-nord » ferait atterrir les anciens clients
-- chez lui.

-- ── 1. Les mots qu'un vendeur ne peut pas prendre ──────────────────────────
--
-- ⚠️ CETTE LISTE N'EST PAS UNE POLITESSE, C'EST UNE GARDE D'USURPATION. Sans
-- elle, un vendeur prend `admin`, `connexion` ou `docs` — et le jour où le
-- routage change, son lien capture une surface du produit. Pire : il peut se
-- faire passer pour nous auprès de ses propres clients.
--
-- Elle couvre TROIS familles, et il faut les trois :
--   - les segments racine réellement servis : `p`, `api`, et les trois langues ;
--   - tous les seconds segments de `[locale]`, parce qu'un jour l'un d'eux
--     pourrait remonter à la racine ;
--   - les fichiers de premier niveau que Next sert lui-même.
create function public.slug_est_reserve(p_slug text)
  returns boolean
  language sql
  immutable
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    -- Segments racine réellement servis aujourd'hui
    'p', 'api', 'fr', 'en', 'zh-cn',
    -- Seconds segments de `[locale]`
    'admin', 'analyses', 'bienvenue', 'blog', 'commandes', 'conditions',
    'confidentialite', 'connexion', 'docs', 'envois', 'inscription', 'marque',
    'mot-de-passe-oublie', 'nouveau-mot-de-passe', 'parametres', 'signalement',
    'tableau-de-bord', 'verification',
    -- Fichiers que Next sert au premier niveau
    'favicon.ico', 'robots.txt', 'sitemap.xml',
    -- Mots qui laisseraient croire à une surface officielle
    'www', 'app', 'support', 'aide', 'help', 'compte', 'paiement', 'facture',
    'droplink', 'securite', 'login', 'signin', 'static', '_next'
  ]);
$$;

comment on function public.slug_est_reserve(text) is
  'Vrai si ce nom de lien est réservé au produit. Trois familles : les segments racine servis, les seconds segments de [locale] — parce qu''un jour l''un d''eux pourrait remonter —, et les mots qui laisseraient croire à une surface officielle de DropLink auprès du client d''un vendeur.';

-- ── 2. La forme d'un slug ──────────────────────────────────────────────────
--
-- Minuscules, chiffres et tirets INTERNES. Trois à quarante caractères.
--
-- ⚠️ NI MAJUSCULE NI ACCENT, et ce n'est pas une préférence : une URL se
-- recopie à la main depuis une capture d'écran, se dicte au téléphone, et
-- traverse des messageries qui la découpent. `Atelier-Nord` et `atelier-nord`
-- seraient deux liens pour une boutique, et l'un des deux rendrait 404.
--
-- ⚠️ PAS DE TIRET EN TÊTE NI EN QUEUE, et pas deux d'affilée : ils se perdent
-- visuellement, et `atelier--nord` est une usurpation d'`atelier-nord` qui ne
-- se voit pas dans un DM.
create function public.slug_valide(p_slug text)
  returns boolean
  language sql
  immutable
as $$
  select p_slug is not null
     and p_slug ~ '^[a-z0-9]([a-z0-9-]{1,38})?[a-z0-9]$'
     and p_slug !~ '--'
     and not public.slug_est_reserve(p_slug);
$$;

comment on function public.slug_valide(text) is
  'Vrai si ce nom de lien est acceptable : 3 à 40 caractères, minuscules, chiffres et tirets internes, aucun tiret double, et non réservé. Une URL se recopie à la main et se dicte au téléphone — d''où l''absence de majuscules et d''accents.';

alter table public.shops
  add constraint shops_slug_forme
  check (slug is null or public.slug_valide(slug));

-- ── 3. L'historique : un ancien nom continue de servir ─────────────────────
create table public.shop_slugs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  slug text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.shop_slugs is
  'Tous les noms de lien qu''une boutique a portés, y compris les anciens. Ils continuent de résoudre À VIE : un lien brandé part dans le DM d''un client qui n''a pas de compte, n''a rien demandé et ne sera jamais prévenu. Un slug abandonné reste donc réservé pour toujours — le laisser reprendre ferait atterrir les anciens clients chez quelqu''un d''autre.';

create index shop_slugs_shop_id_idx on public.shop_slugs (shop_id);

alter table public.shop_slugs enable row level security;
alter table public.shop_slugs force row level security;

-- Le vendeur lit SES noms, et ceux de personne d'autre. Il n'écrit rien en
-- direct : poser un nom passe par la fonction, qui vérifie le plan.
create policy "un vendeur lit ses propres noms de lien"
  on public.shop_slugs
  for select
  to authenticated
  using (
    shop_id in (
      select s.id from public.shops s
      join public.profiles p on p.id = s.owner_id
      where p.user_id = (select auth.uid())
    )
  );

grant select on public.shop_slugs to authenticated;

-- ── 4. Poser son nom de lien — RÉSERVÉ AU PLAN PRO ─────────────────────────
--
-- ⚠️ LA COLONNE RESTE NON ÉCRIVABLE EN DIRECT. `authenticated` n'obtient
-- aucun `update (slug)` : tout passe par ici, où le plan est vérifié. C'est ce
-- qui garde son sens à la falsification `slug-ouvert`, qui ouvre précisément
-- ce droit pour éprouver la garde.
create function public.definir_slug_boutique(p_slug text)
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_shop     uuid;
  v_plan     public.account_plan;
  v_slug     text := lower(btrim(coalesce(p_slug, '')));
  v_ancien   text;
  v_pris_par uuid;
begin
  select s.id, p.plan, s.slug into v_shop, v_plan, v_ancien
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where p.user_id = (select auth.uid());

  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  -- LE PLAN DÉCIDE, ET C'EST LA SEULE RAISON D'ÊTRE DE CETTE GARDE.
  if v_plan <> 'pro' then
    raise exception 'reserve au plan pro' using errcode = 'DL059';
  end if;

  if not public.slug_valide(v_slug) then
    raise exception 'nom de lien invalide' using errcode = 'DL071';
  end if;

  -- Déjà le sien : rien à faire, et surtout pas une erreur. Réenregistrer le
  -- même formulaire est un geste ordinaire.
  if v_ancien is not distinct from v_slug then
    return v_slug;
  end if;

  -- ⚠️ PRIS PAR QUELQU'UN D'AUTRE, Y COMPRIS DANS SON PASSÉ. C'est l'historique
  -- qu'on interroge, pas seulement les slugs courants : un nom abandonné par un
  -- autre vendeur continue de servir SES anciens liens, donc il n'est pas libre.
  select sl.shop_id into v_pris_par
  from public.shop_slugs sl
  where sl.slug = v_slug;

  if v_pris_par is not null and v_pris_par <> v_shop then
    raise exception 'nom de lien deja pris' using errcode = 'DL072';
  end if;

  -- L'historique d'abord : si l'écriture suivante échouait, mieux vaut un nom
  -- réservé sans être affiché qu'un nom affiché que rien ne résout.
  insert into public.shop_slugs (shop_id, slug)
  values (v_shop, v_slug)
  on conflict (slug) do nothing;

  update public.shops set slug = v_slug where id = v_shop;

  return v_slug;
end;
$$;

comment on function public.definir_slug_boutique(text) is
  'Pose le nom de lien de la boutique de l''appelant. RÉSERVÉE AU PLAN PRO. L''ancien nom est conservé dans shop_slugs et continue de résoudre à vie — un lien parti dans un DM doit continuer de répondre. Un nom déjà porté par une AUTRE boutique, même abandonné, reste indisponible.';

revoke execute on function public.definir_slug_boutique(text) from public, anon;
grant execute on function public.definir_slug_boutique(text) to authenticated;

-- ── 5. Ce nom est-il bien celui de cette commande ? ────────────────────────
--
-- ⚠️ SANS CE CONTRÔLE, N'IMPORTE QUI SERT SA PAGE SOUS LE NOM D'UN AUTRE.
-- Il suffirait de `droplink.fr/<slug-du-concurrent>/<mon-jeton>` pour afficher
-- SA commande sous le nom d'autrui — une usurpation qui ne coûte rien et ne se
-- voit pas, puisque la page est par ailleurs authentique.
--
-- ⚠️ ET ELLE N'AUTORISE RIEN. Le `public_token` reste le seul secret : cette
-- fonction ne fait que comparer. Elle est accordée à `anon` parce que la page
-- client n'a pas de session, et elle ne révèle rien de plus que ce que la page
-- affiche déjà — le nom de la boutique y figure en clair.
create function public.verifier_slug_commande(p_jeton text, p_slug text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.shop_slugs sl on sl.shop_id = o.shop_id
    where o.public_token = p_jeton
      and sl.slug = lower(btrim(coalesce(p_slug, '')))
  );
$$;

comment on function public.verifier_slug_commande(text, text) is
  'Vrai si ce nom de lien appartient à la boutique de cette commande, anciens noms compris. N''AUTORISE RIEN — le public_token reste le seul secret. Sans elle, n''importe qui servirait sa propre page sous le nom d''un concurrent.';

revoke execute on function public.verifier_slug_commande(text, text) from public;
grant execute on function public.verifier_slug_commande(text, text) to anon, authenticated, service_role;
