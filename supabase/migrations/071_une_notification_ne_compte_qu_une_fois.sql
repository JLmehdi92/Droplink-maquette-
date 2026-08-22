-- 071 — UNE NOTIFICATION REJOUÉE NE COMPTE QU'UNE FOIS.
--
-- MESURÉ AVANT CORRECTION : la MÊME notification, signée et valide, renvoyée
-- cinq fois de suite → `query_count` 1 → 6, instantanés 1 → 6, et autant
-- d'imputations de coût. Les points de passage, eux, tenaient : leur contrainte
-- d'unicité les protégeait déjà. C'est la différence entre une donnée dont
-- l'unicité est déclarée EN BASE et un compteur qu'on incrémente.
--
-- POURQUOI LE REJEU EST ATTEIGNABLE. La signature du fournisseur porte sur le
-- corps, et rien dans ce corps n'est daté ni numéroté par lui. Un corps signé
-- capté une fois reste donc valide indéfiniment, et `/api/suivi/notification`
-- n'avait aucune limitation de débit. Il n'est même pas besoin de capter quoi
-- que ce soit : le fournisseur lui-même REJOUE quand il ne reçoit pas de réponse
-- assez vite, parfois en boucle. Le défaut se déclenche donc tout seul, sans
-- personne en face — c'est le cas le plus probable, pas le cas hostile.
--
-- LA CLÉ EST LE HACHAGE DU CORPS REÇU, calculé sur les octets exacts sur
-- lesquels porte la signature. Un rejeu à l'octet près porte la même clé et
-- ressort ici. Modifier ne serait-ce qu'un octet pour changer la clé casse la
-- signature, donc la requête est refusée avant d'arriver jusqu'ici : les deux
-- gardes se referment l'une sur l'autre.
--
-- ELLE NE S'APPLIQUE QU'AUX NOTIFICATIONS. La tâche de cadence, elle, interroge
-- le fournisseur de sa propre initiative et peut très légitimement recevoir deux
-- fois la même réponse pour un colis qui n'a pas bougé — c'est même le cas
-- NORMAL d'un colis bloqué en douane. Y appliquer la même déduplication
-- empêcherait `query_count` d'avancer, donc la fenêtre d'abandon de se fermer,
-- donc ferait interroger ce colis pour toujours. Le chemin sans clé reste donc
-- ouvert, et c'est délibéré.

create table public.tracking_notifications_vues (
  cle text primary key,
  vue_at timestamptz not null default now()
);

comment on table public.tracking_notifications_vues is
  'Empreintes des notifications de suivi déjà traitées. Purgée avec les instantanés.';

-- Purge par ancienneté : c'est le seul accès de la purge, et sans index elle
-- balaierait une table qui grossit avec le trafic du fournisseur.
create index tracking_notifications_vues_age_idx
  on public.tracking_notifications_vues (vue_at);

/*
 * RLS ACTIVÉE ET FORCÉE, AUCUNE POLICY.
 *
 * Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : une table
 * créée sans RLS est grande ouverte, et le fichier de migration ne le dit pas.
 * Ici l'absence de policy est le contrat — la table n'est atteignable que par la
 * fonction ci-dessous, qui est `security definer`. Sans RLS, n'importe qui
 * pourrait pré-insérer la clé d'une notification à venir et la faire IGNORER,
 * c'est-à-dire empêcher un colis de jamais se mettre à jour.
 */
alter table public.tracking_notifications_vues enable row level security;
alter table public.tracking_notifications_vues force row level security;
revoke all on table public.tracking_notifications_vues from public, anon, authenticated;

/*
 * Rend `true` si cette notification a DÉJÀ été traitée.
 *
 * L'insertion EST le test. Le faire en deux temps — lire puis insérer — laisserait
 * deux rejeux simultanés passer tous les deux entre la lecture et l'écriture, et
 * cette course-là DÉGRADE au lieu de casser : elle ne produit aucune erreur, juste
 * un compteur de coût faux, un jour où le fournisseur aura rejoué en rafale.
 */
create function public.notification_deja_vue(p_cle text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_insere integer;
begin
  if p_cle is null or btrim(p_cle) = '' then
    -- La chaîne vide vaut absence, comme partout dans ce dépôt. Une clé absente
    -- ne peut pas dédupliquer : on ne prétend pas l'avoir fait.
    return false;
  end if;

  insert into public.tracking_notifications_vues (cle)
  values (btrim(p_cle))
  on conflict (cle) do nothing;

  get diagnostics v_insere = row_count;
  return v_insere = 0;
end;
$$;

comment on function public.notification_deja_vue(text) is
  'Marque une notification comme traitée et dit si elle l''était déjà. L''insertion EST le test : lire puis écrire laisserait passer deux rejeux simultanés.';

revoke execute on function public.notification_deja_vue(text) from public, anon, authenticated;
