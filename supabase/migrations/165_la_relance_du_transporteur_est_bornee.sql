/*
 * LA RELANCE PAR LE TRANSPORTEUR EST BORNÉE, ET UN COLIS SUIVI GARDE LE SIEN.
 *
 * Deux constats de la revue de sécurité du 18/09/2026 sur la migration 164,
 * reproduits chacun par un test rouge avant d'écrire une ligne ici
 * (`tests/rls/attache-colis.test.ts`, « Préciser le transporteur »).
 *
 * ── 1. LA RELANCE N'AVAIT PAS DE BORNE ────────────────────────────────────
 *
 * La 164 relance la prise en charge d'un colis refusé quand le vendeur choisit
 * un AUTRE transporteur. Alterner deux transporteurs relançait donc à chaque
 * fois. L'argent n'était pas en jeu — un refus ne consomme rien, et un succès
 * pose `registered_at`, qui ferme la relance pour de bon — mais chaque relance
 * est un appel réel au fournisseur, sur un compte PARTAGÉ par tout le produit,
 * et `attacher_colis` est appelable par PostgREST, hors de toute limitation de
 * débit applicative. C'est la classe de défaut que la migration 125 a fermée
 * pour la CRÉATION de colis ; la relance passe par une mise à jour, que le
 * déclencheur de la 125 ne voit pas.
 *
 * `query_count` compte déjà chaque refus (`marquer_prise_en_charge`, migration
 * 074). La relance n'est plus accordée au-delà de CINQ : la détection
 * automatique, puis quatre transporteurs choisis. Un vendeur honnête en use un
 * ou deux ; au-delà, le numéro lui-même est en cause, et la fiche le dit déjà.
 *
 * ── 2. UN COLIS DÉJÀ SUIVI VOYAIT SON TRANSPORTEUR RÉÉCRIT ────────────────
 *
 * `on conflict … do update set carrier_code = coalesce(excluded…, …)` — repris
 * de la 136 — s'appliquait sans condition. Or le colis est partagé par toutes
 * les commandes du vendeur qui portent ce numéro (groupage), et le fournisseur
 * le suit sous le transporteur de sa prise en charge. Une seconde commande qui
 * en choisissait un autre réécrivait ce code : les interrogations suivantes
 * partaient chez le mauvais transporteur, et la page du client de la PREMIÈRE
 * commande se vidait sans rien dire. Le défaut existait depuis la 136 ; le
 * champ, invisible depuis le 28/08, le rendait inatteignable, et son retour le
 * rend exploitable par l'écran ordinaire.
 *
 * Le code du colis n'est donc plus réécrit une fois `registered_at` posée. La
 * commande garde, elle, le choix de son vendeur dans `orders.carrier_code`.
 *
 * ⚠️ LE CORPS EST CELUI DE LA 164 ; seuls la clause `do update` et la
 * condition de relance changent.
 */

drop function if exists public.attacher_colis(uuid, text, text);

create function public.attacher_colis(p_order_id uuid, p_numero text, p_transporteur text)
  returns table (parcel_id uuid, cree boolean, a_inscrire boolean)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_numero text := btrim(coalesce(p_numero, ''));
  v_transporteur integer :=
    case when btrim(coalesce(p_transporteur, '')) ~ '^[1-9][0-9]{0,8}$'
         then btrim(p_transporteur)::integer
    end;
  v_ancien integer;
  v_parcel uuid;
  v_cree boolean := false;
  v_relance boolean := false;
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
    return query select null::uuid, false, false;
    return;
  end if;

  -- LE TRANSPORTEUR D'AVANT, VERROUILLÉ. La relance compare l'ancien au
  -- nouveau ; lus sans verrou, deux enregistrements simultanés verraient tous
  -- deux l'ancien et relanceraient deux fois.
  select tp.carrier_code into v_ancien
    from public.tracked_parcels tp
   where tp.shop_id = v_shop and tp.tracking_number = v_numero
   for update;

  -- L'INSERTION ET LE VERDICT SONT LE MÊME ORDRE. `xmax = 0` distingue une
  -- ligne réellement insérée d'une ligne rendue par `do update` : c'est ce qui
  -- fait la différence entre payer une prise en charge et ne pas la payer.
  --
  -- LE CODE D'UN COLIS DÉJÀ PRIS EN CHARGE NE BOUGE PLUS (voir l'en-tête,
  -- point 2) : le fournisseur le suit sous celui-là.
  insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
  values (v_shop, v_numero, v_transporteur)
  on conflict (shop_id, tracking_number)
    do update set carrier_code =
      case when tp.registered_at is null
           then coalesce(excluded.carrier_code, tp.carrier_code)
           else tp.carrier_code
      end
  returning tp.id, (tp.xmax = 0) into v_parcel, v_cree;

  -- LA RELANCE. Quatre conditions, et chacune ferme une dépense : un
  -- transporteur NOUVEAU, un colis JAMAIS pris en charge, un colis ABANDONNÉ,
  -- et moins de CINQ refus déjà essuyés (voir l'en-tête, point 1).
  if not v_cree and v_transporteur is not null and v_transporteur is distinct from v_ancien then
    update public.tracked_parcels tp
       set abandoned_at = null
     where tp.id = v_parcel
       and tp.registered_at is null
       and tp.abandoned_at is not null
       and tp.query_count < 5;
    v_relance := found;
  end if;

  insert into public.order_parcels (order_id, parcel_id)
  values (p_order_id, v_parcel)
  on conflict do nothing;

  /*
   * ── L'HÉRITAGE (migration 136) ───────────────────────────────────────────
   *
   * Un colis qui existait déjà porte un état que personne ne redescendra : la
   * descente vit sur le chemin de l'ingestion, et un colis livré n'est plus
   * interrogé. On la fait donc ici, à l'attache, avec la même écriture
   * monotone que la migration 090.
   */
  perform set_config('droplink.maj_transporteur', 'oui', true);

  update public.orders o
     set status = greatest(o.status, tp.normalized_status::text::public.order_status),
         parcel_last_movement_at = greatest(o.parcel_last_movement_at, tp.last_movement_at)
    from public.tracked_parcels tp
   where tp.id = v_parcel
     and o.id = p_order_id
     -- N'ÉCRIRE QUE SI QUELQUE CHOSE CHANGE, comme en 090 : sans ce filtre,
     -- chaque enregistrement du champ de suivi réécrirait la ligne.
     and (o.status is distinct from greatest(o.status, tp.normalized_status::text::public.order_status)
          or o.parcel_last_movement_at is distinct from
             greatest(o.parcel_last_movement_at, tp.last_movement_at));

  perform set_config('droplink.maj_transporteur', '', true);

  return query select v_parcel, v_cree, (v_cree or v_relance);
end;
$$;

comment on function public.attacher_colis(uuid, text, text) is
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande (monotone, greatest). Rend le colis, un verdict de création, et `a_inscrire` : vrai quand une prise en charge doit partir — colis neuf, ou colis abandonné sans jamais avoir été pris en charge dont le vendeur vient de préciser un AUTRE transporteur, dans la limite de cinq refus. Le transporteur d''un colis déjà pris en charge ne change plus. Un code non numérique vaut détection automatique.';

-- Les droits ne survivent PAS au drop : reposés à l'identique de la 164.
revoke all on function public.attacher_colis(uuid, text, text) from public;
grant execute on function public.attacher_colis(uuid, text, text) to authenticated, service_role;
