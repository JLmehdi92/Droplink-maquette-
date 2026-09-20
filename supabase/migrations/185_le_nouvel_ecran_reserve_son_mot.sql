-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE NOUVEL ÉCRAN RÉSERVE SON MOT — « passer-pro », et deux oublis de la 182║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- L'écran « Passer au Pro » (décision de Wassim, 20/09/2026) ajoute la route
-- `/[locale]/passer-pro`. `passer-pro` devient donc un SECOND SEGMENT de
-- `[locale]`, et la migration 182 dit pourquoi ça compte :
--
--   « tous les seconds segments de `[locale]`, parce qu'un jour l'un d'eux
--     pourrait remonter à la racine »
--
-- ⚠️ ET IL Y A PIRE QUE LA COLLISION DE ROUTAGE. Un vendeur qui prendrait
-- `passer-pro` comme nom de lien enverrait à ses clients des adresses de la
-- forme `droplink.fr/passer-pro/<jeton>` : le premier segment se lirait comme
-- une page officielle de DropLink. C'est la famille d'usurpation que la liste
-- ferme depuis la 182 — `droplink`, `support`, `paiement`, `facture` —, et
-- « passer-pro » y appartient d'autant plus qu'il parle d'argent.
--
-- ⚠️ DEUX SEGMENTS RÉELS MANQUAIENT DÉJÀ, ET C'EST LA GARDE D'INVENTAIRE QUI
-- LES A TROUVÉS, PAS UNE RELECTURE : `deconnexion` (`/[locale]/deconnexion`) et
-- `auth` (`/[locale]/auth/retour`). `deconnexion` est le pire des deux — un
-- vendeur qui l'aurait pris aurait envoyé à ses clients des liens commençant
-- par le mot que le produit emploie pour fermer une session.
--
-- ⚠️ POURQUOI UNE MIGRATION PLUTÔT QU'UNE LIGNE AJOUTÉE À LA 182 : la 182 est
-- APPLIQUÉE. Une migration ne se rouvre jamais, les correctifs sont de
-- NOUVELLES migrations — sinon l'ordre lexicographique cesse d'être l'ordre
-- d'application, et une reconstruction depuis zéro exécuterait une séquence que
-- la production n'a jamais connue.
--
-- ⚠️ ET CE N'EST PAS UNE LIGNE À NE PAS OUBLIER, C'EST UNE GARDE.
-- `tests/rls/lien-au-nom.test.ts` INVENTORIE désormais les seconds segments
-- réels de `src/app/[locale]/` et exige que `slug_est_reserve` les refuse tous.
-- L'écran suivant fera rougir la suite tant que son mot n'est pas réservé, au
-- lieu de compter sur la mémoire de qui l'ajoute.
--
-- `create or replace` et non `drop` : la contrainte `shops_slug_forme` dépend
-- de `slug_valide`, qui appelle celle-ci. La signature ne change pas, donc le
-- remplacement conserve l'OID et la chaîne tient. Aucune ligne existante n'est
-- concernée : personne ne porte ces mots, et si quelqu'un les portait il les
-- garderait — la contrainte ne s'évalue qu'à l'écriture.

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
    'parametres', 'passer-pro', 'signalement', 'tableau-de-bord',
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
