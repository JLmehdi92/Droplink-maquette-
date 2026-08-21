-- 034 — Le suivi du colis, côté page publique.
--
-- UNE FONCTION DE PLUS, PAS UNE JOINTURE DANS LA PREMIÈRE. Même raison qu'aux
-- médias : la page publique a un budget de poids, et transporter le nom de la
-- boutique sur chacun des quinze points de passage le dépense pour rien.
--
-- ELLE REFAIT LE FILTRE DE SUSPENSION. C'est la troisième fonction qui le
-- refait, et ce n'est pas une redite : une coupure à moitié faite est une
-- coupure qui n'a pas eu lieu. Un compte suspendu dont la page ne répond plus
-- mais dont le suivi resterait interrogeable divulguerait la position d'un colis
-- à qui détient un lien qu'on a précisément voulu couper.
--
-- CE QU'ELLE NE REND PAS : le compteur d'interrogations et le nombre de retours
-- vides. Ce sont NOS chiffres de coût, pas des informations pour le client — et
-- ce qui n'est pas rendu ne peut pas fuiter.
--
-- L'ORDRE EST DÉCROISSANT, ET LE PLAFOND EST DANS LA FONCTION. Certains
-- transporteurs émettent un scan par centre de tri traversé : sans borne, la
-- page d'un colis parti d'Asie porte quarante lignes dont trente-cinq disent la
-- même chose, et le budget de la page est mangé par du bruit.

create function public.lire_suivi_public(p_jeton text)
  returns table (
    etape public.parcel_status,
    numero text,
    premier_mouvement timestamptz,
    dernier_mouvement timestamptz,
    estimation_du timestamptz,
    estimation_au timestamptz,
    abandonne boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    tp.normalized_status,
    tp.tracking_number,
    tp.first_movement_at,
    tp.last_movement_at,
    tp.estimated_from,
    tp.estimated_to,
    tp.abandoned_at is not null
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles pr on pr.id = s.owner_id
  join public.order_parcels op on op.order_id = o.id
  join public.tracked_parcels tp on tp.id = op.parcel_id
  where o.public_token = p_jeton
    and pr.status = 'active'
  -- Une commande n'a qu'un colis aujourd'hui ; la limite dit que l'écran n'en
  -- affichera qu'un même le jour où le modèle en autorisera deux, plutôt que
  -- d'en empiler silencieusement.
  limit 1
$$;

comment on function public.lire_suivi_public(text) is
  'Suivi d''une commande, par jeton. Refait le filtre de suspension. Ne rend AUCUN chiffre de coût.';

create function public.lire_passages_publics(p_jeton text)
  returns table (
    occurred_at timestamptz,
    location text,
    description text,
    stage text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select pc.occurred_at, pc.location, pc.description, pc.stage
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles pr on pr.id = s.owner_id
  join public.order_parcels op on op.order_id = o.id
  join public.parcel_checkpoints pc on pc.parcel_id = op.parcel_id
  where o.public_token = p_jeton
    and pr.status = 'active'
  order by pc.occurred_at desc
  limit 30
$$;

comment on function public.lire_passages_publics(text) is
  'Points de passage d''une commande, par jeton. Refait le filtre de suspension. Plafonné à 30.';

-- Postgres accorde EXECUTE à PUBLIC par défaut. Ici on veut `anon`, mais
-- EXPLICITEMENT, et personne d'autre par inadvertance.
revoke execute on function public.lire_suivi_public(text) from public;
revoke execute on function public.lire_passages_publics(text) from public;

grant execute on function public.lire_suivi_public(text) to anon, authenticated;
grant execute on function public.lire_passages_publics(text) to anon, authenticated;
