-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LES MENTIONS LÉGALES RÉSERVENT LEUR MOT — « mentions-legales », et deux   ║
-- ║ voisins                                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La page des mentions légales (29/09/2026, obligation LCEN de l'éditeur) ajoute
-- la route `/[locale]/mentions-legales`. C'est un SECOND SEGMENT de `[locale]`,
-- et `tests/rls/lien-au-nom.test.ts` exige que chacun soit réservé — il a rougi
-- à la première porte, exactement pour ça. Un vendeur Pro qui prendrait ce nom
-- enverrait à ses clients `droplink.fr/mentions-legales/<jeton>`, qui se lit
-- comme la page légale de DropLink.
--
-- `mentions` et `legal` rejoignent la famille des mots « qui laisseraient croire
-- à une surface officielle » pour la même raison.
--
-- ⚠️ UNE NOUVELLE MIGRATION, JAMAIS LA 195 ROUVERTE : elle est appliquée. La liste
-- ci-dessous est celle de la 195, plus ces trois mots. `create or replace` et
-- non `drop` : la contrainte `shops_slug_forme` dépend de `slug_valide`, qui
-- appelle celle-ci ; la signature ne change pas, l'OID et les droits tiennent.
-- ⚠️ « LA CONTRAINTE NE S'ÉVALUE QU'À L'ÉCRITURE » (la 195) NE SUFFIT PAS : une
-- contrainte CHECK se réévalue à CHAQUE mise à jour de la ligne. Une boutique qui
-- porterait déjà l'un des trois mots ne pourrait plus rien modifier — logo,
-- couleur, langue — sans que rien ne dise pourquoi. La migration le VÉRIFIE donc
-- d'abord, et s'arrête plutôt que de bloquer un vendeur en silence.

do $$
begin
  if exists (
    select 1 from public.shops
     where lower(btrim(coalesce(slug, ''))) in ('mentions-legales', 'mentions', 'legal')
  ) then
    raise exception '208 : une boutique porte déjà un nom de lien qui devient réservé (mentions-legales, mentions, legal) — la renommer avant de migrer';
  end if;
end
$$;

create or replace function public.slug_est_reserve(p_slug text)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    -- Segments racine réellement servis aujourd'hui
    'p', 'api', 'fr', 'en', 'zh-cn',
    -- Seconds segments de `[locale]`
    'admin', 'analyses', 'auth', 'bienvenue', 'blog', 'commandes', 'conditions',
    'confidentialite', 'connexion', 'deconnexion', 'docs', 'envois',
    'inscription', 'marque', 'mentions-legales', 'mot-de-passe-oublie',
    'nouveau-mot-de-passe', 'notification', 'parametres', 'passer-pro',
    'signalement', 'tableau-de-bord', 'tarifs', 'verification',
    -- Fichiers que Next sert au premier niveau
    'favicon.ico', 'robots.txt', 'sitemap.xml',
    -- Mots qui laisseraient croire à une surface officielle
    'www', 'app', 'support', 'aide', 'help', 'compte', 'paiement', 'facture',
    'tarif', 'pricing', 'prix', 'mentions', 'legal',
    'droplink', 'securite', 'login', 'signin', 'static', '_next'
  ]);
$$;

comment on function public.slug_est_reserve(text) is
  'Vrai si ce nom de lien est réservé au produit. Trois familles : les segments racine servis, les seconds segments de [locale] — parce qu''un jour l''un d''eux pourrait remonter —, et les mots qui laisseraient croire à une surface officielle de DropLink auprès du client d''un vendeur. La liste est ÉPROUVÉE par inventaire des routes réelles, jamais par relecture.';
