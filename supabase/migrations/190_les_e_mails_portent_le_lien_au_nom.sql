-- 190 — LES E-MAILS DE SUIVI PORTENT LE LIEN AU NOM DU VENDEUR.
--
-- DÉFAUT TROUVÉ PAR LA GARDE `lien-page-client` : la 188 rendait le jeton public
-- seul, et l'e-mail fabriquait `/p/<jeton>` à la main. Un vendeur Pro qui a payé
-- pour que ses clients reçoivent `droplink.fr/<son-nom>/<jeton>` aurait vu ses
-- e-mails porter l'autre forme — sans rien casser, donc sans rien signaler.
--
-- La fonction rend désormais `shops.slug`, et l'application compose le lien par
-- `lienPageClient()`, comme partout ailleurs. Le type de retour change : `create
-- or replace` créerait une SECONDE fonction, donc `drop` d'abord.

drop function public.notifications_a_envoyer(integer);

create function public.notifications_a_envoyer(p_limite integer)
  returns table (
    order_id uuid,
    etape public.order_status,
    email text,
    jeton_public text,
    jeton_desinscription text,
    langue text,
    nom_boutique text,
    nom_de_lien text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.id, o.status, o.notify_email, o.public_token, o.unsubscribe_token,
         s.default_language::text, s.name, s.slug
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.notify_email is not null
    and o.status in ('expedie', 'en_transit', 'livre')
    and o.archived_at is null
    and o.admin_blocked_at is null
    and not exists (
      select 1 from public.notifications_sent n
      where n.order_id = o.id and n.etape = o.status
    )
  order by o.updated_at
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$$;
revoke all on function public.notifications_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.notifications_a_envoyer(integer) to service_role;
