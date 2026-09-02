/*
 * SUPPRIMER UNE COMMANDE NE RENDAIT PAS SES OCTETS À LA BOUTIQUE.
 *
 * `compter_media` (migration 049) tient `shops.medias_count` et
 * `shops.stockage_octets`, et son en-tête dit exactement pourquoi la
 * décrémentation existe : « sans elle, le compteur mesurerait les octets JAMAIS
 * DÉPOSÉS plutôt que les octets OCCUPÉS — un chiffre qui ne redescend pas finit
 * par n'avoir aucun rapport avec la facture, et il aurait l'air parfaitement
 * crédible tout du long. »
 *
 * C'est précisément ce qui se produisait, par un chemin que ce raisonnement
 * n'avait pas prévu. Le déclencheur commence par retrouver la boutique en
 * lisant `orders`. À la suppression d'un MÉDIA, la commande est là et tout va
 * bien. À la suppression d'une COMMANDE, la cascade détruit d'abord la ligne
 * `orders`, puis ses `order_media` : quand `compter_media` s'exécute, la
 * commande n'existe plus, `v_shop` est nul, et la fonction sort par la branche
 * qui commente « rien à corriger ». Les octets restent comptés pour toujours.
 *
 * MESURÉ AVANT CORRECTION, sur la base réelle :
 *
 *   dépôt d'un média de 7 654 321 o          →  compteur 1 / 7 654 321
 *   suppression du MÉDIA seul                →  compteur 0 / 0          (correct)
 *   redépôt, puis suppression de la COMMANDE →  compteur 1 / 7 654 321  (jamais rendu)
 *
 * Et l'écart était DÉJÀ DANS LES DONNÉES : le compte principal portait +1 média
 * et +100 octets que plus rien ne pouvait rendre.
 *
 * ⚠️ CE N'EST PAS UN CHEMIN THÉORIQUE. Aucun écran ne supprime de commande — le
 * geste produit est l'archivage — et le catalogue confirme qu'`authenticated`
 * n'a aucun droit `DELETE` sur `orders` : seuls `service_role` et `postgres`
 * l'ont. Mais notre propre outillage en supprime à CHAQUE exécution :
 * `scripts/fumee.mjs` détruit sa commande et son brouillon dans son `finally`.
 * Chaque passage des portes gonflait donc un compteur d'un cran — une dérive
 * qui grandit exactement au rythme où l'on regarde.
 *
 * CE QUE FAIT LA CORRECTION. Un déclencheur `BEFORE DELETE` sur `orders` rend
 * en une fois le compte et la somme de ses médias. Il s'exécute AVANT que la
 * ligne parte, donc avant la cascade : `compter_media` trouvera ensuite la
 * commande absente et sortira sans rien faire, exactement comme aujourd'hui.
 * PAS DE DOUBLE DÉCRÉMENTATION — c'est l'ordre garanti par Postgres qui l'exclut,
 * pas une précaution dans le corps de la fonction.
 *
 * ⚠️ ET IL RESTE MUET QUAND LA BOUTIQUE PART AUSSI. Si la suppression vient de
 * `shops`, la ligne `shops` est détruite avant que la cascade n'atteigne
 * `orders` : l'`update` ne touche alors aucune ligne. C'est le bon
 * comportement — il n'y a plus de compteur à rendre —, et il ne repose sur
 * aucune condition écrite ici.
 */

create function public.rendre_compteurs_de_commande()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_nombre integer;
  v_octets bigint;
begin
  select count(*), coalesce(sum(m.taille_octets), 0)
    into v_nombre, v_octets
    from public.order_media m
   where m.order_id = old.id;

  -- Une commande sans média est le cas le plus fréquent — un brouillon
  -- abandonné. On ne touche alors à rien : un `update` inconditionnel écrirait
  -- une ligne pour ne rien changer, à chaque suppression.
  if v_nombre > 0 then
    update public.shops
       set medias_count = greatest(medias_count - v_nombre, 0),
           stockage_octets = greatest(stockage_octets - v_octets, 0)
     where id = old.shop_id;
  end if;

  return old;
end;
$$;

comment on function public.rendre_compteurs_de_commande() is
  'Rend à la boutique le compte et les octets des médias d''une commande supprimée. `compter_media` ne pouvait pas le faire : à la cascade, la ligne `orders` a déjà disparu et il ne retrouve plus la boutique.';

revoke all on function public.rendre_compteurs_de_commande() from public;

create trigger orders_rendre_compteurs
  before delete on public.orders
  for each row execute function public.rendre_compteurs_de_commande();

/*
 * REPRISE DE L'EXISTANT — la dérive déjà accumulée est effacée.
 *
 * Sans elle, la correction empêcherait l'écart de grandir tout en laissant
 * mentir les compteurs actuels : le panneau admin continuerait d'afficher un
 * stockage qui n'existe pas, et personne ne saurait plus si c'est un reste de
 * cette dérive ou une dérive neuve. On recalcule depuis la seule chose qui
 * fasse foi — les lignes elles-mêmes.
 *
 * `is distinct from` en garde : seules les boutiques réellement fausses sont
 * réécrites, donc la migration dit combien elle en a corrigé.
 */
with verite as (
  select s.id,
         count(m.id) as nombre,
         coalesce(sum(m.taille_octets), 0) as octets
    from public.shops s
    left join public.orders o on o.shop_id = s.id
    left join public.order_media m on m.order_id = o.id
   group by s.id
)
update public.shops s
   set medias_count = v.nombre,
       stockage_octets = v.octets
  from verite v
 where v.id = s.id
   and (s.medias_count is distinct from v.nombre
        or s.stockage_octets is distinct from v.octets);
