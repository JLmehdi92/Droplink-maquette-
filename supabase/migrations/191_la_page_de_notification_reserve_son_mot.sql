-- 191 — LA PAGE DE NOTIFICATION RÉSERVE SON MOT.
--
-- Les e-mails de suivi du client (188) ouvrent `/[locale]/notification`. C'est
-- un SECOND SEGMENT de `[locale]`, et la garde d'inventaire
-- (`tests/rls/lien-au-nom.test.ts`) l'a relevé : un vendeur Pro qui prendrait
-- `notification` comme nom de lien enverrait à ses clients des adresses
-- `droplink.fr/notification/<jeton>`, qui se liraient comme une page officielle —
-- et précisément celle où l'on confirme une adresse e-mail.
--
-- Même mécanique que la 185 : `create or replace`, signature inchangée (la
-- contrainte `shops_slug_forme` en dépend), et la 185 n'est pas rouverte.

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
    'verification',
    -- Fichiers que Next sert au premier niveau
    'favicon.ico', 'robots.txt', 'sitemap.xml',
    -- Mots qui laisseraient croire à une surface officielle
    'www', 'app', 'support', 'aide', 'help', 'compte', 'paiement', 'facture',
    'droplink', 'securite', 'login', 'signin', 'static', '_next'
  ]);
$$;

comment on function public.slug_est_reserve(text) is
  'Vrai si ce nom de lien est réservé au produit. Trois familles : les segments racine servis, les seconds segments de [locale] — parce qu''un jour l''un d''eux pourrait remonter —, et les mots qui laisseraient croire à une surface officielle de DropLink auprès du client d''un vendeur. La liste est ÉPROUVÉE par inventaire des routes réelles, jamais par relecture.';
