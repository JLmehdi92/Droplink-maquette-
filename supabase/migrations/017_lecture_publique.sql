-- 017 — La lecture publique d'une commande, par jeton.
--
-- POURQUOI UNE FONCTION ET PAS UNE VUE.
--
-- Une vue exposée à `anon` se lit tout entière : `select * from ...` rendrait
-- LA TOTALITÉ des commandes de tous les vendeurs. C'est exactement l'inverse du
-- produit — chaque lien est censé être privé et isolé, sans galerie ni moteur de
-- recherche. Une fonction qui prend le jeton en argument ne peut rendre que la
-- ligne qui lui correspond : il n'y a rien à énumérer.
--
-- `security definer` parce que `anon` n'a aucun droit sur `orders`, et ne doit
-- surtout pas en avoir : le seul chemin de lecture publique est celui-ci.
--
-- CE QUI EST FILTRÉ, ET CE QUI NE L'EST PAS :
--
--   `profiles.status = 'active'`  → OUI. C'est la coupure de suspension, et
--     c'est la capacité technique qui fonde notre statut d'hébergeur. Quand un
--     compte est suspendu, ses pages cessent d'être servies.
--   `archived_at`                 → NON, délibérément. Archiver range le plan de
--     travail du vendeur ; cela ne casse pas la promesse faite à son client. Un
--     lien envoyé il y a trois semaines continue de répondre.
--
-- CE QUI N'EST PAS RENDU : `internal_notes` (elle porte le prix d'achat),
-- `unsubscribe_token` (un jeton, un pouvoir), `notify_email`, `shop_id`,
-- `first_content_at`, `created_event_at`. L'énumération est explicite : une
-- colonne ajoutée plus tard à `orders` ne se retrouvera pas ici par accident.
--
-- JETON INCONNU, JETON RÉVOQUÉ ET COMPTE SUSPENDU rendent la MÊME chose : zéro
-- ligne. Un seul chemin de sortie, donc aucun oracle — ni par le contenu, ni par
-- le code de réponse. Le test compare aussi l'ORDRE DE GRANDEUR du délai : un
-- écart de temps est une divulgation comme une autre.

create function public.lire_commande_publique(p_jeton text)
  returns table (
    jeton text,
    client text,
    reference text,
    statut public.order_status,
    statut_qc public.qc_status,
    numero_suivi text,
    transporteur text,
    couverture uuid,
    creee_le timestamptz,
    modifiee_le timestamptz,
    boutique_nom text,
    boutique_logo text,
    boutique_couleur text,
    boutique_langue text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    o.public_token,
    o.customer_label,
    o.product_ref,
    o.status,
    o.qc_status,
    o.tracking_number,
    o.carrier_code,
    o.cover_media_id,
    o.created_at,
    o.updated_at,
    s.name,
    s.logo_url,
    s.accent_color,
    s.default_language
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active'
$$;

comment on function public.lire_commande_publique(text) is
  'Lecture publique par jeton. Aucune énumération possible : la fonction exige le jeton.';

/*
 * LES MÉDIAS DE LA MÊME COMMANDE.
 *
 * Deux fonctions plutôt qu'une jointure qui répéterait la commande sur chaque
 * ligne : la page publique a un budget de poids, et transporter quinze fois le
 * nom de la boutique pour quinze photos le dépense pour rien.
 *
 * Elle refait le MÊME filtre de suspension. Ne pas le refaire ici laisserait les
 * photos d'un compte suspendu accessibles alors que sa page ne répond plus —
 * une coupure à moitié faite est une coupure qui n'a pas eu lieu.
 */
create function public.lire_medias_publics(p_jeton text)
  returns table (
    id uuid,
    type public.media_type,
    cle text,
    cle_vignette text,
    largeur int,
    hauteur int,
    duree_s int,
    -- `position` est un mot réservé dans une liste de colonnes de retour :
    -- Postgres refuse la déclaration. `rang` dit la même chose.
    rang int
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.id, m.type, m.cle, m.cle_vignette, m.largeur, m.hauteur, m.duree_s, m.position
  from public.order_media m
  join public.orders o on o.id = m.order_id
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active'
  order by m.position asc
$$;

comment on function public.lire_medias_publics(text) is
  'Médias d''une commande, par jeton. Refait le filtre de suspension : une coupure à moitié faite n''a pas eu lieu.';

-- Postgres accorde EXECUTE à PUBLIC par défaut — un droit qui ne s'écrit pas
-- dans le corps d'une fonction, donc qu'aucune relecture de code ne peut voir.
-- Ici on le veut ouvert à `anon`, mais EXPLICITEMENT, et à personne d'autre par
-- inadvertance.
revoke execute on function public.lire_commande_publique(text) from public;
revoke execute on function public.lire_medias_publics(text) from public;

grant execute on function public.lire_commande_publique(text) to anon, authenticated;
grant execute on function public.lire_medias_publics(text) to anon, authenticated;
