-- 090 — LE COLIS MET À JOUR LA COMMANDE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `appliquer_etat_colis` écrivait dans `tracked_parcels` et NULLE PART AILLEURS.
-- Le tableau de bord, lui, lit `orders.status` — une colonne que seul le vendeur
-- posait, à la main.
--
-- Les deux moitiés du produit vivaient donc côte à côte sans se parler : le
-- transporteur annonce « livré », la page du client l'affiche, l'écran Envois
-- l'affiche, et la GESTION DE COMMANDES continue d'afficher « préparation ».
-- Un fournisseur à deux cents commandes par semaine devait repasser chaque
-- ligne à la main — c'est-à-dire refaire exactement le travail que le suivi
-- automatique existe pour supprimer.
--
-- Rien ne signalait ce trou : les deux colonnes existent, les deux écrans
-- répondent, aucune requête n'échoue. C'est une divergence silencieuse entre
-- deux sources de vérité, et elle grandit avec l'usage.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA RÈGLE, ET POURQUOI ELLE EST DÉCLARATIVE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Décision produit : « le vendeur prime avant la remise au transporteur, le
-- transporteur après ; LE STATUT NE RECULE JAMAIS ».
--
-- `greatest()` sur l'énumération l'implémente en entier, sans une ligne de
-- logique applicative : l'ordre de `order_status` est
-- `preparation < expedie < en_transit < livre`, donc un état rapporté plus
-- avancé gagne, et un état plus ancien — un point de passage arrivé en retard,
-- une notification rejouée, une régression chez le fournisseur — ne peut rien
-- faire reculer. Écrite ici plutôt que dans l'appelant, la règle est impossible
-- à oublier dans le prochain chemin d'écriture.
--
-- Les deux énumérations `order_status` et `parcel_status` portent les mêmes
-- quatre valeurs mais restent DEUX TYPES : la conversion passe donc par le
-- texte. Vérifié par exécution avant d'écrire cette migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE PIÈGE QUI A FAILLI PASSER : `updated_at`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `orders_toucher_updated_at` est un `BEFORE UPDATE FOR EACH ROW` INCONDITIONNEL.
-- Propager le statut sans précaution ferait donc remonter `updated_at` À CHAQUE
-- PASSAGE DE CADENCE.
--
-- La conséquence n'est pas cosmétique. Le tri « modifiées » est un tri du
-- tableau de bord, et la date de dernière modification s'affiche sur chaque
-- ligne. À deux cents commandes par semaine, le vendeur verrait ses commandes se
-- réordonner toutes seules plusieurs fois par jour et lirait « modifiée il y a
-- deux minutes » partout : la colonne devient du bruit, le tri devient inutile,
-- et RIEN N'INDIQUERAIT POURQUOI — aucune erreur, aucune trace, juste un écran
-- qui ne veut plus rien dire.
--
-- `updated_at` répond à « quand AI-JE touché cette commande ». Une mise à jour
-- venue du transporteur n'est pas une modification du vendeur. On pose donc un
-- marqueur LOCAL À LA TRANSACTION que le déclencheur consulte.
--
-- Pourquoi un marqueur plutôt qu'une liste de colonnes surveillées : `status`
-- est écrit par les DEUX — le vendeur avant la remise, le transporteur après.
-- Aucune liste de colonnes ne peut donc distinguer les deux écritures ; seul
-- le CHEMIN le peut.
--
-- Le marqueur n'est pas une protection de sécurité et ne prétend pas l'être :
-- un vendeur qui le poserait lui-même n'obtiendrait que de masquer sa propre
-- date de modification, à lui seul.

-- ── 1. La date du dernier mouvement, dénormalisée sur la commande ────────────
--
-- POURQUOI DÉNORMALISER plutôt que joindre. Le tri « bloqué en transit » doit
-- rendre cinquante lignes au fond d'un jeu de neuf mille six cents, pour un
-- vendeur parmi des milliers. Une jointure `orders → order_parcels →
-- tracked_parcels` triée sur une colonne de la TROISIÈME table ne peut être
-- servie par aucun index unique : le planificateur trie après jointure, donc il
-- lit toute la tranche du vendeur avant d'en rendre cinquante.
--
-- La colonne est mise à jour dans la MÊME transaction que le colis, donc elle
-- ne peut pas diverger. Le précédent existe déjà sur cette table : `views_count`
-- et `last_viewed_at` sont dénormalisés pour exactement la même raison.
alter table public.orders
  add column parcel_last_movement_at timestamptz;

comment on column public.orders.parcel_last_movement_at is
  'Dernier mouvement rapporté par le transporteur, dénormalisé depuis tracked_parcels pour que le tri « bloqué en transit » tienne à l''échelle. Écrit UNIQUEMENT par appliquer_etat_colis, dans la même transaction que le colis.';

-- ── 2. `updated_at` cesse de suivre le transporteur ──────────────────────────
--
-- Fonction DISTINCTE de `toucher_updated_at`, qui reste partagée par les autres
-- tables : y glisser une règle propre aux commandes la rendrait invisible à qui
-- lit `shops` ou `profiles`, et ferait porter à toutes les tables une condition
-- qui n'a de sens que pour une seule.
create function public.toucher_updated_at_commande()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- `current_setting(..., true)` rend NULL au lieu de lever quand le paramètre
  -- n'a jamais été posé — c'est le cas de TOUTES les écritures du vendeur, donc
  -- le cas normal, et il ne doit surtout pas produire d'erreur.
  if coalesce(current_setting('droplink.maj_transporteur', true), '') = 'oui' then
    -- Le transporteur n'a pas « modifié » la commande au sens du vendeur.
    new.updated_at = old.updated_at;
    return new;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

comment on function public.toucher_updated_at_commande() is
  'updated_at répond à « quand le VENDEUR a-t-il touché cette commande ». Une écriture venue de l''ingestion de suivi porte un marqueur local à la transaction et laisse la date intacte, sans quoi le tri « modifiées » se réordonnerait à chaque passage de cadence.';

drop trigger orders_toucher_updated_at on public.orders;

create trigger orders_toucher_updated_at
  before update on public.orders
  for each row execute function public.toucher_updated_at_commande();

-- ── 3. L'index du tri « bloqué en transit » ──────────────────────────────────
--
-- PARTIEL, sur le modèle de la 011 : le tri ne montre que les commandes en
-- transit et non archivées, donc l'index ne porte que sur elles. Il sert à la
-- FOIS l'ordre et la pagination par curseur — `(shop_id, date, id)` est
-- exactement la clé de tri, et le `id` final rend l'ordre total, sans quoi deux
-- commandes de même date pourraient s'échanger entre deux pages et l'une
-- disparaîtrait.
--
-- `nulls last` est explicite et doit être répété à l'identique dans la requête :
-- une commande dont le colis n'a jamais bougé n'a pas de date, et elle vient
-- APRÈS celles qui ont bougé il y a longtemps — c'est un colis qui n'est pas
-- encore parti, pas un colis bloqué.
create index orders_bloquees_idx
  on public.orders (shop_id, parcel_last_movement_at asc nulls last, id asc)
  where status = 'en_transit' and archived_at is null;

-- ── 4. L'application d'un état de colis descend dans les commandes ───────────
--
-- `create or replace` et non `drop` : la liste d'arguments est INCHANGÉE. C'est
-- la condition qui rend le remplacement sûr — si elle changeait, Postgres
-- créerait une SECONDE fonction, les deux coexisteraient, et un appel
-- résoudrait l'ANCIENNE sans la moindre erreur. Les droits déjà posés par la
-- 072 survivent au remplacement, ce qui est voulu.
create or replace function public.appliquer_etat_colis(
  p_numero text,
  p_etape public.parcel_status,
  p_statut_brut text,
  p_transporteur text,
  p_points jsonb,
  p_estimation_du text,
  p_estimation_au text,
  p_brut jsonb,
  p_premier_mouvement text
)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_colis record;
  v_touches integer := 0;
  v_dernier timestamptz;
  v_premier timestamptz;
  v_pionnier uuid;
  v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
  v_du timestamptz := nullif(btrim(coalesce(p_estimation_du, '')), '')::timestamptz;
  v_au timestamptz := nullif(btrim(coalesce(p_estimation_au, '')), '')::timestamptz;
  v_premier_reel timestamptz := nullif(btrim(coalesce(p_premier_mouvement, '')), '')::timestamptz;
begin
  select tp.id into v_pionnier
  from public.tracked_parcels tp
  where tp.tracking_number = p_numero
  order by tp.created_at asc, tp.id asc
  limit 1;

  for v_colis in
    select id, normalized_status from public.tracked_parcels where tracking_number = p_numero
  loop
    insert into public.parcel_checkpoints (parcel_id, occurred_at, location, description, stage)
    select
      v_colis.id,
      (p->>'instant')::timestamptz,
      nullif(p->>'lieu', ''),
      p->>'description',
      nullif(p->>'etape', '')
    from jsonb_array_elements(coalesce(p_points, '[]'::jsonb)) as p
    where p->>'instant' is not null
      and nullif(p->>'description', '') is not null
    on conflict (parcel_id, occurred_at, description) do nothing;

    select min(occurred_at), max(occurred_at)
      into v_premier, v_dernier
      from public.parcel_checkpoints
     where parcel_id = v_colis.id;

    update public.tracked_parcels
       set normalized_status = greatest(normalized_status, p_etape),
           raw_status = coalesce(nullif(p_statut_brut, ''), raw_status),
           carrier_code = coalesce(v_transporteur, carrier_code),
           first_movement_at = least(first_movement_at, v_premier, v_premier_reel),
           last_movement_at = greatest(last_movement_at, v_dernier),
           estimated_from = greatest(estimated_from, v_du),
           estimated_to = greatest(estimated_to, v_au),
           query_count = query_count + 1,
           empty_count = 0
     where id = v_colis.id;

    -- ── LA DESCENTE DANS LES COMMANDES ──────────────────────────────────────
    --
    -- Le marqueur est posé LOCAL À LA TRANSACTION (`true` en troisième
    -- argument) : il retombe tout seul au `commit` comme au `rollback`. Le
    -- poser en dehors laisserait une connexion du pool marquée pour toutes les
    -- requêtes suivantes — donc un vendeur dont les modifications cesseraient
    -- silencieusement de dater, sur une connexion au hasard.
    perform set_config('droplink.maj_transporteur', 'oui', true);

    update public.orders o
       set status = greatest(o.status, p_etape::text::public.order_status),
           parcel_last_movement_at = greatest(o.parcel_last_movement_at, v_dernier)
      from public.order_parcels op
     where op.parcel_id = v_colis.id
       and o.id = op.order_id
       -- N'ÉCRIRE QUE SI QUELQUE CHOSE CHANGE. Sans ce filtre, chaque passage
       -- de cadence réécrit toutes les lignes attachées : autant de versions
       -- mortes, autant de travail pour l'autovacuum, et une table qui grossit
       -- avec le NOMBRE D'INTERROGATIONS au lieu du nombre de commandes.
       and (o.status is distinct from greatest(o.status, p_etape::text::public.order_status)
            or o.parcel_last_movement_at is distinct from
               greatest(o.parcel_last_movement_at, v_dernier));

    perform set_config('droplink.maj_transporteur', '', true);

    if v_colis.id = v_pionnier then
      insert into public.tracking_snapshots (parcel_id, raw_payload, normalized_status)
      values (v_colis.id, coalesce(p_brut, '{}'::jsonb), p_etape);
    end if;

    v_touches := v_touches + 1;
  end loop;

  if v_touches > 0 then
    perform public.imputer_appel_suivi(p_numero);
  end if;

  return v_touches;
end;
$$;

comment on function public.appliquer_etat_colis(
  text, public.parcel_status, text, text, jsonb, text, text, jsonb, text
) is
  'Applique un état de colis ET LE DESCEND DANS LES COMMANDES ATTACHÉES, dans la même transaction. Statut, départ, dernier mouvement et estimation sont MONOTONES en base : aucun chemin d''écriture ne peut les faire reculer. La descente ne touche pas updated_at — elle n''est pas une modification du vendeur.';

-- ── 5. Rattrapage des commandes déjà attachées à un colis ────────────────────
--
-- Sans lui, la colonne resterait nulle et le statut périmé pour tout ce qui
-- existe déjà : la correction ne vaudrait que pour l'avenir, et l'écran
-- continuerait de mentir sur les commandes en cours — c'est-à-dire précisément
-- celles qui comptent.
--
-- Le marqueur vaut aussi ici : un rattrapage qui ferait remonter `updated_at`
-- de toutes les commandes en transit réordonnerait le tableau de bord de chaque
-- vendeur, une seule fois mais pour rien.
select set_config('droplink.maj_transporteur', 'oui', true);

update public.orders o
   set status = greatest(o.status, tp.normalized_status::text::public.order_status),
       parcel_last_movement_at = greatest(o.parcel_last_movement_at, tp.last_movement_at)
  from public.order_parcels op
  join public.tracked_parcels tp on tp.id = op.parcel_id
 where o.id = op.order_id
   and (o.status is distinct from greatest(o.status, tp.normalized_status::text::public.order_status)
        or o.parcel_last_movement_at is distinct from
           greatest(o.parcel_last_movement_at, tp.last_movement_at));

select set_config('droplink.maj_transporteur', '', true);
