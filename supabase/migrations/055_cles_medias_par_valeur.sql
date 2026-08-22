-- 055 — La clé d'un média doit désigner un objet DU VENDEUR, et la base l'exige.
--
-- DÉFAUT CONSTATÉ PAR INTERROGATION DU CATALOGUE. `grant insert` a été posé sur
-- la TABLE `order_media` (013:160, 014:28), et un droit d'insertion de table
-- couvre TOUTES les colonnes :
--
--   information_schema.column_privileges · authenticated · INSERT
--     cle, cle_vignette, taille_octets, type, source, id, created_at, …
--
-- La migration 014 affirme pourtant que ces colonnes « sont écrites UNE FOIS, à
-- l'insertion, avec des valeurs que le serveur a établies lui-même ». Le serveur
-- les établit dans la Server Action. RIEN EN BASE NE L'EXIGEAIT.
--
-- LE SCÉNARIO, et c'est une fuite de média entre vendeurs :
-- le vendeur B, authentifié, poste directement sur `/rest/v1/order_media` une
-- ligne rattachée à SA commande — la policy passe, elle lui appartient bien —
-- mais dont `cle` désigne l'objet du vendeur A. Sa page publique sert alors le
-- média de A, avec une URL signée depuis SA ligne : au-delà de l'expiration de
-- l'URL d'origine, au-delà d'une révocation de jeton, et au-delà d'une
-- SUSPENSION du compte A, puisque c'est le profil de B qui est lu.
--
-- La 014 nomme exactement ce risque pour `cle` et laisse `cle_vignette` ouverte
-- à l'UPDATE — parce qu'elle est écrite en différé, quand la vignette arrive.
-- Les clés ne sont pas devinables, mais elles ne sont pas secrètes : le chemin
-- de l'objet est en clair dans chaque URL présignée servie sur la page publique.
--
-- C'EST L-025 DANS SA FORME LA PLUS PURE : le garde de la 014 a hérité du champ
-- de vision de la correction — l'UPDATE — et non du problème : une valeur
-- choisie par le client.
--
-- LA CORRECTION EST UN CONTRÔLE PAR VALEUR, PAS PAR DROIT. Restreindre l'INSERT
-- aux colonnes légitimes ne suffirait pas : `cle` DOIT rester insérable, c'est
-- l'application qui la calcule. Ce qui doit être vérifié, c'est que la valeur
-- désigne bien le préfixe du vendeur — et seule la base peut le faire, parce
-- qu'elle seule voit la commande, son shop, et la clé, dans la même transaction.

/*
 * Le préfixe attendu pour un média : `medias/{shop}/{commande}/`.
 *
 * Il se termine par une barre oblique, et ce n'est pas un détail : sans elle,
 * un préfixe `medias/shop-1/` accepterait `medias/shop-12/…`. Les identifiants
 * étant des UUID de longueur fixe, le défaut ne serait pas atteignable ici —
 * mais un contrôle qui n'est juste que par accident cesse de l'être au premier
 * changement de format.
 */
create function public.prefixe_media_attendu(p_order_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select 'medias/' || o.shop_id::text || '/' || o.id::text || '/'
  from public.orders o
  where o.id = p_order_id
$$;

revoke all on function public.prefixe_media_attendu(uuid) from public;

create function public.verifier_cles_media()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_prefixe text;
begin
  v_prefixe := public.prefixe_media_attendu(new.order_id);

  -- La commande a disparu entre-temps : la clé étrangère refusera de toute
  -- façon. On ne devine pas un préfixe, on laisse la contrainte parler.
  if v_prefixe is null then
    return new;
  end if;

  if position(v_prefixe in new.cle) <> 1 then
    raise exception 'cle hors du perimetre de la commande'
      using errcode = 'DL026';
  end if;

  -- LA VIGNETTE EST DÉRIVÉE, PAS LIBRE. Elle porte la même racine que le média
  -- plus un suffixe fixe : la laisser libre rouvrirait exactement le même
  -- chemin, avec le même effet, par l'UPDATE au lieu de l'INSERT.
  if new.cle_vignette is not null and new.cle_vignette <> new.cle || '.vignette.webp' then
    raise exception 'vignette non derivee de la cle du media'
      using errcode = 'DL027';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_cles_media() from public;

create trigger order_media_cles_par_valeur
  before insert or update of cle, cle_vignette on public.order_media
  for each row execute function public.verifier_cles_media();

-- L'INSERT est en outre restreint aux colonnes que l'application écrit
-- réellement. `source` et `created_at` gardent leur défaut, et `id` reste
-- fourni parce que l'application le génère avant de signer le dépôt.
-- Ce resserrement ne remplace pas le contrôle par valeur ci-dessus : il retire
-- seulement ce qui n'a aucune raison d'être fourni.
revoke insert on public.order_media from authenticated;
grant insert (id, order_id, type, cle, cle_vignette, largeur, hauteur,
              taille_octets, duree_s, position)
  on public.order_media to authenticated;
