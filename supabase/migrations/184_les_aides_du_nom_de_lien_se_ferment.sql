-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LES AIDES DU NOM DE LIEN SE FERMENT — correctif de la 182                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DEUX DÉFAUTS DE LA 182, TROUVÉS PAR LES GARDES DU CATALOGUE — c'est-à-dire
-- par une INTERROGATION DE LA BASE, jamais par une relecture du fichier. Un
-- droit d'exécution ne s'écrit pas dans le corps d'une fonction : aucun
-- contrôle textuel ne pouvait les voir (L-027, L-028).
--
--   1. `slug_est_reserve` et `slug_valide` étaient EXÉCUTABLES PAR `PUBLIC`.
--      La 182 révoquait bien les deux fonctions qui agissent
--      (`definir_slug_boutique`, `verifier_slug_commande`) et oubliait les deux
--      aides. Relevé par `tests/rls/catalogue-droits.test.ts`.
--
--   2. Ni l'une ni l'autre n'ÉPINGLAIT son chemin de recherche.
--      Relevé par la sonde F de `tests/rls/catalogue.test.ts`.
--
-- ⚠️ CE QUE CES DEUX OUBLIS EXPOSAIENT RÉELLEMENT, DIT SANS LE GONFLER. Les
-- deux fonctions sont pures : elles ne lisent aucune table et ne rendent qu'un
-- booléen. Ce qui fuitait est la LISTE DES MOTS RÉSERVÉS, qu'un visiteur
-- anonyme pouvait cartographier mot à mot. Ce n'est pas une donnée de vendeur,
-- et c'est tout de même une carte de la surface du produit. Le chemin de
-- recherche compte davantage : `slug_valide` est appelée depuis une CONTRAINTE
-- `CHECK`, et une expression de contrainte dont le chemin de recherche est
-- choisi par l'appelant est précisément ce qu'on ne veut pas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ET LA VRAIE LEÇON EST AILLEURS : « alter default privileges » NE FERME
-- RIEN SUR CETTE BASE. MESURÉ LE 20/09/2026.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La migration 001 pose `alter default privileges in schema public revoke
-- execute on functions from public`, et CLAUDE.md en déduit que « l'objet
-- suivant naît fermé ». C'est FAUX, et ça vient d'être établi par exécution
-- dans une transaction annulée sur la base de tests :
--
--   A. une fonction créée à l'instant, sans rien toucher :
--        {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--   B. après avoir RE-exécuté la ligne exacte de la 001 : identique
--   C. en nommant le rôle créateur (`for role postgres`) : identique
--
-- `pg_default_acl` porte pourtant bien l'entrée attendue pour
-- (postgres, public, fonctions), PUBLIC absent — et les six déclencheurs
-- d'événement de la base ont été lus : aucun n'accorde quoi que ce soit sur
-- `public`. Le MÉCANISME n'est donc pas établi, et on ne l'invente pas.
--
-- Le COMPORTEMENT, lui, est établi trois fois, et c'est lui qui commande :
-- **toute fonction nouvelle doit porter son `revoke` explicite**, et la seule
-- chose qui rattrape un oubli est l'inventaire du catalogue — qui vient de le
-- faire. Une protection qui tient à un réglage dont personne n'a vu l'effet
-- n'est pas une protection (L-029).

-- ── 1. Le chemin de recherche, épinglé ─────────────────────────────────────
--
-- ⚠️ `create or replace` ET NON `drop` : la contrainte `shops_slug_forme`
-- DÉPEND de `slug_valide`, et un `drop` échouerait. La règle du dépôt qui exige
-- un `drop` explicite vise le cas où la LISTE D'ARGUMENTS change — ici elle est
-- identique, donc le remplacement conserve l'OID, donc la contrainte suit.
--
-- Les deux corps sont inchangés au caractère près : seule l'en-tête bouge. Tout
-- ce qu'ils appellent — `lower`, `btrim`, `coalesce`, `~`, `!~`, `= any` — vit
-- dans `pg_catalog`, toujours implicitement présent, et l'appel à l'autre aide
-- était déjà qualifié par son schéma.

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

create or replace function public.slug_valide(p_slug text)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_slug is not null
     and p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and p_slug !~ '--'
     and not public.slug_est_reserve(p_slug);
$$;

-- ── 2. Les droits d'exécution ──────────────────────────────────────────────
--
-- ⚠️ `authenticated` DOIT LES GARDER, ET CE N'EST PAS UNE CONCESSION. Une
-- contrainte `CHECK` s'évalue avec les droits de CELUI QUI ÉCRIT : sans ce
-- `grant`, `public.shops` deviendrait non modifiable par un vendeur dès lors
-- qu'il a posé un nom de lien — et le refus se présenterait comme une erreur de
-- permission sur une fonction, pas comme une violation de contrainte. C'est
-- exactement le montage déjà éprouvé pour `cle_media_canonique` (migration 089),
-- et pour la même raison.
--
-- `anon` n'y a pas droit : il ne fait que LIRE la page client, et une contrainte
-- ne s'évalue qu'à l'écriture.
--
-- `slug_est_reserve` reçoit les mêmes droits que `slug_valide` parce qu'elle est
-- appelée DEPUIS elle et que `slug_valide` n'est pas `security definer` : les
-- droits de l'appelant s'appliquent à l'appel imbriqué.

revoke all on function public.slug_est_reserve(text) from public, anon;
revoke all on function public.slug_valide(text) from public, anon;

grant execute on function public.slug_est_reserve(text) to authenticated, service_role;
grant execute on function public.slug_valide(text) to authenticated, service_role;

comment on function public.slug_valide(text) is
  'Vrai si ce nom de lien est acceptable : 3 à 40 caractères, minuscules, chiffres et tirets internes, aucun tiret double, et non réservé. Une URL se recopie à la main et se dicte au téléphone — d''où l''absence de majuscules et d''accents. Le plancher de trois caractères protège l''espace des noms courts, qui est minuscule et réservé à vie. Accordée à `authenticated` parce que la contrainte CHECK de `shops` s''évalue avec les droits de celui qui écrit.';
