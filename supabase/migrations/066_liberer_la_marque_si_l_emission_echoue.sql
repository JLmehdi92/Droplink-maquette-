-- 066 — Une marque à usage unique se REND quand l'émission échoue.
--
-- DÉFAUT CRITIQUE. `reclamer_evenement_creation` écrit `created_event_at = now()`
-- puis rend `true`. L'émission vient après — et son retour était jeté :
--
--     if (data !== true) return;
--     await emettre(EVENEMENTS.COMMANDE_CREEE, …);   // rend un booléen, ignoré
--
-- `emettre` rend `false` sans lever quand PostHog n'est pas joignable ou pas
-- configuré. La marque, elle, restait posée : l'événement n'était JAMAIS réémis.
--
-- CE N'EST PAS THÉORIQUE : `NEXT_PUBLIC_POSTHOG_KEY` est vide aujourd'hui. Le
-- client rend `null`, un avertissement part une fois, et la marque est consommée
-- quand même. Autrement dit, 100 % des créations de commande sont perdues pour
-- l'analyse, définitivement, y compris rétroactivement le jour où la clé sera
-- posée.
--
-- C'est le premier des trois pièges d'instrumentation du brief, sur le
-- NUMÉRATEUR de la métrique de verdict. Et le pire est qu'il est silencieux :
-- rien n'échoue, rien ne rougit, le produit fonctionne — on découvre le trou au
-- moment de décider, c'est-à-dire trop tard.
--
-- LA LIBÉRATION EST UNE OPÉRATION DISTINCTE, avec la même garde de propriété
-- que la réclamation. Elle ne rend la marque QUE si elle est posée : sans cette
-- condition, un appel isolé pourrait effacer la trace d'un événement réellement
-- parti et provoquer un double comptage — l'erreur symétrique de celle qu'on
-- corrige.

create function public.liberer_evenement_creation(p_order_id uuid)
  returns boolean
  language plpgsql
  volatile
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

  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'DL027';
  end if;

  update public.orders
     set created_event_at = null
   where id = p_order_id
     and created_event_at is not null;

  return found;
end;
$$;

comment on function public.liberer_evenement_creation(uuid) is
  'Rend la marque de création quand l''émission a échoué, pour qu''une sauvegarde ultérieure réémette.';

revoke all on function public.liberer_evenement_creation(uuid) from public;
grant execute on function public.liberer_evenement_creation(uuid) to authenticated;
