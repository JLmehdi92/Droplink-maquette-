-- 042 — Le journal doit pouvoir TRACER, et SURVIVRE.
--
-- Deux défauts constatés par exécution, tous deux invisibles à la relecture.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LE DÉCLENCHEUR APPEND-ONLY BLOQUAIT LA SUPPRESSION DES COMPTES.
--
-- `ON DELETE SET NULL` s'applique en faisant un UPDATE sur la ligne du journal.
-- Le déclencheur `before update` le refusait donc, la clé étrangère ne pouvait
-- pas être dénouée, et la suppression du compte échouait tout entière —
-- « Database error deleting user », sans que rien ne désigne le journal.
--
-- C'est un cas d'école du piège inverse : la protection posée pour que le
-- journal SURVIVE aux suppressions empêchait les suppressions d'avoir lieu. Le
-- brief le note déjà sous une autre forme (une clé étrangère sans `ON DELETE`
-- sur un journal bloque toute suppression de compte) ; ici la clé était bien
-- posée, et c'est le déclencheur qui l'annulait.
--
-- LA RÈGLE JUSTE : dénouer une clé étrangère est un geste du SYSTÈME, pas une
-- réécriture d'histoire. Le déclencheur autorise donc exactement cela — les deux
-- clés qui passent à NULL — et refuse tout le reste, y compris la modification
-- de l'email dénormalisé, qui est précisément ce qui doit survivre.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNE CONSULTATION INFRUCTUEUSE NE POUVAIT PAS ÊTRE TRACÉE.
--
-- `target_profile_id` porte une clé étrangère : y écrire l'identifiant d'un
-- compte qui n'existe pas la viole, et l'appel entier échouait. Or c'est
-- EXACTEMENT le cas qu'il faut tracer — chercher des identifiants au hasard est
-- la forme que prend une énumération, et ne consigner que les succès la rendrait
-- totalement invisible.
--
-- `resource_id` est du TEXTE LIBRE et porte déjà l'identifiant cherché : la
-- trace est complète sans la clé. On ne pose donc la clé que lorsqu'elle
-- correspond à un compte réel.

create or replace function public.refuser_modification_audit()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'le journal d''audit est append-only'
      using errcode = 'DL030';
  end if;

  -- Le seul changement toléré : une clé étrangère qu'on dénoue parce que le
  -- compte référencé disparaît. Tout le reste de la ligne doit être IDENTIQUE —
  -- comparé champ par champ plutôt que globalement, pour qu'une colonne ajoutée
  -- plus tard sans y penser fasse échouer le contrôle plutôt que de le franchir.
  if new.id is not distinct from old.id
     and new.admin_email is not distinct from old.admin_email
     and new.action is not distinct from old.action
     and new.resource_type is not distinct from old.resource_type
     and new.resource_id is not distinct from old.resource_id
     and new.target_email is not distinct from old.target_email
     and new.ip_hash is not distinct from old.ip_hash
     and new.occurred_at is not distinct from old.occurred_at
     and new.payload is not distinct from old.payload
     -- Les clés ne peuvent que se DÉNOUER, jamais changer de cible : autoriser
     -- une réaffectation permettrait d'attribuer une action à quelqu'un d'autre.
     and (new.admin_id is not distinct from old.admin_id or new.admin_id is null)
     and (new.target_profile_id is not distinct from old.target_profile_id
          or new.target_profile_id is null)
  then
    return new;
  end if;

  raise exception 'le journal d''audit est append-only'
    using errcode = 'DL030';
end;
$$;

-- Le déclencheur écoutait déjà `before update or delete` : seul son corps
-- change, il n'y a rien à recréer.

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
    and p.status = 'active';

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
