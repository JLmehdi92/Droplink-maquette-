-- 032 — Attacher un numéro de suivi à une commande.
--
-- C'EST LA FONCTION QUI DÉCIDE SI L'ON PAIE. Le fournisseur facture à la PRISE
-- EN CHARGE d'un numéro, pas à l'interrogation : appeler leur enregistrement
-- une fois de trop, c'est payer une fois de trop. Elle rend donc `cree` — vrai
-- SEULEMENT si la ligne vient d'être créée — et l'application n'appelle le
-- fournisseur que dans ce cas.
--
-- Déduire ce booléen côté application serait un « lire puis écrire » : deux
-- sauvegardes simultanées du même numéro — un double clic, une reconnexion qui
-- rejoue la requête — liraient toutes deux « absent » et paieraient toutes deux.
-- Ici l'insertion et le verdict sont le MÊME ordre SQL.
--
-- `SECURITY DEFINER` parce qu'un vendeur n'a AUCUN droit d'écriture sur
-- `tracked_parcels` : l'écriture vient du transporteur, et un vendeur qui
-- pourrait écrire ses propres points de passage raconterait à son client une
-- expédition qui n'a pas eu lieu. La propriété est donc vérifiée DANS LE CORPS —
-- `security definer` ayant mis la RLS de côté, c'est le seul endroit qui reste.
--
-- CHANGER DE NUMÉRO DÉTACHE L'ANCIEN, mais ne le SUPPRIME PAS. Le colis reste,
-- avec ses points de passage : une autre commande peut le porter — c'est le
-- groupage, le cas normal — et même sans cela, effacer l'historique d'un colis
-- parce qu'un vendeur a corrigé une faute de frappe est une perte sèche.

create function public.attacher_colis(
  p_order_id uuid,
  p_numero text,
  p_transporteur text
)
  returns table (parcel_id uuid, cree boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_numero text := btrim(coalesce(p_numero, ''));
  v_transporteur integer := nullif(btrim(coalesce(p_transporteur, '')), '')::integer;
  v_parcel uuid;
  v_cree boolean := false;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    -- Même réponse que pour une commande inexistante : distinguer les deux
    -- révélerait l'existence de la commande d'un autre vendeur.
    raise exception 'Commande introuvable.' using errcode = 'DL012';
  end if;

  -- DÉTACHER D'ABORD, TOUJOURS. Sans cela, corriger une faute de frappe
  -- laisserait la commande liée aux DEUX numéros, et la page publique
  -- afficherait le suivi d'un colis qui n'est plus le sien.
  delete from public.order_parcels op
   using public.tracked_parcels tp
   where op.order_id = p_order_id
     and op.parcel_id = tp.id
     and (v_numero = '' or tp.tracking_number <> v_numero);

  if v_numero = '' then
    return query select null::uuid, false;
    return;
  end if;

  -- L'INSERTION ET LE VERDICT SONT LE MÊME ORDRE. `xmax = 0` distingue une
  -- ligne réellement insérée d'une ligne rendue par `do update` : c'est ce qui
  -- fait la différence entre payer une prise en charge et ne pas la payer.
  insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
  values (v_shop, v_numero, v_transporteur)
  on conflict (shop_id, tracking_number)
    do update set carrier_code = coalesce(excluded.carrier_code, tp.carrier_code)
  returning tp.id, (tp.xmax = 0) into v_parcel, v_cree;

  insert into public.order_parcels (order_id, parcel_id)
  values (p_order_id, v_parcel)
  on conflict do nothing;

  return query select v_parcel, v_cree;
end;
$$;

comment on function public.attacher_colis(uuid, text, text) is
  'Attache un numéro à une commande. `cree` dit s''il faut PAYER une prise en charge : insertion et verdict dans le même ordre SQL.';

revoke execute on function public.attacher_colis(uuid, text, text) from public, anon;
grant execute on function public.attacher_colis(uuid, text, text) to authenticated;

/*
 * Marque la prise en charge comme faite, ou l'abandonne.
 *
 * Séparée de l'attache parce qu'elle a lieu APRÈS un appel réseau qui peut
 * échouer. Les fondre aurait forcé à choisir entre attendre le fournisseur pour
 * enregistrer la commande — un vendeur qui colle un numéro attendrait douze
 * secondes — et marquer comme pris en charge quelque chose qui ne l'est pas.
 */
create function public.marquer_prise_en_charge(
  p_parcel_id uuid,
  p_abandonne boolean
)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels
     set registered_at = case when p_abandonne then registered_at else now() end,
         abandoned_at = case when p_abandonne then now() else abandoned_at end,
         query_count = query_count + 1
   where id = p_parcel_id;
$$;

revoke execute on function public.marquer_prise_en_charge(uuid, boolean)
  from public, anon, authenticated;
