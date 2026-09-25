-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LA PAGE TARIFS RÉSERVE SON MOT — « tarifs », et trois voisins            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- La page publique des tarifs (décision de Wassim, 26/09/2026) ajoute la route
-- `/[locale]/tarifs`. `tarifs` devient un SECOND SEGMENT de `[locale]`, et
-- `tests/rls/lien-au-nom.test.ts` exige que chacun soit réservé : un vendeur Pro
-- qui prendrait « tarifs » comme nom de lien enverrait à ses clients
-- `droplink.fr/tarifs/<jeton>`, qui se lit comme une page officielle — et qui
-- parle d'argent, la pire famille d'usurpation.
--
-- `tarif`, `pricing` et `prix` rejoignent la famille des mots « qui laisseraient
-- croire à une surface officielle » (`paiement`, `facture`) pour la même raison.
--
-- ⚠️ UNE NOUVELLE MIGRATION, JAMAIS LA 191 ROUVERTE : elle est appliquée. La liste
-- ci-dessous est celle de la 191, plus ces quatre mots. `create or replace` et
-- non `drop` : la contrainte `shops_slug_forme` dépend de `slug_valide`, qui
-- appelle celle-ci ; la signature ne change pas, l'OID et les droits tiennent.
-- Aucune ligne existante n'est concernée : la contrainte ne s'évalue qu'à
-- l'écriture.

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
    'inscription', 'marque', 'mot-de-passe-oublie', 'nouveau-mot-de-passe',
    'notification', 'parametres', 'passer-pro', 'signalement', 'tableau-de-bord',
    'tarifs', 'verification',
    -- Fichiers que Next sert au premier niveau
    'favicon.ico', 'robots.txt', 'sitemap.xml',
    -- Mots qui laisseraient croire à une surface officielle
    'www', 'app', 'support', 'aide', 'help', 'compte', 'paiement', 'facture',
    'tarif', 'pricing', 'prix',
    'droplink', 'securite', 'login', 'signin', 'static', '_next'
  ]);
$$;

comment on function public.slug_est_reserve(text) is
  'Vrai si ce nom de lien est réservé au produit. Trois familles : les segments racine servis, les seconds segments de [locale] — parce qu''un jour l''un d''eux pourrait remonter —, et les mots qui laisseraient croire à une surface officielle de DropLink auprès du client d''un vendeur. La liste est ÉPROUVÉE par inventaire des routes réelles, jamais par relecture.';
