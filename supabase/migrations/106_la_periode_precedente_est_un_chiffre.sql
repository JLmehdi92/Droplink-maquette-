-- 106 — « +12 VS PÉRIODE PRÉCÉDENTE » EST UN CHIFFRE, PAS UNE IMPRESSION.
--
-- POURQUOI. La planche `Analyses` écrit sous le premier compteur « +12 vs
-- période précédente », en vert. C'est la seule information de l'écran qui dise
-- un SENS et non un état : quarante-sept commandes ne veulent rien dire tant
-- qu'on ne sait pas si c'était trente-cinq le mois d'avant. Et c'est exactement
-- la question que la phase de validation pose — un fournisseur qui crée plus de
-- commandes chaque semaine est le signal roi du brief.
--
-- POURQUOI LA BORNE PRÉCÉDENTE EST UN ARGUMENT, ET NON UN CALCUL INTERNE. La
-- fonction pourrait déduire la longueur de la fenêtre de `now() - p_depuis`.
-- Elle deviendrait alors dépendante de l'horloge de la base, alors que la borne
-- courante vient de celle du serveur applicatif : les deux dérivent l'une de
-- l'autre, et un test qui fixe un instant verrait la fenêtre précédente
-- s'allonger de la distance entre cet instant et le vrai maintenant. Deux
-- bornes, une seule horloge, un résultat reproductible.
--
-- ⚠️ IL N'Y A AUCUN GARDE-FOU EN BASE CONTRE UNE INVERSION DES DEUX BORNES, et
-- c'est assumé : `p_precedent > p_depuis` rendrait un compte négatif de rien du
-- tout — la fenêtre précédente serait vide et le delta vaudrait le total. Le
-- contrôle vit là où les deux bornes naissent, dans `debutPeriode` et
-- `debutPeriodePrecedente`, et un test unitaire affirme leur ordre. Le dire ici
-- vaut mieux que de le laisser croire ailleurs.
--
-- ⚠️ LE `DROP` EST OBLIGATOIRE et il EMPORTE LES DROITS. `create or replace` ne
-- peut ni changer la table de retour ni changer la liste d'arguments — dans le
-- second cas il crée une SECONDE fonction, les deux coexistent, et un appel à un
-- seul argument résout l'ANCIENNE sans la moindre erreur. Après le `drop`, la
-- fonction recréée naît avec `EXECUTE` accordé à `PUBLIC` : les deux dernières
-- lignes ne répètent pas la 037, elles la remplacent.

drop function if exists public.analyser_activite(timestamptz);

create function public.analyser_activite(
  p_depuis timestamptz,
  p_precedent timestamptz
)
  returns table (
    commandes_creees bigint,
    commandes_ouvertes bigint,
    vues_totales bigint,
    qc_approuve bigint,
    qc_refuse bigint,
    qc_en_attente bigint,
    avec_suivi bigint,
    archivees bigint,
    creees_periode_precedente bigint
  )
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  select
    count(*) filter (where o.created_at >= p_depuis),
    -- LE CHIFFRE QUI DIT SI LE PRODUIT SERT À QUELQUE CHOSE. Un lien créé mais
    -- jamais ouvert est un lien que le vendeur n'a pas envoyé, ou que son client
    -- n'a pas cliqué : les deux sont des signaux, et les confondre avec un
    -- succès rendrait toute la mesure inutilisable.
    count(*) filter (where o.created_at >= p_depuis and o.views_count > 0),
    coalesce(sum(o.views_count) filter (where o.created_at >= p_depuis), 0),
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'approuve'),
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'refuse'),
    -- « En attente » N'EST PAS l'absence de réponse : c'est l'état d'une
    -- commande dont le client n'a pas encore tranché. Le déduire par
    -- soustraction produirait un total faux le jour où une valeur d'énumération
    -- s'ajoute, et personne ne le verrait — les trois chiffres continueraient de
    -- s'afficher.
    count(*) filter (where o.created_at >= p_depuis and o.qc_status = 'en_attente'),
    count(*) filter (
      where o.created_at >= p_depuis
        and o.tracking_number is not null
        and o.tracking_number <> ''
    ),
    count(*) filter (where o.created_at >= p_depuis and o.archived_at is not null),
    -- LA FENÊTRE PRÉCÉDENTE EST FERMÉE DES DEUX CÔTÉS : le `where` la borne en
    -- bas, ce filtre la borne en haut. Sans la borne haute, elle contiendrait la
    -- période courante et le delta serait toujours négatif.
    count(*) filter (where o.created_at < p_depuis)
  from public.orders o
  -- LE MÊME « COMMANDE CRÉÉE » QUE PARTOUT AILLEURS : le premier contenu réel,
  -- comme `order_created` et `shops.commandes_reelles`. Compter les brouillons
  -- gonflerait le volume et déprimerait le taux d'ouverture — deux erreurs de
  -- sens opposé sous le même nom.
  where o.created_at >= p_precedent
    and o.first_content_at is not null
$$;

comment on function public.analyser_activite(timestamptz, timestamptz) is
  'Compteurs de l''écran des analyses sur la période, plus les commandes de la période précédente, sous la RLS de l''appelant.';

revoke all on function public.analyser_activite(timestamptz, timestamptz) from public;
grant execute on function public.analyser_activite(timestamptz, timestamptz) to authenticated;
