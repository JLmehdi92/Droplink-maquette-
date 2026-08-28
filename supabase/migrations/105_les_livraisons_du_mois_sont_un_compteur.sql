-- 105 — « LIVRÉS CE MOIS » ENTRE DANS LES COMPTEURS DES ENVOIS.
--
-- POURQUOI. La planche `Envois` pose quatre compteurs en tête : colis suivis,
-- en transit, sans mouvement au-delà de dix jours, et LIVRÉS CE MOIS. Le
-- produit en rendait un quatrième différent — les colis abandonnés — qui est un
-- fait sur NOUS (nous avons cessé d'interroger) et non sur l'activité du
-- vendeur. Il reste calculé, parce qu'un filtre s'en sert ; il n'occupe plus la
-- quatrième carte.
--
-- CE QUE LE COMPTEUR DIT VRAIMENT. Un colis « livré » ne bouge plus par
-- définition : son dernier mouvement EST sa livraison. Compter les livrés dont
-- le dernier mouvement tombe dans le mois courant revient donc à compter les
-- livraisons du mois, et c'est la seule date dont on dispose — il n'existe pas
-- de colonne « livré le ». Le commentaire est ici pour que personne ne croie
-- plus tard qu'on a mesuré autre chose.
--
-- POURQUOI DANS LA MÊME FONCTION. Elle fait déjà UN parcours des colis du
-- vendeur pour ses six agrégats. Un septième voyage dans ce parcours : ni une
-- lecture de plus, ni un aller-retour de plus. Le demander à part aurait payé
-- deux fois la même ligne.
--
-- ⚠️ `create or replace` NE PEUT PAS changer la table de retour d'une fonction —
-- Postgres lève « cannot change return type of existing function ». Le `drop`
-- est donc obligatoire, et il est SANS AMBIGUÏTÉ ici : la signature `(int)` est
-- unique, il n'existe pas de surcharge à laquelle un appel pourrait se résoudre
-- en silence.
--
-- ⚠️ ET LE `DROP` EMPORTE LES DROITS. Postgres accorde `EXECUTE` à `PUBLIC` par
-- défaut : la fonction recréée NAÎT OUVERTE, et le `revoke` de la 036 ne la
-- protège plus — il portait sur un objet qui n'existe plus. Les deux lignes de
-- fin ne sont pas une redite, elles sont la protection.

drop function if exists public.compter_envois(int);

create function public.compter_envois(p_silence_jours int)
  returns table (
    total bigint,
    preparation bigint,
    expedie bigint,
    en_transit bigint,
    livre bigint,
    silencieux bigint,
    abandonnes bigint,
    livres_ce_mois bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where tp.normalized_status = 'preparation'),
    count(*) filter (where tp.normalized_status = 'expedie'),
    count(*) filter (where tp.normalized_status = 'en_transit'),
    count(*) filter (where tp.normalized_status = 'livre'),
    -- LE SILENCE NE CONCERNE QUE CE QUI EST ENCORE EN ROUTE. Un colis livré ne
    -- bouge plus par définition : le compter comme silencieux ferait grossir
    -- l'alerte avec les livraisons réussies, c'est-à-dire avec le succès. Une
    -- alerte qui se déclenche quand tout va bien est une alerte qu'on apprend à
    -- ignorer.
    count(*) filter (
      where tp.normalized_status <> 'livre'
        and tp.abandoned_at is null
        and tp.immobile_depuis < now() - make_interval(days => p_silence_jours)
    ),
    count(*) filter (where tp.abandoned_at is not null),
    -- MOIS CALENDAIRE, et non trente jours glissants : la carte dit « ce mois »,
    -- et un vendeur qui compare à sa facture compare à des mois.
    count(*) filter (
      where tp.normalized_status = 'livre'
        and tp.last_movement_at >= date_trunc('month', now())
    )
  from public.tracked_parcels tp
$$;

comment on function public.compter_envois(int) is
  'Compteurs de l''écran des envois, sous la RLS de l''appelant.';

revoke all on function public.compter_envois(int) from public;
grant execute on function public.compter_envois(int) to authenticated;
