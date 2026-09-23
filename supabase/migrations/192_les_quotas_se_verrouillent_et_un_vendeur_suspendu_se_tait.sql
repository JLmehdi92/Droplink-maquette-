-- 192 — LES QUOTAS SE VERROUILLENT, UN VENDEUR SUSPENDU SE TAIT, UN NOM PRIS
--       EN MÊME TEMPS SE DIT PRIS.
--
-- Trois défauts relevés par la revue ECC du 23/09/2026, tous de la même
-- famille : une règle écrite juste, qui cède quand deux choses arrivent en
-- même temps, ou qui oublie un état que les autres chemins respectent.
--
-- ── 1. LA COURSE SUR LES QUOTAS ─────────────────────────────────────────────
-- `verifier_plafond_commandes` (176) et `verifier_plafond_colis` (181) COMPTENT
-- puis laissent passer. Deux insertions simultanées comptent chacune 14, voient
-- chacune « sous 15 », et passent toutes les deux : le quota à vie devient
-- 16, 17… autant que de requêtes parallèles. Pour les colis, c'est pire : chaque
-- ligne de trop est une prise en charge PAYANTE sur un palier COMMUN à tous les
-- comptes.
--
-- Remède : un verrou consultatif de TRANSACTION par boutique, pris AVANT le
-- comptage. La seconde insertion attend que la première soit validée, et son
-- `count(*)` — nouvel instantané à chaque requête en READ COMMITTED — la voit.
-- Deux clés distinctes (commandes, colis) : créer une commande n'attend pas
-- l'attache d'un colis. Le verrou est par boutique : deux vendeurs ne
-- s'attendent jamais.
--
-- ── 2. UN VENDEUR SUSPENDU CONTINUAIT D'ÉCRIRE À SES CLIENTS ────────────────
-- `lire_commande_publique` (166) refuse la page d'un vendeur suspendu. Les
-- fonctions des e-mails de suivi (188, 190) ne le vérifiaient pas : la page
-- rendait 404, mais le client continuait de recevoir « votre colis est en
-- transit » avec un lien vers cette page morte, et pouvait même s'inscrire
-- depuis un onglet resté ouvert. La désinscription, elle, reste TOUJOURS
-- possible : se désinscrire ne doit jamais dépendre de l'état du vendeur.
--
-- ── 3. UN NOM DE LIEN PRIS EN MÊME TEMPS ────────────────────────────────────
-- `definir_slug_boutique` (182) vérifie la disponibilité, puis insère avec
-- `on conflict do nothing`, puis écrit `shops.slug` sans regarder si l'insertion
-- a eu lieu. Deux vendeurs qui prennent le même nom au même instant : le second
-- ne réserve rien et échoue sur l'unicité de `shops.slug` — une erreur 23505
-- générique, que l'écran affiche comme une panne au lieu de « ce nom est déjà
-- pris ». Rien n'est corrompu (l'unicité tient), mais le message ment.
--
-- Signatures et types de retour inchangés : `create or replace` est sûr ici, et
-- les droits sont redits pour qu'une réparation du falsificateur découpée dans
-- ce fichier les rétablisse aussi.

-- ── 1a. Quota de commandes ──────────────────────────────────────────────────
create or replace function public.verifier_plafond_commandes()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_plan public.account_plan;
  v_compte integer;
  v_plafond integer;
begin
  -- ⚠️ LE VERROU AVANT LE COMPTAGE. Sans lui, deux insertions simultanées
  -- comptent le même total et passent toutes les deux (192).
  perform pg_advisory_xact_lock(hashtextextended('plafond-commandes:' || new.shop_id::text, 0));

  -- LE PLAN SE LIT PAR LA BOUTIQUE, jamais par l'appelant : une commande est
  -- créée pour un `shop_id`, et c'est le propriétaire de CETTE boutique dont le
  -- plan décide.
  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  -- Boutique introuvable : ce n'est pas à ce déclencheur de le dire. La clé
  -- étrangère refusera l'insertion avec un message qui nomme la vraie cause.
  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE : tout l'historique de la boutique, sans borne de date. Un plafond
    -- mensuel se contourne en attendant ; celui-ci se contourne en recréant un
    -- compte, ce qui laisse une trace que l'administration voit (170-171).
    select count(*) into v_compte
    from public.orders
    where shop_id = new.shop_id;

    v_plafond := public.lire_plafond_gratuit_a_vie();

    if v_compte >= v_plafond then
      -- LE MESSAGE PORTE LES DEUX NOMBRES ET LA NATURE DU QUOTA. Sans « à vie »,
      -- le vendeur attendrait le mois suivant — indéfiniment.
      raise exception
        'Quota du compte gratuit atteint : % commandes sur % au total. Ce quota est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL067';
    end if;

    return new;
  end if;

  -- Compte `pro` : le plafond MENSUEL d'avant, inchangé — un abonnement se
  -- renouvelle, donc un quota à vie en ferait un achat unique.
  select count(*) into v_compte
  from public.orders
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL035';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_commandes() is
  'Refuse la création d''une commande au-delà du quota du compte : À VIE en gratuit, MENSUEL en pro. Un verrou consultatif par boutique, pris avant le comptage, empêche deux insertions simultanées de passer toutes les deux (192).';

-- ── 1b. Quota de colis ──────────────────────────────────────────────────────
create or replace function public.verifier_plafond_colis()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_plan    public.account_plan;
  v_compte  integer;
  v_plafond integer;
begin
  -- ⚠️ LE VERROU AVANT LE COMPTAGE (192). Chaque ligne de trop est une prise en
  -- charge payante, sur un palier commun à tous les comptes.
  perform pg_advisory_xact_lock(hashtextextended('plafond-colis:' || new.shop_id::text, 0));

  -- Le plan se lit par la BOUTIQUE, comme pour les commandes : un colis est
  -- créé pour un `shop_id`, et c'est le plan de son propriétaire qui décide.
  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  -- Boutique introuvable : ce n'est pas à ce déclencheur de le dire, la clé
  -- étrangère refusera avec un message qui nomme la vraie cause.
  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE, exactement comme son quota de commandes. Un plafond mensuel sur un
    -- compte dont le quota est à vie se contournerait en attendant le 1er du
    -- mois — et ce qu'on borne ici est une dépense qui, elle, ne se recharge pas.
    select count(*) into v_compte
    from public.tracked_parcels
    where shop_id = new.shop_id;

    -- Le facteur 2 est celui de la 125, et il garde sa raison : UNE correction
    -- de numéro de suivi sur CHAQUE commande.
    v_plafond := public.lire_plafond_gratuit_a_vie() * 2;

    if v_compte >= v_plafond then
      raise exception
        'Plafond de colis du compte gratuit atteint (% sur % au total). Ce plafond est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL070';
    end if;

    return new;
  end if;

  -- ── Compte `pro` : le plafond MENSUEL d'avant, inchangé ───────────────────
  select count(*) into v_compte
  from public.tracked_parcels
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  v_plafond := public.lire_plafond_commandes() * 2;

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL051';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà de deux fois le quota de commandes du compte, ET LE QUOTA DÉPEND DU PLAN. Gratuit : deux fois le quota À VIE (30 par défaut). Pro : deux fois le plafond mensuel. Le facteur 2 laisse UNE correction de numéro de suivi par commande. Un verrou consultatif par boutique, pris avant le comptage, empêche deux attaches simultanées de dépasser le plafond (192) — chaque ligne de trop serait une prise en charge payante sur un palier commun à tous les comptes.';

-- ── 2a. Le client demande à être prévenu ────────────────────────────────────
create or replace function public.demander_notification(p_jeton_public text, p_email text, p_token_hash text)
  returns table (langue text, nom_boutique text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_langue text;
  v_nom text;
  v_recentes integer;
begin
  -- ⚠️ LE MÊME FILTRE QUE LA PAGE (166) : un vendeur suspendu n'a plus de page,
  -- donc rien à suivre. Le vide est le même que pour un lien inconnu — pas
  -- d'oracle sur l'état du compte.
  select o.id, s.default_language::text, s.name
    into v_order, v_langue, v_nom
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton_public
    and o.archived_at is null
    and o.admin_blocked_at is null
    and p.status = 'active';

  if v_order is null then
    return;
  end if;

  -- TROIS DEMANDES PAR HEURE ET PAR COMMANDE. Au-delà, la page d'un client ne
  -- sert pas à inonder une boîte de liens de confirmation.
  select count(*) into v_recentes
  from public.notification_requests r
  where r.order_id = v_order and r.created_at > now() - interval '1 hour';
  if v_recentes >= 3 then
    raise exception 'trop de demandes pour cette commande' using errcode = 'DL074';
  end if;

  insert into public.notification_requests (order_id, email, token_hash)
  values (v_order, lower(trim(p_email)), p_token_hash);

  return query select v_langue, v_nom;
end;
$$;
revoke all on function public.demander_notification(text, text, text) from public, anon, authenticated;
grant execute on function public.demander_notification(text, text, text) to service_role;

-- ── 2b. Le client confirme depuis sa boîte ──────────────────────────────────
create or replace function public.confirmer_notification(p_token_hash text)
  returns table (langue text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_email text;
  v_etape public.order_status;
  v_langue text;
begin
  -- Vendeur suspendu : la demande n'est ni consommée ni effacée. Si le compte
  -- est rétabli avant son expiration, le même lien confirme normalement.
  select r.order_id, r.email into v_order, v_email
  from public.notification_requests r
  join public.orders o on o.id = r.order_id
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where r.token_hash = p_token_hash
    and r.expires_at > now()
    and p.status = 'active';

  if v_order is null then
    return;
  end if;

  update public.orders set notify_email = v_email where id = v_order
  returning status into v_etape;

  delete from public.notification_requests where order_id = v_order;

  insert into public.notifications_sent (order_id, etape)
  values (v_order, v_etape)
  on conflict do nothing;

  select s.default_language::text into v_langue
  from public.orders o join public.shops s on s.id = o.shop_id
  where o.id = v_order;

  return query select v_langue;
end;
$$;
revoke all on function public.confirmer_notification(text) from public, anon, authenticated;
grant execute on function public.confirmer_notification(text) to service_role;

-- ── 2c. Ce qu'il reste à envoyer ────────────────────────────────────────────
-- Un vendeur suspendu n'envoie rien : l'e-mail mènerait à une page qui rend 404.
-- Les étapes franchies pendant la suspension ne sont PAS marquées envoyées : au
-- rétablissement, le client reçoit l'étape COURANTE, pas un arriéré.
create or replace function public.notifications_a_envoyer(p_limite integer)
  returns table (
    order_id uuid,
    etape public.order_status,
    email text,
    jeton_public text,
    jeton_desinscription text,
    langue text,
    nom_boutique text,
    nom_de_lien text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.id, o.status, o.notify_email, o.public_token, o.unsubscribe_token,
         s.default_language::text, s.name, s.slug
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.notify_email is not null
    and o.status in ('expedie', 'en_transit', 'livre')
    and o.archived_at is null
    and o.admin_blocked_at is null
    and p.status = 'active'
    and not exists (
      select 1 from public.notifications_sent n
      where n.order_id = o.id and n.etape = o.status
    )
  order by o.updated_at
  limit greatest(1, least(coalesce(p_limite, 50), 200))
$$;
revoke all on function public.notifications_a_envoyer(integer) from public, anon, authenticated;
grant execute on function public.notifications_a_envoyer(integer) to service_role;

-- ── 3. Poser son nom de lien — la course se dit « déjà pris » ───────────────
create or replace function public.definir_slug_boutique(p_slug text)
  returns text
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_shop     uuid;
  v_plan     public.account_plan;
  v_slug     text := lower(btrim(coalesce(p_slug, '')));
  v_ancien   text;
  v_pris_par uuid;
begin
  select s.id, p.plan, s.slug into v_shop, v_plan, v_ancien
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where p.user_id = (select auth.uid());

  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  -- LE PLAN DÉCIDE, ET C'EST LA SEULE RAISON D'ÊTRE DE CETTE GARDE.
  if v_plan <> 'pro' then
    raise exception 'reserve au plan pro' using errcode = 'DL059';
  end if;

  if not public.slug_valide(v_slug) then
    raise exception 'nom de lien invalide' using errcode = 'DL071';
  end if;

  -- Déjà le sien : rien à faire, et surtout pas une erreur.
  if v_ancien is not distinct from v_slug then
    return v_slug;
  end if;

  -- ⚠️ PRIS PAR QUELQU'UN D'AUTRE, Y COMPRIS DANS SON PASSÉ.
  select sl.shop_id into v_pris_par
  from public.shop_slugs sl
  where sl.slug = v_slug;

  if v_pris_par is not null and v_pris_par <> v_shop then
    raise exception 'nom de lien deja pris' using errcode = 'DL072';
  end if;

  -- L'historique d'abord : si l'écriture suivante échouait, mieux vaut un nom
  -- réservé sans être affiché qu'un nom affiché que rien ne résout.
  insert into public.shop_slugs (shop_id, slug)
  values (v_shop, v_slug)
  on conflict (slug) do nothing;

  -- ⚠️ L'INSERTION N'A RIEN FAIT : quelqu'un a réservé ce nom entre la lecture
  -- ci-dessus et cette ligne (`on conflict` attend sa validation). Si ce n'est
  -- pas NOUS — un de nos anciens noms repris est un conflit légitime —, c'est
  -- « déjà pris », pas une erreur d'unicité que l'écran lirait comme une panne.
  if not found then
    select sl.shop_id into v_pris_par
    from public.shop_slugs sl
    where sl.slug = v_slug;

    if v_pris_par is distinct from v_shop then
      raise exception 'nom de lien deja pris' using errcode = 'DL072';
    end if;
  end if;

  update public.shops set slug = v_slug where id = v_shop;

  return v_slug;
end;
$$;

revoke execute on function public.definir_slug_boutique(text) from public, anon;
grant execute on function public.definir_slug_boutique(text) to authenticated;
