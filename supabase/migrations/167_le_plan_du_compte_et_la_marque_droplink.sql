-- 167 — LE PLAN D'UN COMPTE, ET LA MARQUE DROPLINK SUR LA PAGE CLIENT.
--
-- Décisions de Wassim, 19/09/2026 :
--   · en gratuit, la page client porte la carte « Propulsé par DropLink » du kit ; en Pro, un
--     interrupteur de « Ma marque » la retire ;
--   · « quand le client paye il est pro […] c'est à moi de mettre les gens pro […] dans les
--     panels admin » : AUCUN PAIEMENT ne passe par le produit (contrainte n° 1). Le plan est
--     posé à la main par l'administration, motif à l'appui, et tracé ;
--   · « mets-moi pro » : les comptes administrateurs démarrent en Pro (voir § 1). Rien de
--     nominatif ici : le dépôt est public.
--
-- Ce que cette migration ne fait PAS : aucune table d'abonnement, aucune échéance, aucun
-- montant. Un plan est un état du compte, pas une facture.

-- ── 1. Le plan ──────────────────────────────────────────────────────────────────
-- Une énumération plutôt qu'un booléen : un troisième palier (« volume », proposé par la grille
-- tarifaire du 19/09) s'ajoutera par un `alter type … add value`, seul dans sa migration.
create type public.account_plan as enum ('gratuit', 'pro');

-- Écrit par PERSONNE d'autre que `definir_plan_compte` : aucun droit de colonne n'est accordé
-- (comme `role` et `status`, migration 001) — un vendeur ne se passe pas Pro lui-même.
alter table public.profiles add column plan public.account_plan not null default 'gratuit';

comment on column public.profiles.plan is
  'Plan du compte. Posé par l''administration (definir_plan_compte), jamais par le vendeur ; aucun paiement ne passe par le produit.';

update public.profiles set plan = 'pro' where role = 'admin';

-- ── 2. L'interrupteur du vendeur, réservé au Pro ─────────────────────────────────
alter table public.shops add column hide_droplink_brand boolean not null default false;

comment on column public.shops.hide_droplink_brand is
  'Le vendeur demande à retirer la marque DropLink de ses pages client. Sans effet hors plan Pro (lire_commande_publique).';

grant update (hide_droplink_brand) on public.shops to authenticated;

-- LA RÈGLE VIT EN BASE, PAS DANS LE FORMULAIRE. L'écriture passe par la session du vendeur (droit
-- de colonne ci-dessus) : une Server Action forgée, ou un appel PostgREST direct, contournerait
-- un contrôle écrit seulement dans l'écran. Lever l'interrupteur exige un compte Pro ; le baisser
-- est toujours permis.
create function public.marque_droplink_reservee_au_pro()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.hide_droplink_brand and not exists (
    select 1 from public.profiles p where p.id = new.owner_id and p.plan = 'pro'
  ) then
    raise exception 'reserve au plan pro' using errcode = 'DL059';
  end if;
  return new;
end;
$$;

revoke all on function public.marque_droplink_reservee_au_pro() from public;

create trigger shops_marque_droplink_reservee_au_pro
  before insert or update of hide_droplink_brand on public.shops
  for each row execute function public.marque_droplink_reservee_au_pro();

-- ── 3. Poser le plan — l'administration seule, tracée ────────────────────────────
create function public.definir_plan_compte(
  p_profil  uuid,
  p_plan    text,
  p_motif   text,
  p_ip_hash text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_motif    text := nullif(btrim(coalesce(p_motif, '')), '');
  v_plan     public.account_plan;
  v_avant    public.account_plan;
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

  -- Une valeur hors de l'énumération est une saisie invalide, pas une erreur de conversion.
  if p_plan is null or p_plan not in ('gratuit', 'pro') then
    raise exception 'plan inconnu' using errcode = 'DL060';
  end if;
  v_plan := p_plan::public.account_plan;

  select p.plan into v_avant from public.profiles p where p.id = p_profil for update;
  if v_avant is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_avant = v_plan then
    raise exception 'deja dans cet etat' using errcode = 'DL057';
  end if;

  perform public.journaliser_admin(
    'compte.plan', 'profiles', p_profil::text, p_profil, p_ip_hash,
    jsonb_build_object('motif', v_motif, 'plan', v_plan, 'avant', v_avant)
  );

  update public.profiles set plan = v_plan where id = p_profil;

  -- Repassé en gratuit, l'interrupteur retombe : un réglage que le compte ne peut plus tenir
  -- ne doit pas rester affiché comme levé dans « Ma marque ».
  if v_plan = 'gratuit' then
    update public.shops set hide_droplink_brand = false where owner_id = p_profil;
  end if;

  return true;
end;
$$;

comment on function public.definir_plan_compte(uuid, text, text, text) is
  'Pose le plan d''un compte (administration seule). Motif obligatoire, tracé en clair.';

revoke all on function public.definir_plan_compte(uuid, text, text, text) from public;
grant execute on function public.definir_plan_compte(uuid, text, text, text) to authenticated;

-- ── 4. Lire le plan d'un compte — pour la fiche de l'administration ──────────────
-- La fiche est déjà tracée par lire_compte_admin ; cette lecture ne rend qu'un mot de plus.
create function public.lire_plan_compte(p_profil uuid)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_plan public.account_plan;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;
  select p.plan into v_plan from public.profiles p where p.id = p_profil;
  return v_plan::text;
end;
$$;

revoke all on function public.lire_plan_compte(uuid) from public;
grant execute on function public.lire_plan_compte(uuid) to authenticated;

-- ── 5. La page client apprend si la marque est masquée ───────────────────────────
-- Une colonne de retour de plus, dans l'appel qu'elle fait déjà : pas d'aller-retour
-- supplémentaire sur la page la plus contrainte du produit. La liste de colonnes change, donc
-- drop + create (create or replace refuserait), droits et commentaire redits.
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
    reference_courte text,
    marque_masquee boolean
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
    '#' || upper(right(replace(o.id::text, '-', ''), 6)),
    -- LA MARQUE DROPLINK N'EST MASQUÉE QUE POUR UN COMPTE PRO QUI L'A DEMANDÉ. La base
    -- décide, la page affiche : un compte repassé en gratuit la retrouve à la requête
    -- suivante, même si son interrupteur est resté levé.
    (p.plan = 'pro' and s.hide_droplink_brand)
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and o.admin_blocked_at is null
    and p.status = 'active'
$$;

comment on function public.lire_commande_publique(text) is
  'Lecture publique par jeton : la commande, sa boutique, et si la marque DropLink est masquée (compte Pro qui l''a demandé).';

revoke all on function public.lire_commande_publique(text) from public;
grant execute on function public.lire_commande_publique(text) to anon;
