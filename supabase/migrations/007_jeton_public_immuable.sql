-- 007 — Le `public_token` est immuable à vie.
--
-- C'est le principe V du brief, et l'invariant le plus lourd de conséquences du
-- produit : le jeton ne transfère pas une donnée, il transfère une CAPACITÉ,
-- définitivement. Quiconque le détient ouvre la page, pour toujours.
--
-- LA RÈGLE VIT EN BASE, PAS DANS LE CODE. Une règle applicative peut être
-- oubliée dans un nouveau chemin d'écriture — et il y en aura : l'éditeur, les
-- actions groupées, l'import depuis un lien d'agent, une reprise de données. Une
-- règle en base ne peut pas l'être.
--
-- LE RETRAIT DU DROIT D'ÉCRITURE NE SUFFIT PAS. La migration 006 n'accorde pas
-- `update (public_token)` à `authenticated`, mais une protection qui tient à une
-- ABSENCE n'est pas une protection : il suffirait qu'un `grant` soit ajouté
-- ailleurs, ou qu'un chemin passe par le rôle service, pour que la colonne
-- redevienne modifiable sans que rien ne le signale.

create function public.jeton_public_immuable()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.public_token is distinct from old.public_token then
    -- LA SEULE PORTE : un drapeau de session que seule la fonction de rotation
    -- ci-dessous pose. Les clients passent par PostgREST et n'exécutent pas de
    -- SQL libre ; ils ne peuvent donc pas le poser eux-mêmes.
    if coalesce(current_setting('droplink.rotation_jeton', true), '') <> 'oui' then
      raise exception
        'Le jeton public est immuable. Utiliser public.regenerer_jeton_public().'
        -- Code métier DÉLIBÉRÉMENT NON RÉESSAYABLE. Un refus métier qui
        -- porterait « 40001 » serait interprété comme un conflit de
        -- sérialisation, et la couche de reprise le rejouerait en boucle : un
        -- refus définitif deviendrait une tempête de requêtes.
        using errcode = 'DL010';
    end if;
  end if;

  if new.unsubscribe_token is distinct from old.unsubscribe_token then
    if coalesce(current_setting('droplink.rotation_jeton', true), '') <> 'oui' then
      raise exception
        'Le jeton de désabonnement est immuable.'
        using errcode = 'DL010';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.jeton_public_immuable() from public, anon, authenticated;

create trigger orders_jeton_public_immuable
  before update on public.orders
  for each row execute function public.jeton_public_immuable();

/*
 * RÉVOQUER ET RÉGÉNÉRER — l'unique chemin légitime.
 *
 * `security definer` pour poser le drapeau que le déclencheur exige, mais la
 * PROPRIÉTÉ EST VÉRIFIÉE EXPLICITEMENT dans le corps : une fonction en
 * `security definer` contourne la RLS, et sans ce contrôle n'importe quel compte
 * authentifié pourrait faire tourner le jeton d'un autre vendeur — c'est-à-dire
 * couper l'accès aux clients de quelqu'un d'autre.
 *
 * LES DEUX JETONS TOURNENT ENSEMBLE. Ne renouveler que le jeton public
 * laisserait au détenteur du lien fuité de quoi agir sur la commande par l'autre
 * porte.
 *
 * Le drapeau est posé LOCAL : il retombe à la fin de la transaction, même en cas
 * d'erreur. Un drapeau qui survivrait à la transaction laisserait la porte
 * ouverte pour tout le reste de la session.
 */
create function public.regenerer_jeton_public(p_order_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_nouveau text;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  -- La commande doit appartenir à l'appelant. Le contrôle est fait ICI parce que
  -- `security definer` a mis la RLS de côté.
  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    -- Même réponse que pour une commande inexistante : distinguer les deux
    -- révélerait l'existence de la commande d'un autre vendeur.
    raise exception 'Commande introuvable.' using errcode = 'DL012';
  end if;

  perform set_config('droplink.rotation_jeton', 'oui', true);

  update public.orders
  set public_token = public.generer_jeton_public(),
      unsubscribe_token = public.generer_jeton_public()
  where id = p_order_id
  returning public_token into v_nouveau;

  perform set_config('droplink.rotation_jeton', '', true);

  return v_nouveau;
end;
$$;

revoke execute on function public.regenerer_jeton_public(uuid) from public, anon;
grant execute on function public.regenerer_jeton_public(uuid) to authenticated;
