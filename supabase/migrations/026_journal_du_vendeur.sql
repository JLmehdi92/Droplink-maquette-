-- 026 — Le vendeur écrit son propre journal, mais pas celui de son client.
--
-- LE POINT QUI COMPTE : un vendeur ne doit PAS pouvoir écrire « le client a
-- approuvé ». L'arbitrage QC est la seule chose du journal qui puisse être
-- contestée, et c'est précisément celle qu'un vendeur aurait intérêt à
-- fabriquer. Une fonction d'écriture générique ouverte à `authenticated` lui
-- donnerait exactement ce pouvoir, sous couvert de commodité.
--
-- D'où deux portes séparées plutôt qu'une porte avec un argument :
--
--   `journaliser`         — service_role seul. Écrit n'importe quel type, y
--                           compris l'arbitrage du client, et c'est par elle que
--                           passe `arbitrer_qc`, qui est `security definer`.
--   `journaliser_vendeur` — le vendeur, pour SES commandes, et pour ses seules
--                           actions. L'acteur n'est pas un argument : il est
--                           écrit en dur. Un acteur fourni par l'appelant est un
--                           acteur que l'appelant choisit.
--
-- La liste des types autorisés est ÉNUMÉRÉE ici et pas déduite de la contrainte
-- de table : la contrainte dit ce qui peut EXISTER, celle-ci dit ce qu'un
-- vendeur peut ÉCRIRE. Confondre les deux, c'est rouvrir la porte qu'on ferme.

create function public.journaliser_vendeur(
  p_order_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_id uuid;
begin
  if p_type not in (
    'commande_creee',
    'commande_modifiee',
    'commande_archivee',
    'commande_dupliquee',
    'media_ajoute',
    'media_supprime',
    'medias_reordonnes'
  ) then
    raise exception 'un vendeur n''écrit pas ce type d''événement : %', p_type
      using errcode = '42501';
  end if;

  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  -- `security definer` a mis la RLS de côté : la propriété se vérifie ICI, sans
  -- quoi n'importe quel vendeur écrirait dans le journal de n'importe qui.
  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    -- Même réponse que pour une commande inexistante : distinguer les deux
    -- révélerait l'existence de la commande d'un autre vendeur.
    raise exception 'Commande introuvable.' using errcode = 'DL012';
  end if;

  insert into public.order_events (order_id, type, actor, payload)
  values (p_order_id, p_type, 'vendeur', coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.journaliser_vendeur(uuid, text, jsonb) is
  'Journal des actions du VENDEUR sur ses propres commandes. Ne peut pas écrire un arbitrage de client.';

revoke execute on function public.journaliser_vendeur(uuid, text, jsonb) from public, anon;
grant execute on function public.journaliser_vendeur(uuid, text, jsonb) to authenticated;
