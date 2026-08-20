-- 008 — Recherche insensible aux accents.
--
-- « creme » doit trouver « Crème ». Ce n'est pas un raffinement : c'est le cas
-- MAJORITAIRE, puisqu'on tape vite dans une barre de recherche et qu'un clavier
-- de téléphone ne propose pas les accents spontanément. Une recherche qui exige
-- l'accent exact paraît cassée sans l'être.
--
-- LE PIÈGE. `unaccent` est déclarée STABLE dans ses DEUX formes — vérifié dans
-- le catalogue de ce projet, pas déduit de la documentation. Une fonction STABLE
-- ne peut entrer ni dans un index, ni dans une colonne générée : Postgres refuse,
-- parce qu'il n'a aucune garantie que la valeur indexée restera vraie.
--
-- L'ENROBAGE IMMUABLE ci-dessous épingle le DICTIONNAIRE. Sans épinglage, le
-- résultat dépendrait du `search_path` de l'appelant, et deux sessions pourraient
-- indexer puis chercher avec deux dictionnaires différents.
--
-- RÉSERVE ASSUMÉE, ÉCRITE ICI POUR QUE PERSONNE NE LA REDÉCOUVRE : déclarer
-- IMMUTABLE une fonction qui lit un fichier de dictionnaire est une promesse un
-- peu plus forte que la réalité. Si ce fichier changeait, les valeurs déjà
-- calculées deviendraient fausses sans que rien ne le signale. C'est le compromis
-- retenu par l'ensemble de l'écosystème Postgres, et la conséquence pratique
-- tient en une phrase : après une mise à jour du dictionnaire, la colonne
-- générée doit être recalculée.

create function public.sans_accents(p_texte text)
  returns text
  language sql
  immutable
  strict
  parallel safe
  set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texte)
$$;

-- La fonction n'est PAS accordée à `authenticated` : la colonne générée est
-- calculée à l'écriture, donc aucune requête de lecture n'a besoin de l'appeler.
-- Ce qui n'est appelé par personne ne s'accorde à personne.
revoke execute on function public.sans_accents(text) from public, anon, authenticated;

/*
 * COLONNE GÉNÉRÉE plutôt qu'index d'expression.
 *
 * Trois raisons, dans l'ordre de leur importance :
 *
 *   1. Un index d'expression obligerait chaque requête à RÉÉCRIRE l'expression
 *      à l'identique pour être utilisée. La moindre divergence — un `lower()`
 *      oublié, un ordre de concaténation différent — produirait un balayage
 *      complet, silencieusement. Une colonne matérialisée ne peut pas diverger.
 *   2. Elle couvre les TROIS champs cherchés d'un coup, avec un seul index, au
 *      lieu de trois index et de trois conditions à combiner.
 *   3. Les requêtes n'appellent aucune fonction, donc `authenticated` n'a besoin
 *      d'aucun droit d'exécution supplémentaire.
 *
 * Le numéro de suivi entre dans la recherche parce que c'est ce que le vendeur
 * colle quand un client le relance en citant son numéro.
 */
alter table public.orders
  add column recherche text
  generated always as (
    public.sans_accents(
      lower(
        coalesce(customer_label, '') || ' ' ||
        coalesce(product_ref, '') || ' ' ||
        coalesce(tracking_number, '')
      )
    )
  ) stored;

-- La colonne est calculée par la base : elle n'est écrite par personne, et
-- Postgres refuserait un `grant update` dessus. Elle est lisible avec le reste
-- de la ligne, sous la même policy.

/*
 * PAS D'INDEX TRIGRAMME POUR L'INSTANT, ET C'EST DÉLIBÉRÉ.
 *
 * Un seuil dépassé ne veut pas dire qu'il manque un index : il faut d'abord
 * vérifier que la requête ne demande pas plus que nécessaire. Ici la RLS réduit
 * déjà l'ensemble aux commandes d'UN vendeur ; le balayage porte donc sur ses
 * quelques milliers de lignes, pas sur la table entière.
 *
 * `pg_trgm` coûterait un index GIN sur toutes les lignes de tous les vendeurs,
 * donc un surcoût à CHAQUE écriture, pour accélérer une lecture dont on n'a pas
 * encore établi qu'elle est lente. On mesure d'abord, au plafond, avec un compte
 * voisin de même volumétrie — et on posera l'index dans une nouvelle migration
 * si la mesure le réclame.
 */
create index orders_recherche_idx on public.orders (shop_id, recherche text_pattern_ops);
