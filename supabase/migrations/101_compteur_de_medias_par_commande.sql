-- 101 — Le nombre de médias, porté par `orders`.
--
-- POURQUOI. La planche `Commandes` de la liste porte une colonne PHOTOS, et le
-- brief §7 demande la même chose en toutes lettres. Il n'existait aucun moyen de
-- la rendre : le nombre de médias d'une commande n'était nulle part.
--
-- POURQUOI DÉNORMALISÉ ET PAS AGRÉGÉ À LA LECTURE. C'est exactement le cas de la
-- migration 027, mesuré à l'époque sur le compteur de vues. Une jointure
-- latérale qui compte les médias de cinquante commandes lit jusqu'à mille lignes
-- pour en afficher cinquante — au plafond produit de 20 médias par commande. Le
-- coût croît donc avec le nombre de photos déposées, c'est-à-dire avec l'usage
-- réel du produit. Un compteur tenu par déclencheur le ramène à zéro ligne
-- supplémentaire : la valeur voyage avec la commande, dans le `select` qui la
-- lisait déjà.
--
-- CE QU'ON PAIE EN ÉCHANGE : une écriture de plus par dépôt et par suppression
-- de média. Le plafond produit est de 20 médias par commande, il n'y a donc
-- aucune rafale possible sur une même ligne.
--
-- LE COMPTEUR N'EST PAS UNE DONNÉE DU VENDEUR. Il n'entre pas dans la liste des
-- colonnes écrivables : le laisser écrire reviendrait à laisser afficher
-- « 12 photos » sur une commande qui n'en porte aucune, c'est-à-dire à laisser
-- fabriquer la preuve que le client viendra chercher.

alter table public.orders
  add column media_count integer not null default 0;

comment on column public.orders.media_count is
  'Nombre de médias de la commande. MESURE tenue par déclencheur : jamais écrite par le vendeur.';

/*
 * LE DÉCLENCHEUR COUVRE AUSSI `UPDATE OF order_id`, ET C'EST DÉLIBÉRÉ.
 *
 * Aujourd'hui aucun chemin ne déplace un média d'une commande à une autre : la
 * duplication est un GABARIT, elle ne copie pas les médias. La tentation était
 * donc de ne poser qu'INSERT et DELETE, comme la 027 l'a fait pour `link_views`.
 *
 * La différence est que `link_views` est append-only PAR CONSTRUCTION, alors que
 * `order_media.order_id` est simplement une colonne que personne ne modifie
 * ENCORE. Une protection qui tient à ce que personne n'ajoute un chemin n'est
 * pas une protection, c'est un sursis (L-029) — et le sursis se paierait par un
 * compteur qui dérive en silence, sur une valeur affichée au vendeur.
 *
 * La clause `OF order_id` fait que ce bras ne s'exécute pas quand l'éditeur
 * réordonne les médias : `position` change des dizaines de fois par glisser,
 * `order_id` jamais.
 */
create function public.compter_medias()
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

create trigger order_media_compter_insertion
  after insert on public.order_media
  for each row execute function public.compter_medias();

create trigger order_media_compter_suppression
  after delete on public.order_media
  for each row execute function public.compter_medias();

create trigger order_media_compter_deplacement
  after update of order_id on public.order_media
  for each row execute function public.compter_medias();

revoke execute on function public.compter_medias() from public, anon, authenticated;

-- REPRISE DE L'EXISTANT. Sans elle, toute commande déjà remplie afficherait
-- « 0 photo » — c'est-à-dire précisément les commandes les plus anciennes, celles
-- dont le vendeur se souvient le moins et qu'il vérifierait le moins.
update public.orders o
   set media_count = m.n
  from (
    select order_id, count(*) as n
    from public.order_media
    group by order_id
  ) m
 where m.order_id = o.id;
