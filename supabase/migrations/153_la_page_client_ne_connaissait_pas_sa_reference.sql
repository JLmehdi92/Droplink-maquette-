/*
 * LA PAGE CLIENT NE CONNAISSAIT PAS LA RÉFÉRENCE DE SA PROPRE COMMANDE.
 *
 * POURQUOI. La carte « Votre commande » du kit `client_link` porte en titre la
 * référence courte — « #DLK7842 », 30 px, l'élément le plus grand de la carte.
 * C'est la MÊME référence que le vendeur lit dans sa liste de commandes et dans
 * son éditeur (`lib/commandes/reference.ts`). Comparée au pixel le 13/09/2026,
 * la page client ne pouvait pas l'écrire : la lecture publique ne rend pas
 * l'identifiant de la commande, et c'est délibéré.
 *
 * ⚠️ CE N'EST PAS UN ORNEMENT. Un client qui écrit à son vendeur « ma commande
 * #A1B2C3 n'a pas bougé » lui donne exactement ce que son écran affiche. Sans
 * elle, il écrit « la veste bleue », et le vendeur à 200 commandes par semaine
 * cherche.
 *
 * ⚠️ LA RÉFÉRENCE EST CALCULÉE ICI, ET L'IDENTIFIANT NE SORT TOUJOURS PAS.
 * `tests/rls/page-publique.test.ts` cherche `orders.id` en entier dans tout ce
 * que rend la page ; il doit rester introuvable. Les six derniers caractères
 * hexadécimaux ne désignent ni le vendeur ni une autre commande — ils ne
 * relient pas deux liens entre eux, ce qui est la propriété que ce test garde.
 *
 * ⚠️ ET LA FORMULE EST CELLE DE `referenceCourte()`, À L'IDENTIQUE : tirets
 * retirés, six derniers caractères, majuscules. Deux formules divergentes
 * feraient afficher au client une référence que son vendeur ne retrouve pas.
 * Une suite compare les deux sur une vraie commande.
 *
 * LA FONCTION EST DROPÉE D'ABORD. `create or replace function` ne remplace pas
 * une fonction dont la table de retour change : il en crée une SECONDE, et un
 * appel résout l'ANCIENNE sans erreur. Cinquième recréation (017, 035, 085,
 * 133, 147), et elle HÉRITE de toutes les corrections de la 147 : filigrane
 * borné au nom, description qui suit le nom, filtre de suspension.
 *
 * La liste des colonnes reste ÉNUMÉRÉE : `internal_notes`, `unsubscribe_token`,
 * `notify_email`, `shop_id` et `id` n'y sont toujours pas.
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
    boutique_site text,
    boutique_description text,
    reference_courte text
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
    s.site_url,
    -- ⚠️ LA DESCRIPTION SUIT LE NOM : sans nom de boutique, l'en-tête est OMIS
    -- en entier (décision 24), et une description seule flotterait au-dessus du
    -- contenu sans dire de qui elle parle.
    case
      when s.name is null or btrim(s.name) = '' then null
      else s.description
    end,
    '#' || upper(right(replace(o.id::text, '-', ''), 6))
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
