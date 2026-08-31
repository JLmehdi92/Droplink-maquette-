-- ═══════════════════════════════════════════════════════════════════════════
-- LA VEILLE MUTUELLE PEUT ENFIN ALERTER
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ À L'AUDIT DU 31/08/2026. Le brief pose deux exigences
-- sur le veilleur (§3 décision 11, et L-022) :
--
--   « Le veilleur doit être hors du planificateur veillé. Une tâche qui
--     surveille les tâches s'arrête avec elles. »
--   « L'alerte PART (email), pas un badge sur un écran que personne n'ouvre. »
--
-- AUCUNE DES DEUX N'ÉTAIT TENUE. `cadence-suivi` écrit son propre battement,
-- personne ne le lit hors d'un écran d'administration, et le seul chemin
-- d'alerte — `alertes_admin`, migration 058 — souffre d'un défaut que sa forme
-- rend invisible :
--
--   from public.scheduler_heartbeat h
--   where h.beat_at < now() - make_interval(mins => p_retard_minutes)
--
-- IL FAUT UNE LIGNE POUR ÊTRE EN RETARD. Une tâche qui n'a jamais tourné n'a
-- pas de ligne, donc ne peut pas être signalée — et c'est très exactement
-- l'état du produit aujourd'hui. Le veilleur ne peut alerter que sur une panne
-- de quelque chose qui a déjà fonctionné.
--
-- ── CE QUE CETTE MIGRATION POSE, ET POURQUOI CHAQUE PIÈCE ──────────────────
--
-- 1. `premier_battement` sur `scheduler_heartbeat`.
--
--    C'EST LA PIÈCE QUI REND `jamais_vue` DÉCIDABLE. Le brief interdit d'en
--    faire une alerte : « une tâche posée ce matin n'a pas encore eu son
--    premier passage ; la signaler ferait chercher une panne inexistante ». La
--    règle est juste, et elle laissait un trou — une tâche jamais déployée du
--    tout ne se signale jamais non plus.
--
--    Ce qui distingue les deux cas n'est pas la tâche absente, c'est L'ÂGE DE
--    CELUI QUI LA CHERCHE. Un veilleur qui tourne depuis quatre périodes de
--    retard et n'a jamais vu battre sa jumelle ne regarde pas une tâche
--    fraîche : il regarde une tâche qui n'existe pas. Sans cette colonne, un
--    veilleur ne peut pas dire depuis quand il veille, et ne peut donc pas
--    distinguer « pas encore » de « jamais ».
--
--    `battre` n'y touche pas : son `on conflict do update` ne fixe que
--    `beat_at` et `detail`. La valeur posée à la première insertion survit
--    donc à tous les battements suivants, ce qui est exactement le sens voulu.
--
-- 2. `alertes_envoyees` — le repos entre deux alertes.
--
--    Un planificateur passe toutes les quelques minutes. Sans repos, une panne
--    d'une nuit produirait des centaines d'emails identiques, et la seule chose
--    qu'on apprendrait est à filtrer l'expéditeur. UNE ALERTE QU'ON APPREND À
--    IGNORER EST UNE ALERTE PERDUE — le brief le dit de `never_ran`, c'est vrai
--    du volume aussi.
--
-- 3. `reserver_alerte` / `liberer_alerte` — et l'ORDRE des deux.
--
--    La réservation vient AVANT l'envoi, parce que deux passages concurrents
--    doivent en perdre un : c'est la réservation qui les départage, et elle est
--    atomique.
--
--    Mais réserver avant une opération qui peut échouer est le piège n°1 du
--    brief (§11) : si l'envoi échoue, l'alerte est perdue pour toute la durée
--    du repos, c'est-à-dire précisément pendant la panne qu'elle décrivait.
--    D'où la jumelle : sur échec d'envoi, on LIBÈRE, et le passage suivant
--    réessaie. Le sens de l'erreur est celui qu'on veut — sur panne, on
--    préfère alerter deux fois que se taire.
--
--    C'est le même couple que `notification_deja_vue` /
--    `liberer_notification_vue` (migrations 071 et 126), pour la même raison,
--    et ce n'est pas une coïncidence : c'est la forme correcte d'une marque à
--    usage unique.
--
-- 4. `etat_veille` — l'INVENTAIRE mène la jointure.
--
--    `etat_veilleur` (migration 045) ne peut pas servir ici, et pas seulement
--    par commodité : elle appelle `est_admin()`, donc elle est réservée à un
--    HUMAIN. Un planificateur n'est personne — c'est la distinction même entre
--    `admin.ts` et `system.ts`. Lui donner accès à la fonction admin
--    reviendrait à percer cette séparation pour économiser vingt lignes.
--
--    Et surtout : celle-ci part de la LISTE DES TÂCHES ATTENDUES et joint les
--    battements par la gauche. C'est ce qui fait apparaître une tâche dont
--    aucune ligne n'existe. Une sonde qui part de la table ne peut rendre que
--    ce que la table contient — et un ensemble vide passe tout.

-- ── 1. Depuis quand cette tâche existe-t-elle ? ─────────────────────────────

alter table public.scheduler_heartbeat
  add column premier_battement timestamptz not null default now();

comment on column public.scheduler_heartbeat.premier_battement is
  'Premier battement observé pour cette source. JAMAIS réécrit : c''est l''âge du veilleur qui permet de distinguer une tâche pas encore passée d''une tâche jamais déployée.';

-- ── 2. Le repos entre deux alertes ──────────────────────────────────────────

create table public.alertes_envoyees (
  cle text primary key,
  envoye_at timestamptz not null default now()
);

comment on table public.alertes_envoyees is
  'Dernier envoi de chaque alerte, pour imposer un repos. Aucune policy : atteignable seulement par reserver_alerte et liberer_alerte.';

alter table public.alertes_envoyees enable row level security;
alter table public.alertes_envoyees force row level security;

-- Aucune policy, délibérément. Le droit d'effacer une réservation d'alerte est
-- le droit de faire réémettre autant d'emails qu'on veut ; le droit d'en poser
-- une est celui de FAIRE TAIRE le veilleur. Les deux restent hors de portée.
revoke all on public.alertes_envoyees from anon, authenticated;

create function public.reserver_alerte(p_cle text, p_repos_minutes int)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_obtenue boolean;
  -- Borné comme tout paramètre qui vient d'ailleurs : à zéro le repos ne
  -- reposerait rien, et au-delà d'une semaine une panne réelle cesserait
  -- d'être rappelée.
  v_repos int := least(greatest(coalesce(p_repos_minutes, 60), 1), 10080);
begin
  insert into public.alertes_envoyees as a (cle) values (p_cle)
  on conflict (cle) do update set envoye_at = now()
    where a.envoye_at < now() - make_interval(mins => v_repos)
  returning true into v_obtenue;

  -- Aucune ligne rendue : la clé existe et son repos n'est pas écoulé.
  return coalesce(v_obtenue, false);
end;
$$;

comment on function public.reserver_alerte(text, int) is
  'Réclame le droit d''envoyer une alerte, au plus une fois par période de repos. Atomique : deux passages concurrents en perdent un.';

revoke all on function public.reserver_alerte(text, int) from public, anon, authenticated;
grant execute on function public.reserver_alerte(text, int) to service_role;

create function public.liberer_alerte(p_cle text)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.alertes_envoyees where cle = p_cle;
$$;

comment on function public.liberer_alerte(text) is
  'Retire la réservation d''une alerte dont l''ENVOI a échoué, pour que le passage suivant réessaie. Sans elle, une alerte réservée puis non partie se tait pendant toute la durée du repos — c''est-à-dire pendant la panne.';

revoke all on function public.liberer_alerte(text) from public, anon, authenticated;
grant execute on function public.liberer_alerte(text) to service_role;

-- ── 3. L'état des tâches ATTENDUES, vu par une machine ──────────────────────

create function public.etat_veille(p_sources text[], p_retard_minutes int)
  returns table (
    source text,
    dernier_battement timestamptz,
    premier_battement timestamptz,
    minutes bigint,
    etat text
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select
    s.nom,
    h.beat_at,
    h.premier_battement,
    case
      when h.beat_at is null then null
      else extract(epoch from (now() - h.beat_at))::bigint / 60
    end,
    case
      when h.beat_at is null then 'jamais_vue'
      when h.beat_at < now() - make_interval(
             mins => least(greatest(coalesce(p_retard_minutes, 60), 1), 10080))
        then 'en_retard'
      else 'actif'
    end
  from unnest(p_sources) as s(nom)
  left join public.scheduler_heartbeat h on h.source = s.nom;
$$;

comment on function public.etat_veille(text[], int) is
  'État des tâches ATTENDUES, l''inventaire menant la jointure : une tâche sans battement ressort jamais_vue au lieu d''être absente du résultat. Chemin MACHINE — pas de est_admin(), contrairement à etat_veilleur.';

revoke all on function public.etat_veille(text[], int) from public, anon, authenticated;
grant execute on function public.etat_veille(text[], int) to service_role;
