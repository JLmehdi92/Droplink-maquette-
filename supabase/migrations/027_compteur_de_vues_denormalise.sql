-- 027 — Le compteur de vues porté par `orders`.
--
-- POURQUOI, ET COMMENT ON L'A SU. Le tri « jamais ouvert par le client » a été
-- mesuré au plafond, sur un vendeur de 9 600 commandes, avec un compte voisin de
-- même volumétrie. Sur un jeu réaliste : 34 ms, 4 151 lignes lues. Sur le PIRE
-- cas — un vendeur dont TOUTES les commandes ont été ouvertes, c'est-à-dire un
-- vendeur chez qui ça marche — **500 ms et 48 001 lignes lues**, pour un seuil
-- fixé d'avance à 120 ms.
--
-- Le premier réflexe aurait été de poser un index. Il n'aurait rien changé : le
-- tri porte sur une ABSENCE, et il n'y a rien à indexer du côté des vues. Une
-- anti-jointure doit parcourir toutes les commandes tant qu'elle n'en a pas
-- trouvé cinquante sans vue — et quand il n'y en a aucune, elle les parcourt
-- toutes. Le coût croît donc avec le SUCCÈS du vendeur.
--
-- Le compteur dénormalisé transforme une absence en VALEUR, et une valeur
-- s'indexe. Il retire au passage la jointure latérale de la liste, qui lisait
-- 1 021 lignes pour en afficher cinquante.
--
-- CE QU'ON ACCEPTE EN ÉCHANGE : une écriture de plus par vue. Elle est bornée —
-- les vues sont dédupliquées par visiteur et par jour, il n'y a donc pas de
-- rafale possible sur une même commande — et elle se produit sur le chemin le
-- moins critique du produit, celui de la balise, exécutée après le rendu.
--
-- LE COMPTEUR EST UNE MESURE, PAS UNE DONNÉE DU VENDEUR. Il n'entre pas dans la
-- liste des colonnes qu'un vendeur peut écrire — la lui laisser écrire
-- reviendrait à lui laisser fabriquer sa propre preuve d'usage, sur un produit
-- dont le livrable EST la donnée d'usage.

alter table public.orders
  add column views_count integer not null default 0,
  add column last_viewed_at timestamptz;

comment on column public.orders.views_count is
  'Nombre de vues dédupliquées. MESURE tenue par déclencheur : jamais écrite par le vendeur.';

/*
 * Le déclencheur. AFTER INSERT seulement.
 *
 * `link_views` est append-only : aucune mise à jour, aucune suppression hors
 * cascade. Un déclencheur sur UPDATE ou DELETE décrirait des chemins qui
 * n'existent pas, et un déclencheur qui couvre un chemin inexistant est du code
 * que personne n'exécutera jamais — donc du code qu'on croira juste.
 */
create function public.compter_vue()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.orders
     set views_count = views_count + 1,
         last_viewed_at = greatest(coalesce(last_viewed_at, new.viewed_at), new.viewed_at)
   where id = new.order_id;
  return null;
end;
$$;

create trigger link_views_compter
  after insert on public.link_views
  for each row execute function public.compter_vue();

revoke execute on function public.compter_vue() from public, anon, authenticated;

-- REPRISE DE L'EXISTANT. Sans elle, les commandes déjà consultées afficheraient
-- zéro et remonteraient dans « jamais ouvert » : le compteur serait faux
-- exactement pour les commandes les plus anciennes, donc celles dont l'historique
-- compte le plus.
update public.orders o
   set views_count = v.n,
       last_viewed_at = v.derniere
  from (
    select order_id, count(*) as n, max(viewed_at) as derniere
    from public.link_views
    group by order_id
  ) v
 where v.order_id = o.id;

/*
 * L'INDEX DU TRI « JAMAIS OUVERT ».
 *
 * PARTIEL sur `views_count = 0`, parce que c'est un tri qu'on ne fait JAMAIS
 * dans l'autre sens : personne ne demande « les commandes déjà ouvertes, par
 * date ». Un index complet coûterait sur toutes les écritures pour servir une
 * question qui ne se pose pas.
 */
create index orders_jamais_ouvert_idx
  on public.orders (shop_id, created_at desc, id desc)
  where views_count = 0 and archived_at is null;
