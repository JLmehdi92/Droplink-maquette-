-- 166 — L'ADMINISTRATION BLOQUE UN LIEN, SANS VOIR LA COMMANDE.
--
-- Décision de Wassim, 19/09/2026 : l'administrateur ne voit ni le client, ni les
-- photos, ni le lien d'une commande (décision 9, migrations 159-160), « mais je dois
-- pouvoir garder un contrôle sur chaque commande créée même si je ne les vois pas […]
-- être capable de bloquer le lien de la commande si y'a une galère ».
--
-- CE QUE LE BLOCAGE EST, ET CE QU'IL N'EST PAS :
--   1. Il coupe la page publique d'UNE commande, et d'elle seule : la suspension de
--      compte (043) coupait déjà toutes les commandes d'un vendeur, rien ne visait une
--      commande isolée.
--   2. Il est RÉVERSIBLE et ne touche JAMAIS le public_token (contrainte 5). Débloquer
--      rétablit la page sur le MÊME lien, celui que le client a déjà reçu. Ce n'est pas
--      « révoquer et régénérer », geste du vendeur qui CHANGE le jeton (007, 025).
--   3. Le client voit la page neutre « Ce lien n'est plus valable », la même que pour un
--      jeton inconnu, révoqué, ou un compte suspendu : distinguer les causes dirait à
--      qui teste des jetons lesquels ont existé.
--   4. Le motif est obligatoire et vit dans le journal d'audit, écrit AVANT la mutation
--      dans la même transaction — le patron de suspendre_compte (043).
--
-- LES SIX FONCTIONS QUI ACCEPTENT UN JETON le vérifient toutes : les quatre lectures, mais
-- aussi arbitrer_qc (un client ne valide pas les photos d'une commande bloquée) et
-- enregistrer_vue (une page coupée ne compte pas de vue). Elles sont recopiées de leur
-- dernière migration, signature et retour inchangés : create or replace garde leurs
-- droits d'exécution (054) et leurs commentaires.

-- ── 1. La colonne ───────────────────────────────────────────────────────────────
-- Un horodatage, comme archived_at : « depuis quand » sert au diagnostic, un booléen
-- l'aurait perdu. AUCUN droit d'écriture n'est accordé : UPDATE et INSERT sur orders
-- sont accordés COLONNE PAR COLONNE (006, 056, 059), et celle-ci n'y figure pas — un
-- vendeur ne peut pas se débloquer. tests/rls/blocage-lien.test.ts l'éprouve par l'effet.
alter table public.orders add column admin_blocked_at timestamptz;

comment on column public.orders.admin_blocked_at is
  'Lien public bloqué par l''administration depuis cette date (null : lien actif). Réversible, ne touche jamais public_token.';

-- ── 2. Bloquer ──────────────────────────────────────────────────────────────────
create function public.bloquer_lien_commande(
  p_commande uuid,
  p_motif    text,
  p_ip_hash  text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id     uuid;
  v_motif        text := nullif(btrim(coalesce(p_motif, '')), '');
  v_proprietaire uuid;
  v_bloque_le    timestamptz;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_motif is null then
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  -- FOR UPDATE : deux blocages simultanés de la même commande écriraient deux entrées
  -- d'audit pour un seul geste ; le second attend, puis voit la commande déjà bloquée.
  select s.owner_id, o.admin_blocked_at into v_proprietaire, v_bloque_le
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = p_commande
  for update of o;

  if v_proprietaire is null then
    -- Même sortie qu'un refus d'autorisation : distinguer permettrait d'énumérer.
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_bloque_le is not null then
    -- Refus MÉTIER, non réessayable : bloquer deux fois écrirait un second motif sur
    -- un geste qui n'a rien changé.
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.blocage_lien', 'orders', p_commande::text, v_proprietaire, p_ip_hash,
    jsonb_build_object('motif', v_motif)
  );

  update public.orders set admin_blocked_at = now() where id = p_commande;

  return true;
end;
$$;

comment on function public.bloquer_lien_commande(uuid, text, text) is
  'Bloque le lien public d''une commande. Motif obligatoire, tracé ; le jeton ne change pas.';

revoke all on function public.bloquer_lien_commande(uuid, text, text) from public;
grant execute on function public.bloquer_lien_commande(uuid, text, text) to authenticated;

-- ── 3. Débloquer — sur le MÊME lien ─────────────────────────────────────────────
create function public.debloquer_lien_commande(
  p_commande uuid,
  p_motif    text,
  p_ip_hash  text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id     uuid;
  v_motif        text := nullif(btrim(coalesce(p_motif, '')), '');
  v_proprietaire uuid;
  v_bloque_le    timestamptz;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_motif is null then
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  select s.owner_id, o.admin_blocked_at into v_proprietaire, v_bloque_le
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = p_commande
  for update of o;

  if v_proprietaire is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_bloque_le is null then
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.deblocage_lien', 'orders', p_commande::text, v_proprietaire, p_ip_hash,
    jsonb_build_object('motif', v_motif, 'bloque_depuis', v_bloque_le)
  );

  update public.orders set admin_blocked_at = null where id = p_commande;

  return true;
end;
$$;

comment on function public.debloquer_lien_commande(uuid, text, text) is
  'Débloque le lien public d''une commande. La page revient sur le MÊME lien.';

revoke all on function public.debloquer_lien_commande(uuid, text, text) from public;
grant execute on function public.debloquer_lien_commande(uuid, text, text) to authenticated;

-- ── 4. Lesquelles de ces commandes sont bloquées ─────────────────────────────────
-- Pour la liste de l'administration : elle rend DÉJÀ une page de commandes (160) et
-- n'a besoin que de savoir lesquelles portent un blocage. Une fonction à part plutôt
-- qu'une colonne de plus dans lister_commandes_admin : changer son retour imposerait un
-- drop et une recopie de sa centaine de lignes, pour un seul booléen. Elle ne rend que
-- des identifiants que l'appelant a déjà, donc n'écrit rien au journal ; bornée à 200.
create function public.liens_bloques_parmi(p_commandes uuid[])
  returns setof uuid
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if coalesce(array_length(p_commandes, 1), 0) > 200 then
    raise exception 'trop de commandes' using errcode = 'DL058';
  end if;

  return query
    select o.id
    from public.orders o
    where o.id = any (p_commandes)
      and o.admin_blocked_at is not null;
end;
$$;

comment on function public.liens_bloques_parmi(uuid[]) is
  'Pour l''administration : parmi ces commandes, celles dont le lien est bloqué.';

revoke all on function public.liens_bloques_parmi(uuid[]) from public;
grant execute on function public.liens_bloques_parmi(uuid[]) to authenticated;

-- ── 5. Les six fonctions qui acceptent un jeton ──────────────────────────────────
-- lire_commande_publique — recopiée de 153_la_page_client_ne_connaissait_pas_sa_reference.sql, filtre de blocage ajouté.
create or replace function public.lire_commande_publique(p_jeton text)
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
    and o.admin_blocked_at is null
    and p.status = 'active'
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.lire_commande_publique(text) from public;
grant execute on function public.lire_commande_publique(text) to anon;

-- lire_medias_publics — recopiée de 097_la_couverture_a_sa_propre_derivee.sql, filtre de blocage ajouté.
create or replace function public.lire_medias_publics(p_jeton text)
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
    and o.admin_blocked_at is null
    and p.status = 'active'
  order by m.position asc
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.lire_medias_publics(text) from public;
grant execute on function public.lire_medias_publics(text) to anon, authenticated;

-- lire_suivi_public — recopiée de 034_suivi_public.sql, filtre de blocage ajouté.
create or replace function public.lire_suivi_public(p_jeton text)
  returns table (
    etape public.parcel_status,
    numero text,
    premier_mouvement timestamptz,
    dernier_mouvement timestamptz,
    estimation_du timestamptz,
    estimation_au timestamptz,
    abandonne boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    tp.normalized_status,
    tp.tracking_number,
    tp.first_movement_at,
    tp.last_movement_at,
    tp.estimated_from,
    tp.estimated_to,
    tp.abandoned_at is not null
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles pr on pr.id = s.owner_id
  join public.order_parcels op on op.order_id = o.id
  join public.tracked_parcels tp on tp.id = op.parcel_id
  where o.public_token = p_jeton
    and o.admin_blocked_at is null
    and pr.status = 'active'
  -- Une commande n'a qu'un colis aujourd'hui ; la limite dit que l'écran n'en
  -- affichera qu'un même le jour où le modèle en autorisera deux, plutôt que
  -- d'en empiler silencieusement.
  limit 1
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.lire_suivi_public(text) from public;
grant execute on function public.lire_suivi_public(text) to anon, authenticated;

-- lire_passages_publics — recopiée de 034_suivi_public.sql, filtre de blocage ajouté.
create or replace function public.lire_passages_publics(p_jeton text)
  returns table (
    occurred_at timestamptz,
    location text,
    description text,
    stage text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select pc.occurred_at, pc.location, pc.description, pc.stage
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles pr on pr.id = s.owner_id
  join public.order_parcels op on op.order_id = o.id
  join public.parcel_checkpoints pc on pc.parcel_id = op.parcel_id
  where o.public_token = p_jeton
    and o.admin_blocked_at is null
    and pr.status = 'active'
  order by pc.occurred_at desc
  limit 30
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.lire_passages_publics(text) from public;
grant execute on function public.lire_passages_publics(text) to anon, authenticated;

-- arbitrer_qc — recopiée de 135_le_commentaire_du_client_perdait_sa_decision.sql, filtre de blocage ajouté.
create or replace function public.arbitrer_qc(
  p_jeton text,
  p_decision text,
  p_commentaire text
)
  returns public.qc_status
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_statut public.qc_status;
  v_ancien public.qc_status;
  v_commentaire text;
  v_aujourdhui integer;
begin
  -- La valeur d'énumération est vérifiée AVANT d'être employée : une valeur
  -- citée mais absente ferait échouer l'écriture, et la transaction étant
  -- partagée, annulerait la mutation entière.
  if p_decision not in ('approuve', 'refuse') then
    raise exception 'décision inconnue : %', p_decision using errcode = '22023';
  end if;

  select o.id, o.qc_status into v_order, v_ancien
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and o.admin_blocked_at is null
    and p.status = 'active';

  if v_order is null then
    return null;
  end if;

  /*
   * ASSAINI PUIS TRONQUÉ, EN BASE, ET DANS CET ORDRE.
   *
   * Tronquer d'abord ne suffisait pas : mille caractères tronqués peuvent
   * rendre six mille caractères de JSON. C'est le retrait des caractères non
   * imprimables qui borne le RENDU, et la troncature qui borne la longueur
   * lisible. Les deux, parce qu'elles ne bornent pas la même chose.
   *
   * `[:print:]` couvre l'Unicode imprimable en UTF-8 — les accents, les emoji
   * et les alphabets non latins passent. Le saut de ligne et la tabulation sont
   * exemptés nommément : ce sont les deux seuls caractères de contrôle qu'un
   * client tape volontairement.
   */
  v_commentaire := left(
    regexp_replace(
      coalesce(nullif(btrim(p_commentaire), ''), ''),
      '[^\n\t[:print:]]', '', 'g'
    ),
    1000
  );

  v_statut := p_decision::public.qc_status;

  -- LA DÉCLARATION D'AUTEUR EST DITE, PAS DEVINÉE (migration 121), ET
  -- L'ÉCRITURE EST DÉCLARÉE HORS-VENDEUR (migration 120) : les deux marqueurs
  -- sont locaux à la transaction et remis à vide juste après.
  perform set_config('droplink.arbitrage_du_client', 'oui', true);
  perform set_config('droplink.ecriture_hors_vendeur', 'oui', true);

  update public.orders
     set qc_status = v_statut,
         qc_decide_par = 'client'
   where id = v_order;

  perform set_config('droplink.arbitrage_du_client', '', true);
  perform set_config('droplink.ecriture_hors_vendeur', '', true);

  -- ── LE JOURNAL N'ENREGISTRE QUE CE QUI DIT QUELQUE CHOSE ──────────────────
  if v_ancien is distinct from v_statut then
    select count(*) into v_aujourdhui
    from public.order_events e
    where e.order_id = v_order
      and e.type in ('qc_approuve', 'qc_refuse')
      and e.occurred_at >= date_trunc('day', now());

    if v_aujourdhui < 200 then
      perform public.journaliser(
        v_order,
        case when v_statut = 'approuve' then 'qc_approuve' else 'qc_refuse' end,
        'client',
        case
          when v_commentaire = '' then '{}'::jsonb
          else jsonb_build_object('commentaire', v_commentaire)
        end
      );
    end if;
  end if;

  return v_statut;
end;
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.arbitrer_qc(text, text, text) from public;
grant execute on function public.arbitrer_qc(text, text, text) to anon, authenticated;

-- enregistrer_vue — recopiée de 076_une_vue_exige_une_empreinte_reelle.sql, filtre de blocage ajouté.
create or replace function public.enregistrer_vue(
  p_jeton text,
  p_ip_hash text,
  p_ua_hash text,
  p_pays text,
  p_profil text
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_proprietaire uuid;
  v_insere uuid;
begin
  -- AVANT TOUTE LECTURE. Une empreinte hors format ne devient pas valable parce
  -- que le jeton, lui, existe.
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{32}$'
     or coalesce(p_ua_hash, '') !~ '^[0-9a-f]{32}$' then
    return false;
  end if;

  select o.id, p.id
    into v_order, v_proprietaire
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and o.admin_blocked_at is null
    and p.status = 'active';

  if v_order is null then
    return false;
  end if;

  -- LE VENDEUR QUI OUVRE SA PROPRE PAGE EST EXCLU. Il vérifie son travail, il ne
  -- consulte pas. Décidé ici et pas dans la route : une exclusion écrite dans un
  -- appelant est une exclusion que le prochain appelant n'aura pas.
  if nullif(p_profil, '') is not null and nullif(p_profil, '')::uuid = v_proprietaire then
    return false;
  end if;

  insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
  values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
  on conflict (order_id, ip_hash, user_agent_hash, viewed_on) do nothing
  returning id into v_insere;

  return v_insere is not null;
end;
$$;

-- Les droits qu'elle porte (inchangés), redits ici pour qu'une réparation du falsificateur
-- découpée dans ce fichier les rétablisse aussi après un `drop`.
revoke all on function public.enregistrer_vue(text, text, text, text, text) from public, anon, authenticated;
