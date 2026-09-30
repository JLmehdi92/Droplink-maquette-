-- 212 — SEUL UN BROUILLON DE MOINS DE 20 SECONDES REND SA PLACE.
--
-- ── LA FAILLE, TROUVÉE PAR L'AUDIT ECC DU 30/09/2026 (CRITIQUE) ─────────────
-- La 211 rendait la place de quota de tout colis détaché, jamais pris en charge
-- (`registered_at` nulle), que plus aucune commande ne porte. Or `registered_at` n'est
-- posée qu'APRÈS l'appel payant au fournisseur (`prise-en-charge.ts` : colis_a_inscrire,
-- puis l'appel, jusqu'à 12 s, puis marquer_prise_en_charge). Pendant cette fenêtre — et
-- pour toujours si la réponse d'un appel accepté se perd —, le colis a été PAYÉ et passe
-- pour un brouillon.
--
-- Mesuré sur la base de tests : un colis de 31 secondes remplacé était supprimé et sa
-- place rendue. Un compte gratuit qui enregistre un numéro toutes les ~31 s pouvait donc
-- faire payer un nombre illimité de prises en charge, son compteur restant à 1 — sur un
-- stock de 190 unités À VIE commun à tout le produit. Avant la 211, la consommation ne
-- redescendait jamais (198) : la boucle s'arrêtait au quota.
--
-- ── LE REMÈDE ───────────────────────────────────────────────────────────────
-- La place n'est rendue qu'à un colis de MOINS DE 20 SECONDES. Aucun paiement ne part
-- avant 30 secondes de stabilité (`colis_a_inscrire`, 172) : un colis rendu n'a donc
-- JAMAIS pu être payé, quelle que soit la fenêtre de l'appel ou la perte d'une réponse.
-- La marge de 10 s absorbe la durée de la transaction. Le colis plus ancien est supprimé
-- comme avant (172), sans restitution — le comportement d'avant la 211.
--
-- Le vrai brouillon (enregistrement 800 ms après la frappe) reste couvert. Un vendeur
-- qui s'arrête plus de 20 s au milieu de sa saisie consomme une place : c'est le prix
-- de la garantie, et c'était le cas de tout brouillon avant la 211.
--
-- ⚠️ LES DEUX DÉLAIS VIVENT DANS DEUX FONCTIONS. `tests/rls/quota-survit-a-la-suppression`
-- verrouille leur écart : un colis encore rendable ne doit jamais être payable.
--
-- `attacher_colis` recopiée de la 211 à l'identique, sauf la restitution. `create or
-- replace` : même signature, droits conservés.

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
      returning date_trunc('month', tp.created_at)::date as mois,
                -- ⚠️ SEUL UN COLIS DE MOINS DE 20 SECONDES EST RENDU (212). Au-delà, il a pu
                -- passer le seuil de stabilité (30 s, `colis_a_inscrire`) et être PAYÉ
                -- pendant que `registered_at` restait nulle : il est supprimé, jamais rendu.
                tp.created_at > now() - interval '20 seconds' as brouillon
    ), par_mois as (
      select s.mois, count(*)::integer as n from supprimes s where s.brouillon group by s.mois
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
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande (monotone, greatest). Un colis détaché jamais pris en charge et que plus aucune commande ne porte est SUPPRIMÉ (172 : une saisie en cours ne laisse rien) et REND sa place de quota s''il a moins de 20 secondes (211, 212 : il n''a jamais pu être payé, la prise en charge attend 30 secondes de stabilité). Rend le colis, un verdict de création, et `a_inscrire` : vrai quand une prise en charge doit partir — colis neuf, ou colis abandonné sans jamais avoir été pris en charge dont le vendeur vient de préciser un AUTRE transporteur, dans la limite de cinq refus. La prise en charge elle-même attend que le colis soit STABLE (colis_a_inscrire).';
