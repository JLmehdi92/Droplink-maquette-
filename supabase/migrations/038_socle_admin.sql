-- 038 — Le socle de l'administration : rôle vérifié en base, audit atomique.
--
-- C'EST LA SURFACE LA PLUS SENSIBLE DU PRODUIT. Un humain y lit les données de
-- quelqu'un d'autre. Tout ce qui suit part de cette phrase.
--
-- LE PRINCIPE DIRECTEUR : L'AUDIT N'EST PAS UNE ÉTAPE, C'EST LA MÊME OPÉRATION.
--
-- Écrire « vérifier le rôle, puis tracer, puis lire » laisse trois occasions
-- d'oublier une étape dans un futur écran, et l'oubli ne casse RIEN — l'écran
-- fonctionne, il ne laisse simplement aucune trace. Les trois gestes vivent donc
-- dans UNE fonction : la lecture est impossible sans l'audit, parce qu'il n'y a
-- pas de chemin qui fasse l'une sans l'autre. Une règle applicative peut être
-- oubliée dans un nouveau chemin de code ; une règle en base ne peut pas l'être.
--
-- FAIL-CLOSED : la fonction étant une seule transaction, un échec d'écriture de
-- l'audit annule la lecture. L'appelant n'obtient rien. C'est l'inverse du
-- réflexe habituel — on préfère ici refuser un accès légitime plutôt que
-- d'accorder un accès non tracé.

-- ---------------------------------------------------------------------------
-- `est_admin` — la seule autorité sur la question.
--
-- LE RÔLE EST LU EN BASE, À CHAQUE APPEL, jamais dans un claim du jeton : un
-- jeton reste valide jusqu'à son expiration même après une rétrogradation, et
-- ses claims sont posés à l'émission. S'y fier laisserait un ancien
-- administrateur travailler jusqu'à une heure de plus.
--
-- `security definer` parce que la fonction doit pouvoir lire `profiles` même
-- quand la policy de l'appelant ne le lui permettrait pas — et surtout parce
-- qu'une policy sur `profiles` qui lit `profiles` produit une récursion infinie.
-- ---------------------------------------------------------------------------

create function public.est_admin()
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
      -- UN ADMINISTRATEUR SUSPENDU N'EST PLUS ADMINISTRATEUR. Sans cette ligne,
      -- suspendre un compte lui retirerait l'accès vendeur tout en lui laissant
      -- l'accès à TOUTES les données — exactement l'inverse de l'intention.
      and p.status = 'active'
  )
$$;

comment on function public.est_admin() is
  'Vrai si l''appelant est administrateur ACTIF. Lu en base, jamais dans le jeton.';

revoke all on function public.est_admin() from public;
grant execute on function public.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Le journal d'audit.
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  -- `ON DELETE SET NULL` et NON `CASCADE` : le journal doit SURVIVRE à la
  -- suppression du compte qu'il décrit. C'est précisément quand un compte
  -- disparaît qu'on a besoin de savoir qui y a touché.
  admin_id          uuid references public.profiles (id) on delete set null,
  -- DÉNORMALISÉ À L'ÉCRITURE. Sans lui, une entrée dont le compte a disparu
  -- deviendrait « quelqu'un a fait quelque chose » : la clé est nulle, et il ne
  -- reste rien pour dire qui. L'email est la seule pièce qu'on demanderait en
  -- cas de litige.
  admin_email       text not null,
  action            text not null,
  resource_type     text not null,
  resource_id       text,
  target_profile_id uuid references public.profiles (id) on delete set null,
  target_email      text,
  ip_hash           text,
  occurred_at       timestamptz not null default now(),
  -- La charge utile porte le CONTEXTE de l'action — les critères d'une
  -- consultation de liste, le motif d'une suspension. Elle n'étale JAMAIS les
  -- données consultées : un journal qui montre tout devient une surface de fuite
  -- de plus, et celle-là serait consultable par tous les administrateurs.
  payload           jsonb not null default '{}'::jsonb,

  constraint admin_audit_log_action_non_vide check (btrim(action) <> ''),
  constraint admin_audit_log_email_non_vide check (btrim(admin_email) <> '')
);

create index admin_audit_log_recent_idx on public.admin_audit_log (occurred_at desc, id desc);
create index admin_audit_log_admin_idx on public.admin_audit_log (admin_id, occurred_at desc);
create index admin_audit_log_cible_idx on public.admin_audit_log (target_profile_id, occurred_at desc);

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

-- AUCUNE POLICY. La table n'est atteignable que par les fonctions ci-dessous,
-- toutes en `security definer`. Une policy de lecture, même réservée aux
-- administrateurs, créerait un second chemin — et c'est le second chemin qu'on
-- oublie de protéger le jour où le premier change.
revoke all on public.admin_audit_log from anon, authenticated;

/*
 * APPEND-ONLY, GARANTI PAR LA BASE.
 *
 * Le retrait des droits ne suffit pas : les fonctions `security definer`
 * ci-dessous s'exécutent avec les droits du propriétaire de la table, donc AVEC
 * le droit de modifier. Un déclencheur, lui, s'applique à tout le monde sans
 * exception — y compris au propriétaire, et y compris à une fonction future
 * qu'on écrirait sans y penser.
 *
 * Un journal modifiable n'est pas un journal : c'est une note qu'on peut
 * réécrire après coup, et sa valeur en cas de litige est nulle.
 */
create function public.refuser_modification_audit()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  raise exception 'le journal d''audit est append-only'
    using errcode = 'DL030';
end;
$$;

create trigger admin_audit_log_append_only
  before update or delete on public.admin_audit_log
  for each row execute function public.refuser_modification_audit();

revoke all on function public.refuser_modification_audit() from public;

/*
 * ÉCRIRE UNE ENTRÉE — le seul chemin.
 *
 * Elle VÉRIFIE LE RÔLE elle-même plutôt que de faire confiance à son appelant :
 * une fonction d'audit qui écrit ce qu'on lui dit accepterait une entrée forgée
 * par n'importe quel utilisateur authentifié, et le journal deviendrait un
 * endroit où l'on peut écrire des mensonges sur les autres.
 *
 * L'email de l'administrateur et celui de la cible sont relus EN BASE, jamais
 * reçus en argument : passés par l'appelant, ils permettraient d'attribuer une
 * action à quelqu'un d'autre.
 */
create function public.journaliser_admin(
  p_action        text,
  p_resource_type text,
  p_resource_id   text,
  p_cible         uuid,
  p_ip_hash       text,
  p_payload       jsonb
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_admin_id    uuid;
  v_admin_email text;
  v_cible_email text;
  v_id          uuid;
begin
  select p.id, p.email into v_admin_id, v_admin_email
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    -- MÊME MESSAGE QUE POUR UNE RESSOURCE ABSENTE. Distinguer « tu n'es pas
    -- administrateur » de « cette ressource n'existe pas » apprendrait à un
    -- curieux que la surface existe.
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if p_cible is not null then
    select p.email into v_cible_email from public.profiles p where p.id = p_cible;
  end if;

  insert into public.admin_audit_log
    (admin_id, admin_email, action, resource_type, resource_id,
     target_profile_id, target_email, ip_hash, payload)
  values
    (v_admin_id, v_admin_email, p_action, p_resource_type, nullif(p_resource_id, ''),
     p_cible, v_cible_email, nullif(p_ip_hash, ''), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.journaliser_admin(text, text, text, uuid, text, jsonb) is
  'Écrit une entrée d''audit. Vérifie le rôle elle-même : le journal n''accepte pas d''entrée forgée.';

revoke all on function public.journaliser_admin(text, text, text, uuid, text, jsonb) from public;
grant execute on function public.journaliser_admin(text, text, text, uuid, text, jsonb) to authenticated;
