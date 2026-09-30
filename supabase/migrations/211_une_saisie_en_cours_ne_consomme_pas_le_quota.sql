-- 211 — UNE SAISIE EN COURS NE CONSOMME PAS LE QUOTA DE COLIS.
--
-- ── LE DÉFAUT, TROUVÉ PAR L'AUDIT ECC DU 30/09/2026 ─────────────────────────
-- Le champ de suivi s'enregistre 800 ms après la dernière frappe. Taper « LX12 », marquer
-- une pause, finir le numéro : deux enregistrements, donc deux colis insérés — et le
-- déclencheur de quota (202, AFTER INSERT) en compte deux. La 172 supprime bien le
-- brouillon détaché, jamais pris en charge ; mais la 198 ne rend jamais une consommation.
--
-- Mesuré sur la base de tests : un numéro saisi en deux fois consommait DEUX colis ; et à
-- 4 colis sur 5 (quota gratuit de la 210), terminer le cinquième numéro rendait « suivi
-- bloqué » — le brouillon avait pris la dernière place. À 5 colis à vie, chaque place
-- perdue ainsi est 20 % du quota, pour un colis qui n'a jamais rien coûté.
--
-- ── LE REMÈDE ───────────────────────────────────────────────────────────────
-- `attacher_colis`, recopiée de la 172 à l'identique, sauf le ménage : le brouillon qu'elle
-- supprime rend sa place dans `quotas_consommes`, dans le mois où il avait été compté. Le
-- ménage vient AVANT l'insertion du nouveau numéro : la place est rendue avant que le
-- quota ne soit vérifié. Un colis pris en charge n'est jamais supprimé ici, donc jamais
-- rendu : il a été payé. `create or replace` : la signature ne change pas, les droits
-- posés par la 172 sont conservés.

create or replace function public.attacher_colis(p_order_id uuid, p_numero text, p_transporteur text)
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
  v_detaches uuid[];
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
  with detaches as (
    delete from public.order_parcels op
     using public.tracked_parcels tp
     where op.order_id = p_order_id
       and op.parcel_id = tp.id
       and (v_numero = '' or tp.tracking_number <> v_numero)
    returning op.parcel_id
  )
  select array_agg(d.parcel_id) into v_detaches from detaches d;

  -- LE MÉNAGE (172). Un colis détaché à l'instant, JAMAIS pris en charge, et que plus aucune
  -- commande ne porte, est une saisie abandonnée : il n'a rien coûté et ne désigne plus rien.
  -- Un colis pris en charge garde sa ligne (il a été payé et porte un historique) ; un colis
  -- qu'une autre commande porte encore aussi (le groupage).
  --
  -- LA PLACE DU BROUILLON EST RENDUE (211). Le colis supprimé ici n'a jamais été pris en
  -- charge : il n'a rien coûté au fournisseur. La 198 ne rendait pourtant jamais ce qu'il
  -- avait consommé — une saisie en deux temps comptait deux colis, et à une place du quota
  -- le vendeur ne pouvait plus terminer son dernier numéro. On rend donc sa place, dans le
  -- mois où il a été compté. La part Pro (200) n'est rendue qu'à un compte Pro : c'est en
  -- Pro qu'elle a été comptée, quelques secondes plus tôt.
  --
  -- ⚠️ C'EST LE SEUL CHEMIN QUI REND UNE PLACE, et c'est voulu : « Supprimer mes données »
  -- ne rend rien (198). Ici, le colis est remplacé dans la même commande, par le même
  -- geste ; ailleurs, rendre rechargerait le quota à la demande.
  if v_detaches is not null then
    with supprimes as (
      delete from public.tracked_parcels tp
       where tp.id = any(v_detaches)
         and tp.registered_at is null
         and not exists (select 1 from public.order_parcels op where op.parcel_id = tp.id)
      returning date_trunc('month', tp.created_at)::date as mois
    ), par_mois as (
      select s.mois, count(*)::integer as n from supprimes s group by s.mois
    )
    update public.quotas_consommes q
       set colis = greatest(q.colis - pm.n, 0),
           -- BORNÉE PAR LE TOTAL (`colis_pro <= colis`, 200) : un plan changé entre le
           -- brouillon et sa suppression ne doit pas faire échouer l'attache.
           colis_pro = least(
             case
               when exists (
                 select 1 from public.shops sh join public.profiles p on p.id = sh.owner_id
                  where sh.id = v_shop and p.plan = 'pro'
               ) then greatest(q.colis_pro - pm.n, 0)
               else q.colis_pro
             end,
             greatest(q.colis - pm.n, 0)
           )
      from par_mois pm
     where q.shop_id = v_shop
       and q.mois = pm.mois;
  end if;

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
  -- LE CODE D'UN COLIS DÉJÀ PRIS EN CHARGE NE BOUGE PLUS (migration 165) : le
  -- fournisseur le suit sous celui-là.
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
  -- et moins de CINQ refus déjà essuyés (migration 165).
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
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande (monotone, greatest). Un colis détaché jamais pris en charge et que plus aucune commande ne porte est SUPPRIMÉ (172 : une saisie en cours ne laisse rien) et REND sa place de quota (211 : il n''a rien coûté). Rend le colis, un verdict de création, et `a_inscrire` : vrai quand une prise en charge doit partir — colis neuf, ou colis abandonné sans jamais avoir été pris en charge dont le vendeur vient de préciser un AUTRE transporteur, dans la limite de cinq refus. La prise en charge elle-même attend que le colis soit STABLE (colis_a_inscrire).';
