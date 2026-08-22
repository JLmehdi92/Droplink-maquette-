-- 073 — LE MOTIF D'ABANDON CESSE D'ÉCRASER CE QUE DISAIT LE FOURNISSEUR.
--
-- `abandonner_colis` écrivait son motif — `abandon:trop-de-vides` — DANS
-- `raw_status`, la colonne qui conserve le statut brut du transporteur. Or la
-- migration qui a créé cette colonne la justifie ainsi : « sans lui, un statut
-- qu'on n'a pas su traduire disparaîtrait sans trace ».
--
-- L'abandon est précisément le moment où l'on veut savoir ce que le fournisseur
-- disait juste avant qu'on cesse de l'écouter. La seule écriture qui détruisait
-- cette colonne était donc celle qui avait lieu à l'instant où elle sert le
-- plus. Et la destruction est SILENCIEUSE : rien n'échoue, rien n'alerte, la
-- valeur est simplement remplacée par une chaîne qui a l'air d'un statut.
--
-- Deux faits distincts, deux colonnes. `raw_status` dit ce que le TRANSPORTEUR
-- affirme ; `abandon_motif` dit ce que NOUS avons décidé. Les loger ensemble
-- revenait à ne plus pouvoir répondre à la question « qui a dit ça ».

alter table public.tracked_parcels add column abandon_motif text;

comment on column public.tracked_parcels.abandon_motif is
  'Pourquoi NOUS avons cessé d''interroger. Distinct de `raw_status`, qui dit ce que le TRANSPORTEUR affirmait.';

/*
 * REPRISE DE L'EXISTANT, dans les deux sens.
 *
 * Les colis déjà abandonnés portent leur motif dans `raw_status`. On le déplace,
 * et on remet `raw_status` à NULL pour ceux-là : garder une valeur qui n'a jamais
 * été prononcée par un transporteur dans une colonne qui prétend le citer serait
 * conserver le défaut sous un autre nom.
 *
 * Le motif est reconnu par son PRÉFIXE, pas par la liste des motifs connus : une
 * liste se périme au prochain motif ajouté, et la reprise ne se rejoue pas.
 */
update public.tracked_parcels
   set abandon_motif = raw_status,
       raw_status = null
 where abandoned_at is not null
   and raw_status like 'abandon:%';

drop function public.abandonner_colis(uuid, text);

create function public.abandonner_colis(p_parcel_id uuid, p_motif text)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.tracked_parcels
     set abandoned_at = now(),
         abandon_motif = nullif(btrim(coalesce(p_motif, '')), '')
   where id = p_parcel_id and abandoned_at is null;
$$;

comment on function public.abandonner_colis(uuid, text) is
  'Cesse d''interroger un colis, avec notre motif. N''écrit JAMAIS dans `raw_status` : cette colonne appartient au transporteur.';

revoke execute on function public.abandonner_colis(uuid, text) from public, anon, authenticated;
