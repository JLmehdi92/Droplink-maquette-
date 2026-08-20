-- 013 — Les médias d'une commande : photos et vidéos de contrôle qualité.

create type public.media_type as enum ('photo', 'video');
create type public.media_source as enum ('upload', 'agent_import');

create table public.order_media (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,

  type public.media_type not null,
  -- CLÉ D'OBJET, PAS UNE URL. Le bucket est privé : il n'existe aucune adresse
  -- publique à stocker, et une URL signée périmerait dans la colonne. La clé est
  -- générée PAR LE SERVEUR — une clé fournie par le client permettrait d'écraser
  -- le média d'un autre vendeur.
  cle text not null unique,
  -- L'absence de vignette est un CAS NORMAL : capturer l'image d'une vidéo peut
  -- échouer, et refuser la vidéo pour autant ferait payer au vendeur une limite
  -- qui est la nôtre.
  cle_vignette text,

  largeur int check (largeur is null or largeur > 0),
  hauteur int check (hauteur is null or hauteur > 0),
  -- RELUE CÔTÉ SERVEUR APRÈS DÉPÔT, jamais crue depuis le client : c'est la base
  -- du modèle de coût. Un client qui annonce 2 Mo pour un fichier de 80 Mo
  -- passerait tous les plafonds sans qu'aucun compteur ne bouge.
  taille_octets bigint not null check (taille_octets > 0),
  duree_s int check (duree_s is null or duree_s > 0),

  position int not null check (position >= 0),
  source public.media_source not null default 'upload',
  created_at timestamptz not null default now()
);

/*
 * UNICITÉ DIFFÉRÉE SUR LA POSITION.
 *
 * `deferrable initially deferred` est posé EXPRÈS. Un réordonnancement écrit les
 * nouvelles positions en une seule instruction, et passe forcément par un état
 * intermédiaire où deux lignes portent la même position. Une contrainte
 * immédiate obligerait à un aller-retour par une position fantôme — donc à
 * plusieurs écritures, donc à un état incohérent visible si l'une échoue.
 */
alter table public.order_media
  add constraint order_media_position_unique unique (order_id, position)
  deferrable initially deferred;

create index order_media_ordre_idx on public.order_media (order_id, position);

/*
 * LES PLAFONDS SONT VÉRIFIÉS EN BASE.
 *
 * Ils le sont AUSSI dans le code, avant de signer un dépôt — mais une règle
 * applicative peut être oubliée dans un nouveau chemin, une règle en base ne
 * peut pas l'être. Et c'est le seul poste de coût du produit qui peut déraper :
 * les vidéos.
 *
 * Les valeurs sont écrites ici en dur, à dessein. Un plafond lu dans une table
 * de configuration serait modifiable sans trace par qui sait écrire dedans ;
 * celui-ci exige une migration, donc une décision datée.
 */
create function public.verifier_plafonds_media()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_medias int;
  v_videos int;
begin
  select count(*), count(*) filter (where type = 'video')
  into v_medias, v_videos
  from public.order_media
  where order_id = new.order_id and id <> new.id;

  if v_medias >= 20 then
    raise exception 'Plafond de médias atteint pour cette commande.'
      using errcode = 'DL020';
  end if;

  if new.type = 'video' and v_videos >= 3 then
    raise exception 'Plafond de vidéos atteint pour cette commande.'
      using errcode = 'DL021';
  end if;

  return new;
end;
$$;

create trigger order_media_plafonds
  before insert on public.order_media
  for each row execute function public.verifier_plafonds_media();

-- RLS DÈS LA PREMIÈRE MIGRATION, jamais en rattrapage. Supabase accorde
-- SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : une table créée sans RLS est
-- grande ouverte, et le fichier de migration ne le dira pas.
alter table public.order_media enable row level security;
alter table public.order_media force row level security;

/*
 * L'ISOLATION PASSE PAR LA COMMANDE, qui porte le `shop_id`.
 *
 * La sous-requête est bornée par la clé primaire de `orders` : elle ne relit pas
 * la table à chaque ligne de média. `mon_shop_id()` reste évaluée une fois par
 * requête, puisqu'elle est STABLE et sans argument.
 */
create policy order_media_lecture on public.order_media
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()
    )
  );

create policy order_media_ecriture on public.order_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()
    )
  );

create policy order_media_maj on public.order_media
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()
    )
  );

create policy order_media_suppression on public.order_media
  for delete to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_media.order_id and o.shop_id = public.mon_shop_id()
    )
  );

/*
 * LES COLONNES ÉCRIVABLES SONT ÉNUMÉRÉES, et le privilège de COLONNE est évalué
 * AVANT la policy.
 *
 * `taille_octets` est absente de la mise à jour : elle fonde le modèle de coût
 * et n'est écrite qu'une fois, à l'insertion, avec la valeur relue chez le
 * fournisseur de stockage. La laisser modifiable permettrait de déclarer un
 * média de 80 Mo comme pesant 1 Ko — sans jamais toucher au fichier.
 *
 * `cle` l'est aussi : la faire pointer ailleurs après coup permettrait de
 * désigner l'objet d'un autre vendeur depuis sa propre commande.
 */
grant select, insert, delete on public.order_media to authenticated;
grant update (position, cle_vignette, largeur, hauteur, duree_s)
  on public.order_media to authenticated;

/*
 * RÉORDONNANCEMENT EN UNE SEULE ÉCRITURE.
 *
 * `p_ids` porte l'ordre voulu ; la position de chaque média devient son rang
 * dans ce tableau. L'unicité différée rend l'état intermédiaire acceptable, et
 * la transaction fait que l'écran ne peut jamais observer un ordre à moitié posé.
 *
 * Elle REFUSE un tableau qui ne décrit pas exactement les médias de la commande.
 * Sans ce contrôle, un tableau partiel laisserait des lignes à leur ancienne
 * position et produirait des doublons ; un tableau contenant l'identifiant d'un
 * média d'un autre vendeur le déplacerait.
 */
create function public.reordonner_medias(p_order_id uuid, p_ids uuid[])
  returns int
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_attendus int;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL022';
  end if;

  -- `security definer` a mis la RLS de côté : l'appartenance se vérifie ici.
  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'DL023';
  end if;

  select count(*) into v_attendus from public.order_media where order_id = p_order_id;

  if v_attendus <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'La liste ne décrit pas tous les médias de la commande.'
      using errcode = 'DL024';
  end if;

  -- Chaque identifiant doit appartenir à CETTE commande. Un identifiant étranger
  -- ferait échouer la mise à jour en silence, en laissant l'ordre à moitié posé.
  if exists (
    select 1 from unnest(p_ids) as demande(id)
    where not exists (
      select 1 from public.order_media m
      where m.id = demande.id and m.order_id = p_order_id
    )
  ) then
    raise exception 'Média étranger à la commande.' using errcode = 'DL025';
  end if;

  update public.order_media m
  set position = rang.ordinalite - 1
  from unnest(p_ids) with ordinality as rang(id, ordinalite)
  where m.id = rang.id and m.order_id = p_order_id;

  return v_attendus;
end;
$$;

revoke execute on function public.reordonner_medias(uuid, uuid[]) from public, anon;
grant execute on function public.reordonner_medias(uuid, uuid[]) to authenticated;

revoke execute on function public.verifier_plafonds_media() from public, anon;
