-- 044 — Les paramètres système, en base, avec leur trace.
--
-- UN PARAMÈTRE MODIFIABLE SANS TRACE EST PIRE QU'UN PARAMÈTRE FIGÉ. Figé, on
-- sait ce qu'il vaut. Modifiable en silence, on croit savoir : un seuil d'alerte
-- abaissé un soir explique six mois plus tard pourquoi personne n'a rien vu, et
-- rien ne dit qui l'a abaissé ni quand.
--
-- LA TRACE EST ÉCRITE PAR UN DÉCLENCHEUR, jamais par le code appelant. Un appel
-- explicite se contourne en écrivant directement dans la table — y compris par
-- inadvertance, dans un script de maintenance. Un déclencheur s'applique à tout
-- le monde sans exception.
--
-- LES SECRETS NE PASSENT PAS PAR ICI. Clés d'API, secrets de tâches planifiées,
-- clé service-role : ils restent dans l'environnement. Une valeur en base est
-- lisible par toute personne ayant accès à la base — c'est acceptable pour un
-- seuil, jamais pour une clé.

create table public.system_settings (
  key        text primary key,
  value      jsonb not null,
  -- `ON DELETE SET NULL` : la trace doit survivre au départ de celui qui a
  -- modifié le réglage. C'est précisément quand quelqu'un n'est plus là qu'on
  -- cherche à comprendre ce qu'il a changé.
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint system_settings_cle_non_vide check (btrim(key) <> '')
);

alter table public.system_settings enable row level security;
alter table public.system_settings force row level security;

-- AUCUNE POLICY : la table n'est atteignable que par les fonctions ci-dessous.
-- Une policy de lecture, même réservée aux administrateurs, créerait un second
-- chemin — et c'est le second qu'on oublie de protéger quand le premier change.
revoke all on public.system_settings from anon, authenticated;

/*
 * LA TRACE, PAR DÉCLENCHEUR.
 *
 * Elle écrit dans `admin_audit_log` en portant l'ANCIENNE et la NOUVELLE valeur.
 * Sans l'ancienne, l'entrée dit « le seuil vaut maintenant 1 200 » — ce que la
 * table dit déjà. Ce qu'on veut savoir, c'est ce qu'il valait avant.
 *
 * `admin_email` est relu en base. La colonne étant `not null`, une modification
 * faite hors session — par une migration, par un script — écrirait un email
 * vide et violerait la contrainte. On y inscrit donc une valeur explicite
 * plutôt que de laisser le déclencheur échouer : une trace qui dit « système »
 * vaut mieux qu'une écriture refusée dont personne ne comprend la cause.
 */
create function public.tracer_parametre()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_admin_id    uuid;
  v_admin_email text;
begin
  select p.id, p.email into v_admin_id, v_admin_email
  from public.profiles p
  where p.user_id = (select auth.uid());

  insert into public.admin_audit_log
    (admin_id, admin_email, action, resource_type, resource_id, payload)
  values (
    v_admin_id,
    coalesce(v_admin_email, 'systeme'),
    case when tg_op = 'INSERT' then 'parametre.creation' else 'parametre.modification' end,
    'system_settings',
    new.key,
    jsonb_build_object(
      'avant', case when tg_op = 'INSERT' then null else old.value end,
      'apres', new.value
    )
  );

  return new;
end;
$$;

revoke all on function public.tracer_parametre() from public;

create trigger system_settings_trace
  after insert or update on public.system_settings
  for each row execute function public.tracer_parametre();

/*
 * ÉCRIRE UN PARAMÈTRE — le seul chemin applicatif.
 *
 * Elle vérifie le rôle elle-même. Le déclencheur tracera de toute façon, mais
 * une fonction qui accepterait n'importe quel appelant laisserait un vendeur
 * modifier les seuils du produit : la trace dirait qui, sans empêcher quoi.
 */
create function public.ecrire_parametre(p_cle text, p_valeur jsonb)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if nullif(btrim(coalesce(p_cle, '')), '') is null then
    raise exception 'cle obligatoire' using errcode = 'DL032';
  end if;

  insert into public.system_settings (key, value, updated_by)
  values (
    btrim(p_cle),
    p_valeur,
    (select p.id from public.profiles p where p.user_id = (select auth.uid()))
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return true;
end;
$$;

comment on function public.ecrire_parametre(text, jsonb) is
  'Écrit un paramètre système. La trace est posée par déclencheur, pas par cette fonction.';

revoke all on function public.ecrire_parametre(text, jsonb) from public;
grant execute on function public.ecrire_parametre(text, jsonb) to authenticated;

/*
 * LIRE UN ENTIER, avec son défaut.
 *
 * LE DÉFAUT EST DANS L'APPEL, pas dans la table. Une ligne absente est donc un
 * état normal — le produit fonctionne sans qu'aucun paramètre n'ait jamais été
 * écrit — et non une panne à diagnostiquer. Les valeurs par défaut ne sont pas
 * insérées ici pour la même raison : les insérer ferait croire qu'elles ont été
 * décidées, alors qu'elles n'ont été que subies.
 *
 * `stable` : elle n'écrit rien, et le moteur refusera toute écriture qu'on y
 * ajouterait.
 */
create function public.lire_parametre_entier(p_cle text, p_defaut int)
  returns int
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::int from public.system_settings s where s.key = p_cle),
    p_defaut
  )
$$;

comment on function public.lire_parametre_entier(text, int) is
  'Lit un seuil entier. Une ligne absente est un état NORMAL : le défaut vient de l''appel.';

revoke all on function public.lire_parametre_entier(text, int) from public;
grant execute on function public.lire_parametre_entier(text, int) to authenticated;
