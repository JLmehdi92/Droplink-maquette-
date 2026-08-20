-- 016 — La photo de couverture doit appartenir à SA commande.
--
-- `orders.cover_media_id` référence `order_media`, mais une clé étrangère dit
-- « ce média existe », jamais « il est à vous ». Sans ce contrôle, un vendeur
-- pouvait désigner comme couverture le média d'une AUTRE commande — y compris
-- celle d'un autre vendeur, dont il lui suffisait de connaître l'identifiant.
-- La page publique aurait alors affiché, en couverture, la photo de quelqu'un
-- d'autre.
--
-- La vérification existe déjà dans la Server Action. Elle n'y suffit pas : une
-- règle applicative peut être oubliée dans un nouveau chemin — une duplication,
-- un import depuis un lien d'agent, une reprise. Une règle en base ne peut pas
-- l'être, et c'est le seul endroit où l'on peut l'affirmer.

create function public.verifier_couverture()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.cover_media_id is null then
    return new;
  end if;

  -- Rien à revérifier si la couverture n'a pas bougé : cela ferait payer une
  -- lecture à chaque sauvegarde de champ, sur l'écran le plus utilisé.
  if tg_op = 'UPDATE' and old.cover_media_id is not distinct from new.cover_media_id then
    return new;
  end if;

  perform 1
  from public.order_media m
  where m.id = new.cover_media_id and m.order_id = new.id;

  if not found then
    raise exception 'La couverture doit être un média de cette commande.'
      using errcode = 'DL028';
  end if;

  return new;
end;
$$;

create trigger orders_verifier_couverture
  before insert or update on public.orders
  for each row execute function public.verifier_couverture();

revoke execute on function public.verifier_couverture() from public, anon, authenticated;
