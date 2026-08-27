-- 097 — LA PHOTO DE COUVERTURE A SA PROPRE DÉRIVÉE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME, MESURÉ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Sur `/p/[token]`, la photo de couverture est le PLUS GROS ÉLÉMENT de la page
-- — celui que le client vient voir. Elle était servie par la VIGNETTE :
--
--     source affichée : 200 × 200
--     rendu réel       : 899 × 562 au bureau  → agrandissement 4,49×
--                        390 × 293 en DPR 3   → agrandissement 5,85×
--
-- Une vignette de 200 px étirée cinq fois est floue, et elle l'est à l'endroit
-- exact où le produit prétend montrer un contrôle qualité.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI 900 PX, ET PAS 640 NI 1200
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 900 est DÉDUIT DU RENDU : la couverture fait 899 px au bureau. À 900 px il
-- n'y a donc AUCUN agrandissement, et 1,3× seulement sur un téléphone en DPR 3.
--
-- Mesuré dans le navigateur sur CINQ vraies photos QC du compte de test, en
-- WebP — dont les trois plus lourdes, à près de 2 Mo :
--
--     source            900@0,82   900@0,75   640@0,82
--     2160×2880 1950 Ko    89,2       62,0       49,9
--     2160×2880 2194 Ko   121,8       88,5       64,5
--     2160×2880 1952 Ko    78,4       55,7       47,0
--     2160×2374  306 Ko   103,8       73,4       57,6
--     2160×2215  288 Ko    95,0       69,1       54,2
--
-- D'où le choix retenu : 900 px avec une ÉCHELLE DE QUALITÉ plafonnée à 90 Ko.
-- La pleine résolution au bureau, et 55 à 89 Ko selon la photo — donc plus net
-- que 640 px, et plus léger que 900 px à qualité fixe. Le plafond est vérifié
-- côté SERVEUR sur la taille relue, comme pour la vignette : on ne croit jamais
-- le client sur la taille d'un fichier.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION NE FAIT PAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ELLE NE RATTRAPE PAS L'EXISTANT. Les médias déjà déposés n'ont pas de
-- couverture, et nous n'avons aucun encodeur côté serveur pour la fabriquer —
-- c'est une décision assumée du produit, `ffmpeg.wasm` et consorts pèsent plus
-- que ce qu'ils feraient gagner. `cle_couverture` est donc NULLABLE, et la page
-- publique retombe sur la vignette quand elle est absente. Une commande
-- ancienne reste floue ; une commande nouvelle ne l'est pas.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LA FORME CANONIQUE ACCEPTE UN TROISIÈME GENRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LA SIGNATURE CHANGE, DONC LA FONCTION SE `drop`. `create or replace` NE
-- REMPLACE PAS une fonction dont la liste d'arguments change : il en crée une
-- SECONDE, les deux coexistent, et un appel résout l'ANCIENNE sans la moindre
-- erreur. La suite `surcharges` refuse d'ailleurs toute fonction à plus d'une
-- signature — elle attraperait l'oubli, mais après coup.
--
-- Le booléen `p_vignette` ne pouvait pas porter trois valeurs. Le remplacer par
-- un genre nommé rend l'ajout suivant lisible plutôt qu'astucieux.
--
-- LES CONTRAINTES QUI L'APPELLENT DOIVENT PARTIR D'ABORD : Postgres refuse de
-- supprimer une fonction dont dépend un `CHECK`. On ne passe PAS par `cascade`,
-- qui les supprimerait sans le dire — elles sont retirées puis reposées
-- explicitement, et une contrainte oubliée serait visible dans ce fichier.
alter table public.order_media
  drop constraint order_media_cle_canonique,
  drop constraint order_media_cle_vignette_canonique;

drop function public.cle_media_canonique(text, boolean);

create function public.cle_media_canonique(p_cle text, p_genre text)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_cle ~ (
    '^medias/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || case p_genre
         when 'vignette'   then '[.]vignette[.]webp$'
         when 'couverture' then '[.]couverture[.]webp$'
         when 'media'      then '[.](avif|jpg|mov|mp4|png|webm|webp)$'
         -- UN GENRE INCONNU NE VAUT PAS « TOUT ACCEPTER ». Sans cette branche,
         -- une faute de frappe dans un appel futur rendrait la contrainte
         -- toujours fausse ou toujours vraie selon le `case` — les deux sont
         -- des défauts silencieux. Un motif impossible refuse explicitement.
         else '$.^'
       end
  );
$$;

comment on function public.cle_media_canonique(text, text) is
  'La forme exacte des clés d''objet que le produit fabrique, par genre : '
  'media, vignette, couverture. Doit rester d''accord avec `exigerCleCanonique` '
  'dans lib/storage/cles.ts — une suite de tests compare les deux, dans les '
  'deux sens.';

-- ⚠️ UN `drop` EFFACE LES DROITS. Ils ne suivent pas la fonction recréée, et
-- rien ne le signale : la table redeviendrait INSERTABLE PAR PERSONNE, avec une
-- erreur de permission sur la FONCTION et non sur la contrainte — donc un
-- symptôme qui envoie chercher ailleurs. Le piège est documenté dans la 089,
-- où il avait été rencontré ; il se repose intégralement ici.
--
-- Une contrainte `CHECK` qui appelle une fonction s'exécute avec les droits de
-- CELUI QUI ÉCRIT, pas du propriétaire de la table. `authenticated` en a donc
-- besoin. `anon` non : il ne fait que LIRE la page publique, et un `CHECK` ne
-- s'évalue qu'à l'écriture.
revoke all on function public.cle_media_canonique(text, text) from public;
grant execute on function public.cle_media_canonique(text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. LA COLONNE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- NULLABLE, comme `cle_vignette`, et pour la même raison : l'absence de dérivée
-- est un cas NORMAL. Le navigateur peut échouer à décoder un fichier, et
-- refuser la photo pour cela ferait payer au vendeur une limite qui est la
-- nôtre. La page publique retombe alors sur la vignette.
alter table public.order_media add column cle_couverture text;

comment on column public.order_media.cle_couverture is
  'Dérivée 900 px de la photo, servie comme couverture sur la page publique. '
  'Nulle quand elle n''a pas pu être produite — la page retombe sur la vignette.';

-- Les contraintes reviennent, la nouvelle avec elles. SANS `not valid` : les
-- lignes existantes portent `null` dans la nouvelle colonne, donc elles la
-- respectent déjà, et une contrainte non validée donnerait l'illusion d'une
-- garantie qui ne couvre que le futur.
alter table public.order_media
  add constraint order_media_cle_canonique
  check (public.cle_media_canonique(cle, 'media'));

alter table public.order_media
  add constraint order_media_cle_vignette_canonique
  check (cle_vignette is null or public.cle_media_canonique(cle_vignette, 'vignette'));

alter table public.order_media
  add constraint order_media_cle_couverture_canonique
  check (cle_couverture is null or public.cle_media_canonique(cle_couverture, 'couverture'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. LA COUVERTURE EST DÉRIVÉE, PAS LIBRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Même règle que la vignette, et pour la même raison : une clé dont le client
-- choisirait l'emplacement pourrait écraser le média d'un autre vendeur, par
-- l'UPDATE comme par l'INSERT. La forme seule ne suffit pas — elle dit à quoi
-- ressemble une clé, pas à QUI elle appartient.
--
-- `create or replace` est SÛR ici : c'est une fonction de déclencheur, sa liste
-- d'arguments est vide et le reste, et son type de retour ne change pas. C'est
-- le seul cas où le remplacement ne crée pas une seconde fonction.
create or replace function public.verifier_cles_media()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_prefixe text;
begin
  select 'medias/' || s.id::text || '/' || o.id::text || '/'
    into v_prefixe
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = new.order_id;

  if v_prefixe is null or position(v_prefixe in new.cle) <> 1 then
    raise exception 'cle hors du perimetre de la commande'
      using errcode = 'DL039';
  end if;

  if new.cle_vignette is not null
     and new.cle_vignette <> regexp_replace(new.cle, '\.[^./]+$', '') || '.vignette.webp' then
    raise exception 'vignette non derivee de la cle du media'
      using errcode = 'DL040';
  end if;

  if new.cle_couverture is not null
     and new.cle_couverture <> regexp_replace(new.cle, '\.[^./]+$', '') || '.couverture.webp' then
    raise exception 'couverture non derivee de la cle du media'
      using errcode = 'DL040';
  end if;

  return new;
end;
$$;

comment on function public.verifier_cles_media() is
  'Contrôle PAR VALEUR que les clés d''un média vivent sous le préfixe de sa commande, et que vignette et couverture sont dérivées EXACTEMENT comme cleVignette() et cleCouverture() les dérivent.';

revoke all on function public.verifier_cles_media() from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LA LECTURE PUBLIQUE REND LA COUVERTURE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ LE TYPE DE RETOUR CHANGE, DONC LA FONCTION SE `drop`. Une colonne ajoutée
-- à un `returns table` change la signature de retour : `create or replace`
-- échoue, et le contourner par une seconde fonction ferait résoudre l'ancienne.
--
-- Elle refait le MÊME filtre de suspension. Ne pas le refaire ici laisserait
-- les photos d'un compte suspendu accessibles alors que sa page ne répond plus
-- — une coupure à moitié faite est une coupure qui n'a pas eu lieu.
drop function public.lire_medias_publics(text);

create function public.lire_medias_publics(p_jeton text)
  returns table (
    id uuid,
    type public.media_type,
    cle text,
    cle_vignette text,
    cle_couverture text,
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
  select m.id, m.type, m.cle, m.cle_vignette, m.cle_couverture,
         m.largeur, m.hauteur, m.duree_s, m.position
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

-- Le `drop` a effacé les droits ici aussi. Sans ces deux lignes, la page
-- publique cesserait de rendre ses photos — et l'erreur porterait sur la
-- fonction, pas sur la page.
revoke execute on function public.lire_medias_publics(text) from public;
grant execute on function public.lire_medias_publics(text) to anon, authenticated;
