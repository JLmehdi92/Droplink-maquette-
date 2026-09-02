/*
 * LA CADENCE N'INTERROGEAIT JAMAIS AUCUN COLIS.
 *
 * DÉFAUT BLOQUANT, mesuré le 02/09/2026. `colis_a_interroger` réserve les colis
 * en écrivant `set last_query_at = now()`, puis les rend avec
 * `returning p.last_query_at` — c'est-à-dire la valeur d'APRÈS l'écriture.
 * L'appelant reçoit donc, pour chaque colis, une « dernière interrogation »
 * vieille de zéro seconde.
 *
 * CE QUE `decider` EN FAIT, ET C'EST LÀ QUE TOUT MEURT :
 *
 *   - la branche « première interrogation immédiate » teste
 *     `derniereInterrogation === null`. Elle ne peut plus être vraie : la
 *     réservation vient de poser une date. Le colis dont le vendeur VIENT de
 *     coller le numéro, et qui attend devant son écran, est le premier touché ;
 *   - la branche de cadence calcule `prochaine = derniereInterrogation +
 *     intervalle`, avec un intervalle d'au moins trois heures. Elle est donc
 *     toujours dans le futur, et la décision est toujours « attendre ».
 *
 * MESURÉ : deux colis dont `last_query_at` valait `null` en base ressortent de
 * la fonction avec un âge de ZÉRO seconde. Un balayage de 3 528 combinaisons
 * (étape × interrogations vides × date d'enregistrement × date de mouvement)
 * ne produit JAMAIS « interroger » ; la même grille avec la valeur d'AVANT en
 * produit 3 372.
 *
 * ⚠️ ET CE N'EST PAS LE PIRE. Un colis dont la prise en charge initiale a
 * échoué garde `registered_at` à `null`. La reprise censée le rattraper vit
 * APRÈS la décision dans `cadence.ts`, donc derrière un `continue` qui n'est
 * jamais franchi. Ce colis n'est pas non plus abandonné : `enregistreLe` étant
 * nul, la fenêtre de silence part de `derniereInterrogation`, c'est-à-dire de
 * maintenant, donc zéro jour ; et `empty_count` ne bouge pas puisqu'on
 * n'interroge pas. Il reste éternellement en « Préparation », et le client de
 * son vendeur lit pour toujours « pas encore d'information du transporteur ».
 * Aucun compteur ne le signale, aucune alerte ne se déclenche.
 *
 * POURQUOI AUCUNE PORTE NE L'A VU : les deux moitiés sont éprouvées
 * séparément, et chacune passe. `suivi-colis` vérifie que la RÉSERVATION tient
 * (un second appel ne rend plus le colis) ; `tracking` vérifie que `decider`
 * décide bien — sur des dates FABRIQUÉES À LA MAIN, jamais sur celle que la
 * base rend. **La couture entre les deux n'était éprouvée nulle part.** C'est
 * L-018 : constater qu'une déclaration existe ne prouve pas que son absence
 * bloque. Le garde qui manquait est posé dans `tests/rls/suivi-colis.test.ts`,
 * et il prend la ligne RENDUE, pas une ligne reconstruite.
 *
 * LA CORRECTION : réserver comme avant — l'écriture ne change pas — mais rendre
 * la valeur d'AVANT, capturée dans la sous-requête. Tout le reste de la
 * fonction est repris à l'identique, y compris ses commentaires.
 */

-- DROP EXPLICITE, même si la signature ne change pas : c'est la règle du projet,
-- et elle existe parce qu'un `create or replace` qui rencontrerait une liste de
-- retour différente créerait une SECONDE fonction au lieu de remplacer celle-ci.
drop function if exists public.colis_a_interroger(integer);

create function public.colis_a_interroger(p_limite integer)
  returns table (
    id uuid,
    tracking_number text,
    carrier_code integer,
    normalized_status public.parcel_status,
    registered_at timestamptz,
    last_movement_at timestamptz,
    last_query_at timestamptz,
    empty_count integer
  )
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels p
     -- LA RÉSERVATION EST L'ÉCRITURE. `marquer_interroge` reste appelée ensuite
     -- par l'appelant : elle sert le cas où l'interrogation échoue APRÈS la
     -- réservation, et repose la date une seconde fois sans dommage.
     set last_query_at = now()
    from (
     select c.id, c.last_query_at
     from public.tracked_parcels c
     where c.abandoned_at is null
       and c.normalized_status <> 'livre'
       -- Trois heures : l'intervalle le plus COURT de la cadence. Filtrer plus
       -- finement ici dupliquerait la décision, et deux copies d'une même
       -- décision divergent au premier ajustement de l'une des deux.
       and (c.last_query_at is null or c.last_query_at < now() - interval '3 hours')
     -- `nulls first` n'est pas un détail d'ordre : un colis JAMAIS interrogé est
     -- celui dont le vendeur vient de coller le numéro, et il attend devant son
     -- écran. Le servir en dernier serait servir en dernier le seul qui regarde.
     order by c.last_query_at asc nulls first
     limit greatest(1, least(coalesce(p_limite, 50), 200))
     for update skip locked
   ) as avant
   where p.id = avant.id
  returning p.id, p.tracking_number, p.carrier_code, p.normalized_status,
            p.registered_at, p.last_movement_at,
            -- ⚠️ LA VALEUR D'AVANT, ET C'EST TOUT LE CORRECTIF. `p.last_query_at`
            -- rendrait l'instant de la réservation, donc « il y a zéro seconde »,
            -- et la décision serait « attendre » pour l'éternité.
            avant.last_query_at,
            p.empty_count;
$$;

comment on function public.colis_a_interroger(integer) is
  'Réserve jusqu''à p_limite colis à interroger et rend leur état AVANT réservation. La date rendue est celle d''avant : c''est elle qui fonde la décision de cadence.';

-- Les droits ne survivent PAS au drop : ils sont reposés à l'identique. La
-- fonction n'est atteignable que par le rôle de service — aucun humain, aucun
-- anonyme : elle écrit sans aucune garde interne, et Postgres accorde EXECUTE à
-- PUBLIC par défaut.
revoke all on function public.colis_a_interroger(integer) from public;
grant execute on function public.colis_a_interroger(integer) to service_role;
