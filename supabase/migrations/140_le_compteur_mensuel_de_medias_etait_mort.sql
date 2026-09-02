/*
 * `usage_counters.media_count` NE COMPTAIT RIEN, ET DISAIT ZÉRO.
 *
 * MESURÉ PAR LE CATALOGUE, PAS PAR RELECTURE : aucune fonction du schéma
 * `public` ne mentionne cette colonne, aucune ligne de `src/` ne la lit, et les
 * trois lignes existantes valent toutes `0`. Elle a été déclarée avec la table
 * (migration 046) et n'a jamais reçu d'écrivain.
 *
 * C'EST LA MÊME MORT QUE `orders_created` AVANT LA 110 — mais elle a survécu
 * plus longtemps, pour une raison précise : une colonne HOMONYME,
 * `orders.media_count`, est parfaitement tenue depuis la 101. Chercher le nom
 * `media_count` dans le dépôt donnait donc des résultats abondants et
 * rassurants, tous portant sur l'autre colonne. La migration 103 avait déjà
 * relevé la confusion entre `compter_media` et `compter_medias` ; c'est la même
 * paire de noms qui a caché celle-ci.
 *
 * POURQUOI C'EST UN DÉFAUT ET NON UNE COLONNE INUTILISÉE. Elle est
 * `not null default 0` : elle n'est pas vide, elle AFFIRME zéro. Un compte qui
 * a déposé vingt photos ce mois-ci est décrit comme n'en ayant déposé aucune —
 * et le livrable réel de la phase de validation est précisément cette donnée
 * d'usage. Principe VII : « un compteur branché après coup démarre avec un
 * historique vide, donc inexploitable au moment précis où il faut décider. »
 *
 * ⚠️ UN FLUX, PAS UN STOCK. La suppression d'un média ne décrémente PAS : un
 * dépôt a bien eu lieu ce mois-là, et l'effacer réécrirait le passé. Ce qui est
 * OCCUPÉ maintenant vit sur `shops.medias_count` et `shops.stockage_octets`,
 * tenus par `compter_media` depuis la 049, et rendus à la suppression d'une
 * commande depuis la 139. Les deux compteurs répondent à deux questions
 * différentes, et c'est pour cela qu'ils coexistent.
 *
 * ⚠️ `storage_bytes` EST LAISSÉE INTACTE, DÉLIBÉRÉMENT. Elle est NULLABLE :
 * sans écrivain elle vaut `null`, ce qui se lit « non mesuré », ce qui est
 * VRAI. Écrire un flux mensuel d'octets sous un nom de stock remplacerait un
 * silence honnête par un chiffre ambigu — et le stock, lui, est déjà mesuré
 * ailleurs. Le jour où ce chiffre servira, il faudra décider ce qu'il mesure.
 */

create function public.compter_media_du_mois()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select s.owner_id into v_profil
    from public.orders o
    join public.shops s on s.id = o.shop_id
   where o.id = new.order_id;

  -- La commande a disparu entre-temps : il n'y a personne à qui imputer ce
  -- dépôt. On ne fabrique pas de ligne au hasard.
  if v_profil is null then
    return new;
  end if;

  insert into public.usage_counters (profile_id, period_month, media_count)
  values (v_profil, date_trunc('month', new.created_at)::date, 1)
  on conflict (profile_id, period_month) do update
    set media_count = public.usage_counters.media_count + 1,
        updated_at = now();

  return new;
end;
$$;

comment on function public.compter_media_du_mois() is
  'Compte un dépôt de média dans le mois où il a eu lieu. FLUX, pas stock : la '
  'suppression ne décrémente pas — le dépôt a eu lieu. Ce qui est occupé '
  'maintenant vit sur `shops.medias_count`.';

revoke all on function public.compter_media_du_mois() from public;

/*
 * `AFTER INSERT` SEULEMENT. Pas de `DELETE` — c'est un flux. Pas d'`UPDATE` non
 * plus : rien ne déplace un média d'une commande à une autre, et si cela
 * arrivait un jour, ce serait un déplacement, pas un nouveau dépôt.
 */
create trigger order_media_compter_du_mois
  after insert on public.order_media
  for each row execute function public.compter_media_du_mois();

/*
 * RATTRAPAGE DE L'HISTORIQUE.
 *
 * Sans lui, le compteur ne dirait la vérité que sur les dépôts à venir, et
 * l'écran afficherait un chiffre plus petit que la réalité — exactement le
 * biais rassurant qu'on vient de corriger. `set` et non `+` : les lignes valent
 * toutes zéro puisque rien ne les a jamais écrites, et une addition rendrait
 * cette migration dangereuse si elle était rejouée.
 *
 * Il ne rattrape que ce qui EXISTE ENCORE — les médias déjà supprimés sont
 * définitivement perdus pour ce compteur. C'est une sous-estimation, et elle
 * est dite plutôt que masquée : on ne peut pas reconstruire un flux à partir
 * d'un stock.
 */
insert into public.usage_counters (profile_id, period_month, media_count)
select s.owner_id, date_trunc('month', m.created_at)::date, count(*)
  from public.order_media m
  join public.orders o on o.id = m.order_id
  join public.shops s on s.id = o.shop_id
 group by s.owner_id, date_trunc('month', m.created_at)::date
on conflict (profile_id, period_month) do update
  set media_count = excluded.media_count,
      updated_at = now();
