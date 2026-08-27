-- 103 — `compter_medias` devient `compter_medias_de_commande`.
--
-- POURQUOI UNE MIGRATION POUR UN NOM. Le catalogue portait, sur la MÊME table,
-- deux fonctions de déclencheur nommées `compter_media` et `compter_medias` :
-- une lettre d'écart, deux rôles sans rapport. La première tient les compteurs
-- d'usage mensuels du compte (migration 046) ; la seconde, posée par la 101,
-- tient le nombre de médias d'UNE commande.
--
-- Ce n'est pas de l'esthétique. Le projet a déjà rencontré une fonction résolue
-- à la mauvaise surcharge sans la moindre erreur ; ici il ne s'agit même pas
-- d'une surcharge, mais de deux noms qu'une relecture confond à coup sûr — et
-- une correction appliquée à la mauvaise des deux ne se manifesterait que par un
-- compteur qui dérive, c'est-à-dire par un autre nombre, jamais par une erreur.
--
-- Le nom est corrigé À LA SOURCE plutôt que dans la 101, qui est appliquée et ne
-- se rouvre pas : l'ordre lexicographique EST l'ordre d'application, et un
-- fichier déjà joué qu'on modifie fait diverger les environnements en silence.

drop trigger order_media_compter_insertion on public.order_media;
drop trigger order_media_compter_suppression on public.order_media;
drop trigger order_media_compter_deplacement on public.order_media;
drop function public.compter_medias();

create function public.compter_medias_de_commande()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.orders
       set media_count = media_count + 1
     where id = new.order_id;

  elsif tg_op = 'DELETE' then
    update public.orders
       set media_count = greatest(media_count - 1, 0)
     where id = old.order_id;

  elsif old.order_id is distinct from new.order_id then
    update public.orders
       set media_count = greatest(media_count - 1, 0)
     where id = old.order_id;
    update public.orders
       set media_count = media_count + 1
     where id = new.order_id;
  end if;

  return null;
end;
$$;

comment on function public.compter_medias_de_commande() is
  'Tient `orders.media_count`. À ne pas confondre avec `compter_media`, qui tient les compteurs d''usage MENSUELS du compte.';

create trigger order_media_compter_insertion
  after insert on public.order_media
  for each row execute function public.compter_medias_de_commande();

create trigger order_media_compter_suppression
  after delete on public.order_media
  for each row execute function public.compter_medias_de_commande();

create trigger order_media_compter_deplacement
  after update of order_id on public.order_media
  for each row execute function public.compter_medias_de_commande();

revoke execute on function public.compter_medias_de_commande() from public, anon, authenticated;

-- REPRISE, PARCE QU'IL Y A EU UNE FENÊTRE SANS DÉCLENCHEUR. Entre le `drop
-- trigger` et le `create trigger` de cette migration, un dépôt de média n'aurait
-- pas été compté. La transaction rend la fenêtre nulle en pratique — mais s'en
-- remettre à cela sans le vérifier, c'est exactement le raisonnement qui laisse
-- passer un compteur faux. Le recalcul coûte une passe sur une table dont la
-- taille est bornée par vingt médias par commande.
update public.orders o
   set media_count = coalesce(m.n, 0)
  from (select id from public.orders) src
  left join (
    select order_id, count(*) as n
    from public.order_media
    group by order_id
  ) m on m.order_id = src.id
 where src.id = o.id and o.media_count is distinct from coalesce(m.n, 0);
