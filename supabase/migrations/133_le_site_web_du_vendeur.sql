/*
 * LE SITE WEB DU VENDEUR — une quatrième adresse, à côté des trois réseaux.
 *
 * Demandé par Wassim le 02/09/2026, dans le même message que le défaut de
 * saisie des réseaux : « mets-lui l'option de rajouter un site web, pareil que
 * là où on met les réseaux sociaux ». La planche a été écrite d'abord —
 * `Marque.dc.html` et `MarqueMobile.dc.html` portent le champ, les deux
 * planches de page client portent le lien.
 *
 * ⚠️ CETTE COLONNE EST DIFFÉRENTE DES TROIS AUTRES, ET C'EST LE POINT DÉLICAT.
 * Pour Instagram, TikTok et WhatsApp, la contrainte peut exiger LE domaine du
 * réseau : il n'y en a qu'un. Le site du vendeur, lui, est n'importe quel
 * domaine — c'est sa raison d'être. On ne peut donc pas contraindre l'hôte, et
 * ce champ EST, par construction, un lien libre affiché sur une page que le
 * client d'un vendeur croit être la sienne.
 *
 * CE QUI REMPLACE LE CONTRÔLE DE DOMAINE, ET QUI DOIT TENIR SEUL :
 *
 *   1. `https://` EXIGÉ, en toutes lettres et en tête. C'est ce qui ferme
 *      `javascript:`, `data:`, `vbscript:` et tout ce qu'on n'a pas prévu — le
 *      motif n'énumère pas les schémas interdits, il n'en autorise QU'UN.
 *      Énumérer les interdits serait une liste noire, donc une liste
 *      incomplète.
 *   2. AUCUN `@` DANS L'AUTORITÉ. La classe de l'hôte ne contient pas
 *      d'arobase, donc `https://instagram.com@attaquant.example/x` — qui
 *      s'affiche comme Instagram et mène ailleurs — ne franchit pas la
 *      contrainte. C'est la tromperie la plus courante sur un champ de lien
 *      libre, et elle ne se voit pas en relisant l'URL de gauche à droite.
 *   3. AUCUNE ESPACE, aucun caractère de contrôle : l'hôte et le chemin sont
 *      décrits par des classes fermées, jamais par « tout sauf ».
 *   4. LONGUEUR BORNÉE à 200, comme les trois autres.
 *
 * Et le rendu, côté page client, revérifie le motif AU RENDU et porte
 * `rel="noopener noreferrer"` avec `target="_blank"` — la même règle que les
 * trois réseaux, pour la même raison : React n'assainit pas un `href`, et le
 * seul contrôle qui protège la page de CE QU'ELLE LIT est celui qui s'exécute
 * au moment de le lire.
 */

alter table public.shops
  add column site_url text;

comment on column public.shops.site_url is
  'Site web du vendeur, facultatif. NULL = non configuré, et la page publique omet alors le lien. Contrairement aux trois réseaux, l''hôte n''est pas contraint — c''est le domaine du vendeur ; ce sont le schéma https et l''absence d''arobase dans l''autorité qui tiennent.';

alter table public.shops
  add constraint shops_site_url_forme check (
    site_url is null
    or (
      length(site_url) <= 200
      and site_url ~ '^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(/[A-Za-z0-9._~:/?#=@!$&''()*+,;%-]{0,180})?$'
    )
  );

/*
 * LA LECTURE PUBLIQUE REND LE SITE, ET LA FONCTION EST DROPÉE D'ABORD.
 *
 * `create or replace function` NE REMPLACE PAS une fonction dont la liste de
 * retour change : Postgres en crée une SECONDE, les deux surcharges coexistent,
 * et un appel résout l'ANCIENNE — sans lever la moindre erreur. Le site
 * paraîtrait alors enregistré tout en n'arrivant jamais jusqu'à la page. C'est
 * la troisième fois que cette fonction est recréée (017, 035, 085) et la règle
 * n'a pas changé.
 *
 * La liste des colonnes reste ÉNUMÉRÉE : `internal_notes`, `unsubscribe_token`,
 * `notify_email` et `shop_id` n'y sont toujours pas.
 */
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
    boutique_filigrane boolean,
    boutique_instagram text,
    boutique_tiktok text,
    boutique_whatsapp text,
    boutique_site text
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
    -- au vendeur un réglage qui ne peut pas s'appliquer.
    (s.watermark_enabled and s.name is not null and btrim(s.name) <> ''),
    s.instagram_url,
    s.tiktok_url,
    s.whatsapp_url,
    s.site_url
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active'
$$;

comment on function public.lire_commande_publique(text) is
  'Lecture publique par jeton. Aucune énumération possible : la fonction exige le jeton.';

-- Les droits ne survivent PAS au drop : ils sont reposés ici, à l'identique.
revoke all on function public.lire_commande_publique(text) from public;
grant execute on function public.lire_commande_publique(text) to anon;

/*
 * LE DROIT D'ÉCRITURE EST ACCORDÉ COLONNE PAR COLONNE. Sans cette ligne, le
 * vendeur voit son champ, le remplit, envoie, et l'écriture est refusée — la
 * 001 énumère les colonnes précisément pour que `role` et `status` ne puissent
 * jamais s'y glisser, et la contrepartie est qu'une colonne ajoutée naît en
 * lecture seule sans que rien ne le dise.
 */
grant update (site_url) on public.shops to authenticated;
