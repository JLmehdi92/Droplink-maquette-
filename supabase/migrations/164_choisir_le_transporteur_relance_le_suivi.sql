/*
 * CHOISIR LE TRANSPORTEUR RELANCE LE SUIVI QUE SON ABSENCE AVAIT ARRÊTÉ.
 *
 * DÉFAUT TROUVÉ LE 18/09/2026, en rebranchant le champ « Transporteur » que
 * la refonte de l'éditeur avait retiré (dbe22fb, 28/08). Deux défauts, et le
 * premier rendait le champ inutile le jour où il sert.
 *
 * ── 1. UN REFUS À LA PRISE EN CHARGE ÉTAIT DÉFINITIF, MÊME CORRIGÉ ─────────
 *
 * Quand le fournisseur ne reconnaît pas le transporteur d'un numéro
 * (`-18019903`), `prise-en-charge.ts` abandonne le colis sur-le-champ
 * (`abandoned_at` posée, `registered_at` restée nulle) — à raison : leur
 * détection lit le FORMAT du numéro, elle ne réussira pas plus tard. Le
 * commentaire du fournisseur le dit : « en refus, le vendeur apprend TOUT DE
 * SUITE qu'il doit préciser le transporteur ».
 *
 * Mais préciser le transporteur ne relançait rien. `attacher_colis` mettait
 * bien à jour `carrier_code` sur le colis, et rendait `cree = false` : aucune
 * prise en charge ne repartait, et la cadence ignore un colis abandonné. Le
 * suivi restait arrêté pour de bon, champ rempli ou non.
 *
 * LA CORRECTION : quand un transporteur est donné, qu'il DIFFÈRE de celui du
 * colis, et que ce colis n'a JAMAIS été pris en charge mais a été abandonné,
 * l'abandon est levé et la fonction rend `a_inscrire = true`. L'application
 * relance alors la prise en charge, avec le transporteur choisi.
 *
 * ⚠️ CE QUE ÇA COÛTE : rien de plus qu'une première attache. Un enregistrement
 * REJETÉ ne consomme pas de quota (« Successfully registering 1 tracking
 * number equals 1 quota ») ; un enregistrement réussi en consomme un, et c'est
 * celui que le vendeur attendait depuis le début. Les trois conditions bornent
 * le reste : même transporteur rejoué (double clic, sauvegarde qui repart) →
 * rien ; colis déjà pris en charge → rien, on ne repaie jamais un colis suivi ;
 * colis non abandonné → rien, la cadence le reprendra avec le nouveau code.
 *
 * `cree` GARDE SON SENS — « une ligne vient de naître » — et les tests qui
 * l'éprouvent ne bougent pas. Le verdict de dépense devient `a_inscrire`.
 *
 * ── 2. UNE VALEUR NON NUMÉRIQUE FAISAIT ÉCHOUER TOUTE ATTACHE ──────────────
 *
 * `v_transporteur integer := nullif(…)::integer`. L'ancien champ était un
 * texte libre, son exemple disait « Ex : DHL », et `orders.carrier_code` est un
 * `text` de 32 caractères : une commande qui porte « DHL » levait `22P02` à
 * CHAQUE enregistrement de son numéro de suivi. L'attache échouait, aucun colis
 * n'était suivi, et le vendeur voyait son numéro enregistré.
 *
 * Un code qui n'est pas un entier positif de neuf chiffres au plus vaut
 * désormais « détection automatique » — c'est ce que `attache.ts` faisait déjà
 * côté application (`Number.parseInt` → `NaN` → `null`).
 *
 * ⚠️ LE CORPS EST REPRIS DE LA MIGRATION 136, relu contre `pg_get_functiondef`
 * sur la base de tests ; seuls la déclaration du transporteur, la relance et
 * la ligne rendue changent.
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
  insert into public.tracked_parcels as tp (shop_id, tracking_number, carrier_code)
  values (v_shop, v_numero, v_transporteur)
  on conflict (shop_id, tracking_number)
    do update set carrier_code = coalesce(excluded.carrier_code, tp.carrier_code)
  returning tp.id, (tp.xmax = 0) into v_parcel, v_cree;

  -- LA RELANCE (voir l'en-tête, point 1). Trois conditions, et chacune ferme
  -- une dépense : un transporteur NOUVEAU, un colis JAMAIS pris en charge, un
  -- colis ABANDONNÉ.
  if not v_cree and v_transporteur is not null and v_transporteur is distinct from v_ancien then
    update public.tracked_parcels tp
       set abandoned_at = null
     where tp.id = v_parcel
       and tp.registered_at is null
       and tp.abandoned_at is not null;
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
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande (monotone, greatest). Rend le colis, un verdict de création, et `a_inscrire` : vrai quand une prise en charge doit partir — colis neuf, ou colis abandonné sans jamais avoir été pris en charge dont le vendeur vient de préciser un AUTRE transporteur. Un code transporteur non numérique vaut détection automatique.';

-- Les droits ne survivent PAS au drop : reposés à l'identique de la 136,
-- relevés dans le catalogue de la base de tests avant d'écrire ces lignes.
revoke all on function public.attacher_colis(uuid, text, text) from public;
grant execute on function public.attacher_colis(uuid, text, text) to authenticated, service_role;
