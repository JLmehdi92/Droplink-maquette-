-- 204 — LE LIEN DE PAIEMENT EST SIGNÉ, ET L'E-MAIL NE RATTACHE PLUS RIEN.
--
-- ── LE DÉFAUT, AUDIT ECC DU 27/09/2026 (sécurité, CRITIQUE) ─────────────────
-- Le webhook prouvait la PROVENANCE d'un événement (HMAC du corps brut), jamais
-- l'IDENTITÉ du payeur. Sans `custom_data.profil_id`, il rattachait par l'e-mail
-- saisi dans le formulaire du fournisseur — une adresse que personne ne prouve
-- posséder. Et `appliquer_abonnement` écrivait le plan sans vérifier que
-- l'événement venait de l'abonnement qui gouverne ce compte.
--
-- Qui connaissait l'e-mail d'un vendeur pouvait donc, par un abonnement (ou un
-- essai) qu'il contrôle puis résilie, POSER ou RETIRER le plan de ce vendeur —
-- jusqu'à rétrograder un vrai client Pro en gratuit, à répétition. Non
-- exploitable le jour de l'audit (fournisseur en mode test), mais c'est le code
-- qui gouvernera le passage en live.
--
-- ── LA DÉCISION, WASSIM, 27/09/2026 : SOLUTION A ─────────────────────────────
--   1. Le lien de paiement porte `profil_id` ET sa SIGNATURE HMAC. Le secret vit
--      ici, aléatoire par environnement, jamais dans le dépôt (même patron que
--      l'appareil fiable, 203). Seul le vendeur connecté obtient la signature
--      de SON identifiant : modifier le lien pour viser un autre compte ne
--      produit qu'une signature fausse.
--   2. Le webhook ne croit l'identifiant que signé. Un événement ultérieur sans
--      signature valide garde le compte auquel son abonnement a été rattaché à
--      la création — jamais un compte deviné par e-mail. Le filet e-mail
--      DISPARAÎT.
--   3. `appliquer_abonnement` refuse de RÉ-ATTACHER un abonnement existant à un
--      autre compte : l'appelant le consigne et alerte, rien n'est écrasé.
--   4. Le plan est celui de L'ENSEMBLE des abonnements du compte (revue sécurité
--      du même jour) : une signature de lien qui fuiterait ne permettrait plus que
--      d'OFFRIR le Pro, jamais de le retirer à qui paie encore.

-- ── 0. Le secret de signature, aléatoire par environnement ──────────────────
create table public.config_lien_paiement (
  unique_row boolean primary key default true check (unique_row),
  secret bytea not null
);
alter table public.config_lien_paiement enable row level security;
alter table public.config_lien_paiement force row level security;
revoke all on public.config_lien_paiement from anon, authenticated;
insert into public.config_lien_paiement (secret) values (extensions.gen_random_bytes(32));

comment on table public.config_lien_paiement is
  'Le secret HMAC des liens de paiement (204), aléatoire par environnement, jamais dans le dépôt. Aucune policy : lu par les seules fonctions security definer.';

-- ── 1. Signer le lien — pour l'appelant, et lui seul ─────────────────────────
-- Le préfixe « lien-paiement: » sépare ce domaine de toute autre signature : une
-- signature produite ici ne vaut rien ailleurs, et réciproquement.
--
-- ⚠️ ON SIGNE L'IDENTIFIANT DE PROFIL, PAS CELUI D'AUTHENTIFICATION. `profiles.id`
-- est un uuid PROPRE (001), distinct de `auth.uid()` (= `profiles.user_id`) ; le
-- lien porte `profiles.id`, et `appliquer_abonnement` l'attend. La première
-- écriture de cette fonction signait `auth.uid()` : chaque vrai paiement aurait
-- été jugé « signature fausse », encaissé et sans effet. Attrapé à la relecture
-- du schéma, avant tout test — le test en base éprouve désormais la paire réelle.
create function public.signer_lien_paiement()
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select p.id into v_profil from public.profiles p where p.user_id = (select auth.uid());
  if v_profil is null then
    raise exception 'non authentifie' using errcode = '42501';
  end if;
  return encode(
    extensions.hmac(
      convert_to('lien-paiement:' || v_profil::text, 'utf8'),
      (select secret from public.config_lien_paiement),
      'sha256'
    ),
    'hex'
  );
end;
$$;

revoke all on function public.signer_lien_paiement() from public, anon;
grant execute on function public.signer_lien_paiement() to authenticated;

comment on function public.signer_lien_paiement() is
  'Signe l''identifiant de l''APPELANT pour son lien de paiement (204). Aucun argument : on ne peut obtenir que la signature de son propre compte.';

-- ── 2. Vérifier une signature — le webhook seul (service_role) ──────────────
-- Comparaison à TEMPS CONSTANT (repli OR sur les octets), comme en 203.
create function public.verifier_lien_paiement(p_profil uuid, p_signature text)
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_attendue bytea;
  v_fournie  bytea;
  v_diff     int := 0;
  i          int;
begin
  if p_profil is null or p_signature is null then
    return false;
  end if;
  v_attendue := extensions.hmac(
    convert_to('lien-paiement:' || p_profil::text, 'utf8'),
    (select secret from public.config_lien_paiement),
    'sha256'
  );
  v_fournie := decode(p_signature, 'hex');
  if octet_length(v_fournie) <> octet_length(v_attendue) then
    return false;
  end if;
  for i in 0 .. octet_length(v_attendue) - 1 loop
    v_diff := v_diff | (get_byte(v_attendue, i) # get_byte(v_fournie, i));
  end loop;
  return v_diff = 0;
exception
  when others then
    -- Une signature qui n'est pas de l'hexadécimal est un refus, jamais une
    -- erreur qui ferait rejouer le webhook indéfiniment.
    return false;
end;
$$;

revoke all on function public.verifier_lien_paiement(uuid, text) from public, anon, authenticated;
grant execute on function public.verifier_lien_paiement(uuid, text) to service_role;

comment on function public.verifier_lien_paiement(uuid, text) is
  'Vérifie la signature d''un lien de paiement (204). Réservée au webhook (service_role) ; comparaison à temps constant.';

-- ── 3. appliquer_abonnement : jamais de ré-attachement silencieux ───────────
-- Même signature que la 179 : `create or replace` remplace le corps et garde
-- les droits. Seul ajout : le contrôle du propriétaire existant.
create or replace function public.appliquer_abonnement(
  p_provider        text,
  p_subscription_id text,
  p_profil          uuid,
  p_statut          text,
  p_renews_at       timestamptz,
  p_ends_at         timestamptz
)
  returns public.account_plan
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_plan         public.account_plan;
  v_avant        public.account_plan;
  v_proprietaire uuid;
begin
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'fournisseur manquant' using errcode = 'DL068';
  end if;
  if p_subscription_id is null or btrim(p_subscription_id) = '' then
    raise exception 'abonnement sans identifiant' using errcode = 'DL069';
  end if;

  select p.plan into v_avant from public.profiles p where p.id = p_profil for update;
  if v_avant is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- ⚠️ UN ABONNEMENT NE CHANGE PAS DE COMPTE (204). Rattaché à sa création, il le
  -- reste : un événement qui le désignerait pour un autre compte est une anomalie
  -- — lien trafiqué, rejeu détourné — et l'écraser la rendrait invisible.
  select s.profile_id into v_proprietaire
    from public.subscriptions s
   where s.provider = p_provider
     and s.provider_subscription_id = p_subscription_id;
  if v_proprietaire is not null and v_proprietaire <> p_profil then
    raise exception 'abonnement rattache a un autre compte' using errcode = 'DL076';
  end if;

  insert into public.subscriptions
    (profile_id, provider, provider_subscription_id, status, renews_at, ends_at)
  values
    (p_profil, p_provider, p_subscription_id, p_statut, p_renews_at, p_ends_at)
  on conflict (provider, provider_subscription_id) do update
    set status     = excluded.status,
        renews_at  = excluded.renews_at,
        ends_at    = excluded.ends_at,
        updated_at = now();

  -- ⚠️ LE PLAN EST CELUI DE L'ENSEMBLE DES ABONNEMENTS DU COMPTE, PAS DU DERNIER
  -- ÉVÉNEMENT (revue sécurité ECC du 27/09/2026). Écrit d'après l'événement
  -- seul, la résiliation de N'IMPORTE QUEL abonnement rattaché au compte faisait
  -- tomber le plan — y compris celle d'un second abonnement, ou d'un abonnement
  -- ouvert par un tiers avec une signature de lien qui aurait fuité, pendant que le
  -- vrai abonnement du vendeur court toujours. Pro tant qu'UN abonnement le justifie.
  v_plan := case
    when exists (
      select 1
        from public.subscriptions s
       where s.profile_id = p_profil
         and public.plan_pour_statut(s.status, s.ends_at) = 'pro'
    ) then 'pro'::public.account_plan
    else 'gratuit'::public.account_plan
  end;

  -- ÉCRITURE INCONDITIONNELLE, et c'est voulu : rejouer le même événement doit
  -- rendre le même état, sans lever.
  update public.profiles set plan = v_plan where id = p_profil;

  if v_plan = 'gratuit' then
    update public.shops set hide_droplink_brand = false where owner_id = p_profil;
  end if;

  return v_plan;
end;
$$;
