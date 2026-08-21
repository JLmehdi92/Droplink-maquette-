-- 028 — L'archivage par LOT, tout ou rien.
--
-- CHAQUE LOT EST TOUT-OU-RIEN, et ce n'est pas un raffinement : une sélection à
-- moitié archivée, sans que le vendeur sache LAQUELLE, est pire que l'échec
-- complet. Un échec complet se refait ; un état partiel se découvre des semaines
-- plus tard, sur la commande qu'on croyait rangée.
--
-- POURQUOI UNE FONCTION plutôt qu'un `update ... where id = any(...)` depuis
-- l'application. Sous RLS, cet `update` ne toucherait QUE les commandes de
-- l'appelant — ce qui est correct — et ignorerait SILENCIEUSEMENT les autres.
-- Le vendeur verrait « lot archivé » pour une sélection dont une partie ne lui
-- appartient pas, ou n'existe plus. La fonction compare donc ce qu'elle a
-- modifié à ce qu'on lui a demandé, et LÈVE si les deux diffèrent : la
-- transaction entière est annulée.
--
-- `SECURITY INVOKER` — le défaut, énoncé ici parce qu'il porte tout le
-- raisonnement. La fonction s'exécute avec les droits de l'APPELANT, donc sous
-- sa RLS : elle ne peut structurellement pas toucher la commande d'un autre
-- vendeur, et il n'y a aucun contrôle de propriété à écrire dans son corps —
-- donc aucun à oublier.
--
-- LE PLAFOND EST DANS LA FONCTION, pas seulement dans l'écran. Deux cents
-- identifiants suffisent à quatre pages de cinquante lignes, et une borne posée
-- côté application est une borne que le prochain appelant n'aura pas.

create function public.archiver_lot(p_ids uuid[], p_archiver boolean)
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  v_demandes integer;
  v_modifiees integer;
begin
  v_demandes := coalesce(array_length(p_ids, 1), 0);

  if v_demandes = 0 then
    return 0;
  end if;

  if v_demandes > 200 then
    raise exception 'lot trop grand : % commandes', v_demandes using errcode = 'DL020';
  end if;

  update public.orders
     set archived_at = case when p_archiver then now() else null end
   where id = any(p_ids);

  get diagnostics v_modifiees = row_count;

  if v_modifiees <> v_demandes then
    -- Le message ne dit PAS lesquelles ont échoué : ce serait révéler
    -- l'existence des commandes d'un autre vendeur à qui en devine les
    -- identifiants. Il dit combien, ce qui suffit à l'écran pour être honnête.
    raise exception 'lot refusé : % commandes sur % sont hors de portée',
      v_demandes - v_modifiees, v_demandes
      using errcode = 'DL021';
  end if;

  return v_modifiees;
end;
$$;

comment on function public.archiver_lot(uuid[], boolean) is
  'Archivage par lot, tout-ou-rien. SECURITY INVOKER : la RLS de l''appelant fait le contrôle de propriété.';

-- Postgres accorde EXECUTE à PUBLIC par défaut. Ouvert ici à `authenticated`
-- EXPLICITEMENT — sans droit sur `orders`, `anon` ne pourrait de toute façon
-- rien modifier, mais une fonction ouverte à qui n'en a pas l'usage est une
-- surface de plus à vérifier à chaque revue.
revoke execute on function public.archiver_lot(uuid[], boolean) from public, anon;
grant execute on function public.archiver_lot(uuid[], boolean) to authenticated;
