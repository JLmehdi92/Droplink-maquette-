-- 060 — Un média appartient à la commande pour laquelle il a été déposé.
--
-- DÉFAUT ÉTABLI PAR EXÉCUTION. Les deux gardes de `order_media` ne portaient
-- que sur l'INSERT (plafonds) ou sur les seules colonnes de clé (périmètre) :
--
--   update order_media set order_id = <commande déjà pleine>   → 21 médias
--   update order_media set type = 'video'                      → 6 vidéos
--   update order_media set order_id = <commande d'un AUTRE>     → clé
--     `medias/{shopA}/…` portée par une commande de {shopB}
--
-- Le troisième est le plus grave : la page publique de B servirait un objet du
-- préfixe de A, en le signant depuis SA ligne — donc au-delà d'une suspension
-- du compte A.
--
-- LE MOTIF EST GÉNÉRAL, ET IL VAUT D'ÊTRE NOMMÉ : là où la base tient, elle
-- tient à l'INSERT et à la ligne. Les trous sont à l'UPDATE, à la relation
-- inverse, et au niveau instruction. Ces trois-là sont bouchés aujourd'hui par
-- un privilège de colonne — donc par une ABSENCE de droit, pas par une règle.
-- `service_role` a l'UPDATE complet, et le prochain chemin serveur qui touche
-- cette table hérite du trou.
--
-- ON REFUSE PLUTÔT QUE DE REVALIDER, et c'est délibéré. Revalider les plafonds
-- à l'UPDATE demanderait de recompter en excluant la ligne en cours de
-- déplacement — un raisonnement subtil, donc un endroit où se tromper. Or
-- AUCUN chemin du produit ne déplace un média ni ne change son type : le type
-- vient du fichier déposé, la commande vient de l'écran où on l'a déposé. Ce
-- qui n'arrive jamais doit être refusé, pas encadré.

create function public.media_ancre()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.order_id is distinct from old.order_id then
    raise exception 'un media ne change pas de commande'
      using errcode = 'DL029';
  end if;

  if new.type is distinct from old.type then
    raise exception 'un media ne change pas de type'
      using errcode = 'DL029';
  end if;

  return new;
end;
$$;

revoke all on function public.media_ancre() from public;

create trigger order_media_ancre
  before update of order_id, type on public.order_media
  for each row execute function public.media_ancre();
