-- 063 — Un colis et la commande qu'il suit appartiennent au même vendeur.
--
-- DÉFAUT ÉTABLI PAR EXÉCUTION :
--
--   insert into order_parcels select <commande de A>, <colis de B>  →  OK
--   boutique_commande = ad40…   boutique_colis = 2a7b…
--
-- La table n'a que deux clés étrangères et une clé primaire composite. Rien ne
-- dit que les deux côtés appartiennent au même `shop_id`.
--
-- CE N'EST PAS ATTEIGNABLE AUJOURD'HUI, et c'est précisément le problème. Le
-- vendeur n'a aucun droit sur cette table, et la seule voie d'attachement —
-- `attacher_colis` — est correctement bornée : appelée sur un numéro déjà
-- employé par un autre vendeur, elle crée un NOUVEAU colis dans la boutique de
-- l'appelant. L'invariant tient donc par la fonction et par l'absence de droit,
-- pas par la base. Un second chemin d'attachement — un import, une reprise, un
-- webhook — le perdrait sans que rien ne le dise.

create function public.verifier_colis_du_meme_vendeur()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop_commande uuid;
  v_shop_colis    uuid;
begin
  select o.shop_id into v_shop_commande from public.orders o where o.id = new.order_id;
  select tp.shop_id into v_shop_colis from public.tracked_parcels tp where tp.id = new.parcel_id;

  -- Une extrémité absente : les clés étrangères refuseront de toute façon. On
  -- ne double pas leur message, on les laisse parler.
  if v_shop_commande is null or v_shop_colis is null then
    return new;
  end if;

  if v_shop_commande <> v_shop_colis then
    raise exception 'le colis et la commande n''appartiennent pas au meme vendeur'
      using errcode = 'DL033';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_colis_du_meme_vendeur() from public;

create trigger order_parcels_meme_vendeur
  before insert or update on public.order_parcels
  for each row execute function public.verifier_colis_du_meme_vendeur();
