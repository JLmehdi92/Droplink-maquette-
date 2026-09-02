/*
 * UNE COMMANDE ATTACHÉE À UN COLIS DÉJÀ SUIVI N'HÉRITAIT JAMAIS DE SON ÉTAT.
 *
 * DÉFAUT MESURÉ LE 02/09/2026, reproduit dans une transaction annulée :
 *
 *   colis    : livre, dernier mouvement le 01/08
 *   commande : preparation, parcel_last_movement_at null
 *   → attacher_colis(…) →
 *   commande : preparation, parcel_last_movement_at null   ← rien n'est descendu
 *
 * CE QUE LE CLIENT LIT ALORS, sur la page que son vendeur lui a envoyée pour
 * un colis que le transporteur a déclaré LIVRÉ il y a un mois : « Aucun
 * mouvement depuis 32 jours. Le colis est enregistré et suivi. Ce délai n'est
 * pas rare au passage en douane — nous continuons. » La frise reste sur
 * « Préparation ».
 *
 * ⚠️ ET ÇA NE SE RÉPARE JAMAIS TOUT SEUL. La descente colis → commande vit
 * dans `appliquer_etat_colis`, c'est-à-dire sur le chemin de l'INGESTION. Or
 * un colis `livre` n'est plus jamais interrogé (`decider` rend « terminer ») :
 * aucune ingestion ne viendra donc, et l'écran est faux définitivement. La
 * migration 090 avait bien prévu un rattrapage — mais joué UNE FOIS, au moment
 * de la migration, pour les commandes qui existaient alors.
 *
 * ⚠️ CE N'EST PAS UN CAS LIMITE, C'EST LE CAS NOMINAL DU GROUPAGE. Le brief
 * fonde l'existence même de `tracked_parcels` sur le fait qu'« un même numéro
 * peut porter plusieurs commandes ». La DEUXIÈME commande d'un envoi groupé, et
 * toutes les suivantes, tombent exactement ici. S'y ajoutent les compteurs : le
 * tri « bloquées en transit » et l'écran Envois sous-comptent ce que la base
 * contient pourtant.
 *
 * LA CORRECTION descend l'état à l'attache, avec la MÊME écriture que la 090 —
 * `greatest` sur le statut et sur la date, donc toujours monotone : attacher un
 * colis en préparation à une commande déjà expédiée par le vendeur ne la fait
 * pas reculer. Le vendeur prime avant la remise au transporteur, le
 * transporteur après ; cette règle-là ne bouge pas.
 *
 * LE MARQUEUR `droplink.maj_transporteur` EST POSÉ, comme dans la 090 et pour
 * la même raison : cette écriture n'est pas une modification du vendeur, elle
 * ne doit pas déplacer `updated_at` ni réordonner son tableau de bord. Il est
 * LOCAL à la transaction (troisième argument), donc il retombe au `commit`
 * comme au `rollback` — le poser en dehors laisserait une connexion du pool
 * marquée pour toutes les requêtes suivantes.
 *
 * ⚠️ LE CORPS EST REPRIS DE `pg_get_functiondef`, et seul le bloc final change.
 */

drop function if exists public.attacher_colis(uuid, text, text);

create function public.attacher_colis(p_order_id uuid, p_numero text, p_transporteur text)
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

  /*
   * ── L'HÉRITAGE, ET C'EST LE CORRECTIF ────────────────────────────────────
   *
   * Un colis qui existait déjà porte un état que personne ne redescendra : la
   * descente vit sur le chemin de l'ingestion, et un colis livré n'est plus
   * interrogé. On la fait donc ici, à l'attache, avec la même écriture
   * monotone que la migration 090.
   *
   * `v_cree` NE SERT PAS DE CONDITION. Un colis tout juste créé n'a rien à
   * descendre — ses colonnes sont à leur défaut — donc le filtre « n'écrire que
   * si quelque chose change » suffit, et il coûte moins qu'une branche de plus.
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

  return query select v_parcel, v_cree;
end;
$$;

comment on function public.attacher_colis(uuid, text, text) is
  'Attache une commande à un colis, en le créant si besoin, et DESCEND son état dans la commande. La descente est monotone (greatest) : le vendeur prime avant la remise au transporteur, le transporteur après. Rend le colis et un verdict de création, qui distingue une prise en charge à payer d''un simple groupage.';

-- Les droits ne survivent PAS au drop : reposés à l'identique, RELEVÉS DANS LE
-- CATALOGUE avant d'écrire cette migration et non de mémoire — `service_role`
-- s'y trouvait, et l'oublier aurait retiré l'attache aux chemins machine sans
-- qu'aucun test applicatif ne s'en aperçoive.
revoke all on function public.attacher_colis(uuid, text, text) from public;
grant execute on function public.attacher_colis(uuid, text, text) to authenticated, service_role;
