-- 065 — Un média EST du contenu réel. Le déclencheur promis n'existait pas.
--
-- DÉFAUT CRITIQUE, ÉTABLI PAR EXÉCUTION. `marquer_premier_contenu` se termine
-- par ce commentaire, écrit dans la migration 006 :
--
--     « Les médias sont traités par leur propre déclencheur, avec leur table. »
--
-- CE DÉCLENCHEUR N'A JAMAIS EXISTÉ. Inventaire du catalogue sur `order_media` :
-- `order_media_cles_par_valeur`, `order_media_compter`, `order_media_plafonds`,
-- `order_media_ancre`. Aucun ne touche `orders.first_content_at`.
--
-- MESURÉ — une commande, une photo de 123 456 octets :
--
--     first_content_at: null   created_event_at: null
--     commandes_reelles: 0     medias_count: 1     stockage_octets: 123456
--
-- À l'échelle : 1 000 commandes de 3 vidéos chacune donnent
-- `commandes_reelles = 0` et 59 Go de stockage.
--
-- CE QUE ÇA CASSE. Chen crée une commande, dépose vingt photos QC, copie le
-- lien, l'envoie. Il ne tape ni pseudo ni référence — les deux sont
-- facultatifs. Le produit vient de faire exactement ce qu'il promet, et
-- `order_created` vaut zéro. Le « signal roi » de la phase de validation —
-- plus de quinze commandes en une semaine sans relance — affiche zéro pour le
-- vendeur qui marche.
--
-- ET LES DEUX MESURES SONT AVEUGLES AU MÊME ENDROIT : l'événement PostHog et le
-- compteur en base dépendent tous deux de `first_content_at`, donc aucune ne
-- rattrape l'autre. L'écart `order_editor_opened` − `order_created`, censé
-- mesurer l'abandon, mesurait en réalité « a-t-il tapé du texte ».
--
-- LE DÉCLENCHEUR VIT DU CÔTÉ DES MÉDIAS, comme la 006 l'avait prévu : c'est la
-- table qui sait qu'un média arrive. Le poser sur `orders` aurait demandé de
-- relire les médias à chaque écriture de commande.

create function public.media_marque_le_contenu()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- `is null` dans le `where` : le premier contenu ne se repose pas. Sans cette
  -- condition, chaque média redaterait la commande, et l'écart entre ouverture
  -- de l'éditeur et création — l'information qu'on cherche — disparaîtrait.
  update public.orders
     set first_content_at = now()
   where id = new.order_id
     and first_content_at is null;

  return new;
end;
$$;

revoke all on function public.media_marque_le_contenu() from public;

create trigger order_media_marque_le_contenu
  after insert on public.order_media
  for each row execute function public.media_marque_le_contenu();

-- REPRISE DE L'EXISTANT : les commandes qui portent déjà des médias sans avoir
-- de premier contenu sont exactement le cas décrit ci-dessus. La date retenue
-- est celle du média le plus ancien, pas `now()` — dater d'aujourd'hui une
-- création d'il y a trois semaines fausserait la seule courbe qu'on regarde.
update public.orders o
   set first_content_at = m.premier
  from (
    select order_id, min(created_at) as premier
    from public.order_media
    group by order_id
  ) m
 where m.order_id = o.id
   and o.first_content_at is null;
