-- 094 — L'IMMOBILITÉ D'UN COLIS NE SE SIGNALE QU'UNE FOIS.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME QUI A FAIT DÉBRANCHER CET ÉVÉNEMENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `colis_immobilise` était catalogué et déclaré SANS ÉMETTEUR, avec sa raison :
-- l'immobilité est un SEUIL FRANCHI, pas un état.
--
-- « Ce colis n'a pas bougé depuis plus de dix jours » est vrai à CHAQUE passage
-- de cadence, et le reste jusqu'à ce qu'il bouge — c'est-à-dire, pour un colis
-- bloqué en douane, pendant des semaines. Émettre là où on le constate
-- produirait un événement par interrogation pour un colis qui, par définition,
-- ne bouge pas : le double comptage dans sa forme la plus caricaturale, sur
-- exactement la population qu'on veut compter.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA MARQUE, ET POURQUOI ELLE EST RÉCLAMÉE PLUTÔT QUE LUE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Une colonne `immobilite_signalee_at` ne suffit pas si l'appelant la LIT puis
-- ÉCRIT : deux passages de cadence concurrents — ou un passage et un rejeu de
-- notification — liraient tous deux `null` et émettraient tous deux. La fenêtre
-- est étroite, donc le défaut est rare, donc il est indébogable : il ne
-- produirait qu'un doublon occasionnel dans une métrique, jamais une erreur.
--
-- La marque est donc RÉCLAMÉE en une seule instruction : l'`update` porte
-- lui-même la condition `is null`, et le `returning` dit si c'est CET appel qui
-- l'a posée. Postgres sérialise les écritures sur une même ligne ; le second
-- appel ne voit plus de ligne à modifier et rend faux. C'est le même motif que
-- `reclamer_evenement_creation`, pour la même raison.
--
-- L'instant est passé en argument et non lu par `now()` : la cadence prend son
-- instant UNE FOIS au début du lot, et deux colis d'un même passage doivent
-- porter le même. Sinon un lot décrit une durée au lieu d'un instant.

alter table public.tracked_parcels
  add column immobilite_signalee_at timestamptz;

comment on column public.tracked_parcels.immobilite_signalee_at is
  'Instant où le franchissement du seuil de silence a été SIGNALÉ, une seule fois. Distincte de last_movement_at : celle-ci répond à « l''a-t-on déjà dit », pas à « depuis quand ». Réclamée atomiquement par reclamer_immobilite.';

-- ── La réclamation ───────────────────────────────────────────────────────────
create function public.reclamer_immobilite(p_parcel_id uuid, p_quand timestamptz)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_pose uuid;
begin
  update public.tracked_parcels
     set immobilite_signalee_at = p_quand
   where id = p_parcel_id
     and immobilite_signalee_at is null
  returning id into v_pose;

  return v_pose is not null;
end;
$$;

comment on function public.reclamer_immobilite(uuid, timestamptz) is
  'Pose la marque d''immobilité SI elle n''est pas déjà posée, et dit si c''est cet appel qui l''a posée. Une lecture suivie d''une écriture laisserait deux passages concurrents émettre tous les deux — un doublon rare, donc jamais attribuable.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. Cette fonction est
-- `security definer` et écrit dans les colis de TOUS les vendeurs : laissée
-- ouverte, n'importe qui pourrait éteindre le signalement d'immobilité de
-- n'importe quel colis. Un droit ne s'écrit pas dans le corps d'une fonction —
-- seul le catalogue peut le dire.
revoke execute on function public.reclamer_immobilite(uuid, timestamptz)
  from public, anon, authenticated;

-- ── Le rattrapage n'a PAS lieu, et c'est délibéré ────────────────────────────
--
-- Aucun `update` de départ ne pose la marque sur les colis déjà silencieux.
-- Deux options existaient :
--
--   1. marquer tous les colis silencieux comme « déjà signalés ». On perdrait
--      définitivement l'événement pour eux ;
--   2. les laisser nuls. Ils seront signalés une fois, au prochain passage de
--      cadence qui les examine.
--
-- La seconde est retenue. Un compteur branché après coup démarre vide, donc
-- inexploitable au moment où il faut décider ; la première option reproduirait
-- exactement ce défaut sur la population la plus intéressante — les colis
-- réellement bloqués. Le prix est une bouffée d'événements au premier passage
-- suivant le déploiement, tous datés du même instant, donc reconnaissable.
