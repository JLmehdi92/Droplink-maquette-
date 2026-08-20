-- 015 — Réclamer l'événement `order_created`, exactement une fois.
--
-- DÉFAUT TROUVÉ PAR EXÉCUTION, et c'est le pire genre : rien ne cassait.
--
-- La migration 006 posait déjà un déclencheur `orders_marquer_premier_contenu`
-- qui remplit `first_content_at` dès qu'une commande porte du contenu réel. La
-- migration 012 a ajouté une fonction qui cherchait à poser la MÊME marque
-- « si elle est nulle » — elle arrive donc toujours APRÈS le déclencheur, ne
-- trouve jamais rien à écrire, et rend `false`.
--
-- Vérifié en exécutant : après une simple écriture de `customer_label`,
-- `first_content_at` est déjà posé et la fonction rend `false`. Conséquence :
-- `order_created` n'était JAMAIS émis. Aucun test ne tombait, aucun journal ne
-- le disait — et c'est le NUMÉRATEUR de la métrique de verdict de la phase de
-- validation. On aurait constaté un taux d'activation nul, et cherché la cause
-- du côté des utilisateurs.
--
-- LA MARQUE ET L'ÉVÉNEMENT SONT DEUX CHOSES DIFFÉRENTES, et c'est la leçon :
--   `first_content_at` est un FAIT sur la commande. Le déclencheur le pose, et
--     c'est bien qu'il le fasse — une règle en base ne peut pas être oubliée
--     dans un nouveau chemin de code.
--   `created_event_at` est la trace qu'on a ÉMIS l'événement correspondant.
--     Elle est réclamée, une seule fois, par la fonction ci-dessous.
--
-- La condition `created_event_at is null` est évaluée par la BASE, dans
-- l'écriture elle-même. Deux sauvegardes simultanées ne peuvent donc pas
-- produire deux émissions — une lecture suivie d'une écriture, elle, l'aurait
-- permis.

alter table public.orders
  add column created_event_at timestamptz;

comment on column public.orders.created_event_at is
  'Trace que order_created a été émis. Distincte de first_content_at, qui est un fait sur la commande.';

-- Une MESURE, pas une donnée du vendeur : elle n'entre pas dans le `grant
-- update` de `authenticated`. La laisser écrire reviendrait à laisser un vendeur
-- écrire notre métrique de verdict.

-- La fonction de la migration 012 ne sert plus, et son nom recouvrait celui de
-- la fonction du déclencheur avec une liste d'arguments différente : les deux
-- surcharges coexistaient. `drop` explicite — `create or replace` n'aurait pas
-- remplacé l'autre, il en aurait créé une troisième.
drop function if exists public.marquer_premier_contenu(uuid);

create function public.reclamer_evenement_creation(p_order_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL026';
  end if;

  -- `security definer` a mis la RLS de côté : l'appartenance se vérifie ici.
  -- Même réponse qu'une commande inexistante — distinguer les deux révélerait
  -- l'existence de la commande d'un autre vendeur.
  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'DL027';
  end if;

  update public.orders
  set created_event_at = now()
  where id = p_order_id
    and created_event_at is null
    and first_content_at is not null;

  return found;
end;
$$;

comment on function public.reclamer_evenement_creation(uuid) is
  'Rend true UNE SEULE FOIS, quand la commande vient de porter du contenu réel.';

revoke execute on function public.reclamer_evenement_creation(uuid) from public, anon;
grant execute on function public.reclamer_evenement_creation(uuid) to authenticated;
