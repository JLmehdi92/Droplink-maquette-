/*
 * LES QUATRE COMPTEURS EN TÊTE DE LA LISTE DES COMMANDES.
 *
 * POURQUOI UNE FONCTION ET PAS QUATRE REQUÊTES DEPUIS LE CODE. Quatre allers
 * et retours sur l'écran le plus ouvert du produit, c'est quatre fois la
 * latence réseau pour quatre nombres qui s'affichent ensemble. Un seul appel
 * les rend tous.
 *
 * POURQUOI C'EST ABORDABLE ICI, ALORS QUE LE DÉPÔT REFUSE LE COMPTAGE EXACT
 * DANS LA PAGINATION. Ce n'est pas la même opération. La pagination compterait
 * le jeu FILTRÉ, avec recherche plein texte et bornes de date, à chaque page —
 * et ce comptage-là ne se rattrape par aucun index. Ici, chaque compteur est un
 * prédicat simple servi par un index existant :
 *
 *   `(shop_id, status)`            — les deux comptes par statut
 *   index partiel `views_count = 0` — les jamais ouvertes
 *
 * Le plafond réel est de 9 600 commandes pour un vendeur ; un parcours
 * d'index sur ce volume se mesure en millisecondes. `pnpm test:perf` le
 * VÉRIFIE plutôt que cette phrase ne l'affirme — un document qui affirme un
 * état que personne n'a exécuté est le défaut le plus répandu de ce projet.
 *
 * `security invoker` : LA RLS S'APPLIQUE. Cette fonction ne voit que les
 * commandes de celui qui l'appelle, exactement comme une lecture directe. Un
 * `security definer` ici aurait rendu les compteurs de tous les vendeurs à
 * qui sait appeler une RPC.
 *
 * LES ARCHIVÉES SONT EXCLUES, parce que la liste par défaut les exclut. Des
 * compteurs qui décrivent un autre jeu que celui affiché juste en dessous
 * seraient pris pour un défaut de la liste.
 *
 * « LIVRÉES » ET NON « LIVRÉES CE MOIS ». La planche dessine le second ; nous
 * n'avons aucune date de livraison en base — `updated_at` bougerait au moindre
 * changement de note interne. Compter sur elle produirait un nombre crédible et
 * faux, ce qui est pire qu'un nombre plus large et exact.
 */

create or replace function public.compter_commandes_par_etat()
returns table (
  preparation bigint,
  en_transit bigint,
  jamais_ouvertes bigint,
  livrees bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where o.status = 'preparation'),
    count(*) filter (where o.status = 'en_transit'),
    count(*) filter (where o.views_count = 0),
    count(*) filter (where o.status = 'livre')
  from public.orders o
  where o.archived_at is null;
$$;

comment on function public.compter_commandes_par_etat() is
  'Les quatre compteurs de tête de la liste des commandes, lus SOUS RLS : la fonction ne voit que les commandes de son appelant.';

/*
 * POSTGRES ACCORDE `EXECUTE` À `PUBLIC` PAR DÉFAUT. Le retrait est explicite :
 * un droit d'exécution ne s'écrit pas dans le corps d'une fonction, donc aucune
 * relecture de code ne peut le voir — il faut interroger le catalogue.
 *
 * Ici la RLS protégerait déjà les lignes même appelée par `anon`. On révoque
 * tout de même : une protection qui tient à ce qu'une SECONDE protection soit
 * en place n'est pas une protection, c'est un sursis.
 */
revoke all on function public.compter_commandes_par_etat() from public;
grant execute on function public.compter_commandes_par_etat() to authenticated;
