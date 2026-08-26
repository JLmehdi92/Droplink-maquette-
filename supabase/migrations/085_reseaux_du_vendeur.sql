/*
 * LES RÉSEAUX DU VENDEUR — trois colonnes, et rien de plus.
 *
 * Instagram, TikTok, WhatsApp. CES TROIS-LÀ SEULEMENT : Snapchat et Telegram
 * sont écartés par décision de Wassim, et l'énumération vit dans la CONTRAINTE
 * plutôt que dans une liste applicative — une règle applicative peut être
 * oubliée dans un nouveau chemin de code, une règle en base ne peut pas l'être.
 *
 * NULLABLES SANS DÉFAUT. Il n'existe pas d'état « réseau vide » à distinguer de
 * « réseau non configuré » : la chaîne vide est refusée par la contrainte, donc
 * `null` est le seul mot pour l'absence. La page publique OMET le bloc entier
 * quand les trois sont nuls — pas de logos grisés, pas de « ajoutez vos
 * réseaux » : le client n'a rien à faire de ce que son vendeur n'a pas rempli.
 *
 * LE DOMAINE EST CONTRAINT EN BASE, pas seulement par Zod. Un champ de lien
 * rendu tel quel sur la page d'un tiers est une redirection ouverte offerte à
 * qui contrôle un compte vendeur : `javascript:`, `data:`, ou simplement un
 * domaine d'hameçonnage portant le nom du vendeur. Zod le refusera aussi — les
 * deux ne remplacent pas le même défaut : Zod EXPLIQUE au vendeur, la
 * contrainte EMPÊCHE quel que soit le chemin d'écriture.
 *
 * `https` EXIGÉ, jamais `http` : un lien en clair depuis une page servie en
 * TLS serait bloqué par le navigateur ou dégraderait la connexion.
 */

alter table public.shops
  add column instagram_url text,
  add column tiktok_url text,
  add column whatsapp_url text;

comment on column public.shops.instagram_url is
  'Lien Instagram du vendeur, facultatif. NULL = non configuré, et la page publique omet alors le bloc.';
comment on column public.shops.tiktok_url is
  'Lien TikTok du vendeur, facultatif.';
comment on column public.shops.whatsapp_url is
  'Lien WhatsApp du vendeur, facultatif. wa.me ou api.whatsapp.com.';

/*
 * Les motifs sont ancrés aux DEUX bouts (`^` et `$`) : sans l'ancre de fin,
 * `https://instagram.com.attaquant.example/…` passerait le contrôle — c'est la
 * façon la plus courante de croire qu'on a validé un domaine.
 *
 * Le sous-domaine `www.` est accepté parce que c'est ce que le vendeur colle
 * depuis sa barre d'adresse ; refuser sa propre URL lui ferait conclure que le
 * champ est cassé.
 */
alter table public.shops
  add constraint shops_instagram_url_domaine check (
    instagram_url is null
    or instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._/?=&%-]{1,180}$'
  ),
  add constraint shops_tiktok_url_domaine check (
    tiktok_url is null
    or tiktok_url ~ '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._/?=&%-]{1,180}$'
  ),
  add constraint shops_whatsapp_url_domaine check (
    whatsapp_url is null
    or whatsapp_url ~ '^https://(wa\.me|api\.whatsapp\.com)/[A-Za-z0-9._/?=&%+-]{1,180}$'
  );

/*
 * LA LECTURE PUBLIQUE REND LES TROIS LIENS.
 *
 * DROP EXPLICITE, comme en 035 : `create or replace function` NE REMPLACE PAS
 * une fonction dont la liste de retour change — Postgres en crée une SECONDE,
 * les deux surcharges coexistent, et un appel résout l'ANCIENNE sans lever la
 * moindre erreur. Les réseaux paraîtraient alors « posés » tout en n'arrivant
 * jamais jusqu'à la page.
 *
 * La liste des colonnes reste ÉNUMÉRÉE : `internal_notes`, `unsubscribe_token`,
 * `notify_email` et `shop_id` n'y sont toujours pas, et une colonne ajoutée
 * plus tard à `orders` ou `shops` ne s'y invitera pas par accident.
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
    boutique_whatsapp text
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
    (s.watermark_enabled and s.name is not null and btrim(s.name) <> ''),
    s.instagram_url,
    s.tiktok_url,
    s.whatsapp_url
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
 * LE DROIT D'ÉCRITURE EST ACCORDÉ COLONNE PAR COLONNE, et ces trois-là sont
 * NOUVELLES : sans cette ligne, le vendeur voit ses champs, remplit, envoie, et
 * l'écriture est refusée. La 001 a posé `grant update (…) on shops` en
 * énumérant les colonnes précisément pour que `role` et `status` ne puissent
 * jamais s'y glisser — la contrepartie est qu'une colonne ajoutée naît en
 * lecture seule, et que rien ne le dit.
 */
grant update (instagram_url, tiktok_url, whatsapp_url)
  on public.shops to authenticated;
