/*
 * LA DESCRIPTION DE LA BOUTIQUE — la deuxième ligne de l'en-tête client.
 *
 * POURQUOI. Le kit vendeur (`BrandView`) pose un champ « Description
 * (optionnelle) » avec son compteur « 34 / 150 », et sa page client l'affiche
 * sous le nom de la boutique : « Vêtements · Sneakers · Accessoires ». Comparé
 * au pixel le 13/09/2026, l'écran `/marque` n'avait ni le champ ni la colonne.
 *
 * ⚠️ ET C'EST UNE COLONNE, PAS UN ÉCART DÉCLARABLE. La tentation était de la
 * ranger dans « le kit montre une donnée que la base n'a pas » : c'est vrai, et
 * ce n'est pas une raison. Cette famille-là couvre ce que la base ne PEUT pas
 * porter — le pays d'un destinataire qui n'a pas d'adresse, les lignes d'une
 * commande qui n'en a pas. Une description de boutique est du même ordre que
 * son nom et son logo, qui sont là depuis la 001.
 *
 * CE QU'ELLE DIT AU CLIENT, ET POURQUOI C'EST UTILE. La page client s'ouvre sur
 * le nom du vendeur. Pour un destinataire qui reçoit un lien en message privé,
 * une ligne qui dit ce que vend cette boutique est exactement ce qui fait la
 * différence entre « un lien inconnu » et « la boutique de la personne à qui
 * j'ai acheté » — c'est la crédibilité que le produit vend.
 *
 * ⚠️ BORNÉE À 150 CARACTÈRES, ET C'EST LE KIT QUI FIXE LE NOMBRE : son compteur
 * écrit « / 150 ». La borne est EN BASE et pas seulement dans le formulaire —
 * une règle applicative s'oublie dans un nouveau chemin d'écriture, une
 * contrainte de colonne non.
 *
 * NULL = NON CONFIGURÉE, et la page client OMET alors la ligne. Pas de texte de
 * remplacement, pas de ligne vide : c'est la décision 26, et c'est la même règle
 * que pour le nom et le logo.
 */

alter table public.shops
  add column description text;

comment on column public.shops.description is
  'Description courte de la boutique, affichée sous son nom sur la page client. NULL = non configurée, et la page l''omet alors. Bornée à 150 caractères par le compteur du design system.';

alter table public.shops
  add constraint shops_description_bornee check (
    description is null or length(description) <= 150
  );

/*
 * LE DROIT D'ÉCRITURE EST UN PRIVILÈGE DE COLONNE, jamais une policy.
 *
 * `authenticated` ne peut écrire QUE les colonnes qu'on lui accorde
 * explicitement — c'est ce qui empêche un vendeur de se promouvoir admin, et
 * c'est le même mécanisme ici. Une colonne ajoutée sans ce `grant` serait
 * lisible et jamais modifiable : le formulaire enregistrerait « sans erreur »
 * et la valeur ne bougerait pas.
 *
 * ⚠️ UNE SUITE COMPARE CET INVENTAIRE AU CATALOGUE, dans les deux sens
 * (`tests/rls/catalogue.test.ts`, « seules les colonnes déclarées sont
 * modifiables par authenticated »). Elle rougira tant que la colonne n'y est pas
 * déclarée avec sa raison — c'est voulu.
 */
grant update (description) on public.shops to authenticated;

/*
 * LA LECTURE PUBLIQUE REND LA DESCRIPTION, ET LA FONCTION EST DROPÉE D'ABORD.
 *
 * `create or replace function` NE REMPLACE PAS une fonction dont la table de
 * retour change : Postgres en crée une SECONDE, les deux surcharges coexistent,
 * et un appel résout l'ANCIENNE — sans lever la moindre erreur. La description
 * paraîtrait alors enregistrée tout en n'arrivant jamais jusqu'à la page. C'est
 * la quatrième fois que cette fonction est recréée (017, 035, 085, 133) et la
 * règle n'a pas changé.
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
    boutique_site text,
    boutique_description text
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
    end
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
