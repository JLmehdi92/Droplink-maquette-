-- 186 — L'ADMINISTRATION EXIGE LA DOUBLE AUTHENTIFICATION, EN BASE.
--
-- Décision de Wassim du 23/09/2026. Jusqu'ici la double authentification était
-- facultative pour tous, administrateur compris : un mot de passe administrateur
-- volé ouvrait TOUTES les données de TOUS les vendeurs, et la suspension de
-- n'importe quel compte. Mesuré avant cette migration sur la base de tests : une
-- session à un seul facteur rendait `est_admin() = true` et suspendait un compte.
--
-- LA RÈGLE VIT EN BASE, PAS À L'ÉCRAN. Une garde d'écran ne protège que les
-- écrans qui l'appellent ; une page ou une action oubliée l'aurait contournée.
--
-- DEUX POINTS DE PASSAGE SUFFISENT, et c'est pourquoi ce fichier est court :
--   · `est_admin()`, appelée par 31 fonctions d'administration (lectures et gestes) ;
--   · `journaliser_admin()`, appelée DANS LEUR TRANSACTION par les sept fonctions
--     qui vérifient le rôle en ligne (suspendre, réactiver, bloquer, débloquer,
--     définir le plan, refuser une contestation — et elle-même). Refusée là, la
--     transaction entière est annulée : rien n'est modifié, rien n'est tracé.
-- Recopier sept corps de fonction pour y changer une ligne aurait créé sept
-- occasions de dériver ; aucune n'est touchée.
--
-- ⚠️ À DIRE AU DÉPLOIEMENT : l'administrateur qui n'a pas encore de facteur perd
-- l'administration jusqu'à ce qu'il l'active dans ses paramètres. L'espace
-- vendeur, lui, reste ouvert à un seul facteur — c'est là qu'on l'active.

-- ── Un seul endroit sait lire le niveau de la session ─────────────────────────
create function public.session_double_facteur()
  returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
$$;
comment on function public.session_double_facteur() is
  'Vrai si la session présente un second facteur vérifié (aal2). Lu dans le jeton signé.';
revoke all on function public.session_double_facteur() from public;
grant execute on function public.session_double_facteur() to authenticated;

-- ── est_admin : même signature, une condition de plus ─────────────────────────
create or replace function public.est_admin()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'admin'
      -- UN ADMINISTRATEUR SUSPENDU N'EST PLUS ADMINISTRATEUR.
      and p.status = 'active'
  )
  -- MIGRATION 186 : ni à un seul facteur.
  and public.session_double_facteur()
$$;
comment on function public.est_admin() is
  'Vrai si l''appelant est administrateur ACTIF, en session aal2. Lu en base, jamais dans le rôle du jeton.';

-- ── journaliser_admin : même signature, une condition de plus ─────────────────
create or replace function public.journaliser_admin(
  p_action        text,
  p_resource_type text,
  p_resource_id   text,
  p_cible         uuid,
  p_ip_hash       text,
  p_payload       jsonb
)
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id    uuid;
  v_admin_email text;
  v_cible_id    uuid;
  v_cible_email text;
  v_id          uuid;
begin
  select p.id, p.email into v_admin_id, v_admin_email
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active'
    -- MIGRATION 186 : une session à un seul facteur n'écrit pas au journal. Les
    -- sept fonctions qui vérifient le rôle en ligne appellent toutes celle-ci
    -- dans leur transaction : refusé ici, leur geste est annulé entier.
    and public.session_double_facteur();

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- LA CLÉ N'EST POSÉE QUE SI LE COMPTE EXISTE. Chercher un identifiant qui
  -- n'existe pas doit laisser une trace, pas une erreur : `resource_id` porte
  -- déjà la valeur cherchée, en texte libre, donc rien n'est perdu.
  if p_cible is not null then
    select p.id, p.email into v_cible_id, v_cible_email
    from public.profiles p where p.id = p_cible;
  end if;

  insert into public.admin_audit_log
    (admin_id, admin_email, action, resource_type, resource_id,
     target_profile_id, target_email, ip_hash, payload)
  values
    (v_admin_id, v_admin_email, p_action, p_resource_type, nullif(p_resource_id, ''),
     v_cible_id, v_cible_email, nullif(p_ip_hash, ''), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- ── Ce que l'écran peut dire, et à qui ────────────────────────────────────────
-- Vrai SEULEMENT pour un administrateur actif en session à un seul facteur :
-- c'est ce qui permet de l'envoyer activer la 2FA plutôt que de lui rendre un 404
-- muet. Un vendeur reçoit `false`, exactement comme un administrateur en règle :
-- la fonction ne dit à personne d'autre que l'administration existe.
create function public.admin_sans_double_facteur()
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'active'
  )
  and not public.session_double_facteur()
$$;
comment on function public.admin_sans_double_facteur() is
  'Vrai seulement pour un administrateur actif en session à un seul facteur. Faux pour tout autre appelant.';
revoke all on function public.admin_sans_double_facteur() from public;
grant execute on function public.admin_sans_double_facteur() to authenticated;
