-- 035 — Rendre le filigrane à la lecture publique.
--
-- `shops.watermark_enabled` existe depuis la 001, il est écrivable par le
-- vendeur depuis la 001, et JUSQU'ICI PERSONNE NE LE LISAIT. Une colonne qu'on
-- accorde en écriture sans jamais s'en servir est un interrupteur qui ne coupe
-- rien : le vendeur l'actionnerait, l'interface confirmerait, et ses photos
-- sortiraient nues. C'est exactement la forme de défaut que le produit s'interdit
-- — l'interface n'affirme jamais ce que la base n'a pas enregistré, et à plus
-- forte raison ce qu'aucun rendu n'applique.
--
-- DROP EXPLICITE. `create or replace function` NE REMPLACE PAS une fonction dont
-- la liste de retour change : Postgres en crée une SECONDE, les deux surcharges
-- coexistent, et un appel résout l'ANCIENNE sans lever la moindre erreur. Le
-- filigrane paraîtrait alors « posé » tout en n'arrivant jamais jusqu'à la page.
--
-- La liste des colonnes rendues reste ÉNUMÉRÉE : `internal_notes`,
-- `unsubscribe_token`, `notify_email` et `shop_id` n'y sont toujours pas, et une
-- colonne ajoutée plus tard à `orders` ne s'y invitera pas par accident.

drop function if exists public.lire_commande_publique(text);

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
    boutique_langue text,
    boutique_filigrane boolean
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
    s.default_language,
    -- UN FILIGRANE A BESOIN DE QUELQUE CHOSE À ÉCRIRE. Sans nom de boutique il
    -- n'y a pas de texte à superposer, et le rendre « activé » ferait afficher
    -- au vendeur un réglage qui ne peut pas s'appliquer. La condition vit ICI,
    -- avec la donnée, plutôt que dans le composant : un second appelant qui
    -- l'oublierait produirait un filigrane vide sans que rien ne le signale.
    (s.watermark_enabled and s.name is not null and btrim(s.name) <> '')
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active'
$$;

comment on function public.lire_commande_publique(text) is
  'Lecture publique par jeton. Aucune énumération possible : la fonction exige le jeton.';

-- Les droits ne survivent PAS au drop : ils sont reposés ici, à l'identique.
-- Postgres accorde `EXECUTE` à `PUBLIC` par défaut — la révocation est ce qui
-- referme, et elle ne s'écrit pas dans le corps de la fonction.
revoke all on function public.lire_commande_publique(text) from public;
grant execute on function public.lire_commande_publique(text) to anon;
