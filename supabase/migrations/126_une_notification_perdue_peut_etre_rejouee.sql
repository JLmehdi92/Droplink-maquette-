-- ═══════════════════════════════════════════════════════════════════════════
-- UNE NOTIFICATION PERDUE PEUT ÊTRE REJOUÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ LE 31/08/2026. `notification_deja_vue` (migration 071)
-- est une marque à USAGE UNIQUE dont **l'insertion EST le test** : elle rend
-- faux la première fois et vrai ensuite. C'est la bonne forme pour dédupliquer.
--
-- Mais elle est consommée AVANT l'opération qui peut échouer. Si
-- `appliquer_etat_colis` ou `compter_interrogation_vide` échoue ensuite,
-- l'empreinte reste posée. Le fournisseur réémet le MÊME corps — donc la même
-- empreinte — et la notification ressort en « rejeu » : l'état est perdu
-- DÉFINITIVEMENT, jusqu'à la prochaine interrogation de cadence.
--
-- Le brief nomme ce piège en toutes lettres (§11, piège n°1) : « un compteur
-- incrémenté AVANT une opération qui peut échouer perd des événements
-- définitivement ». Et le chemin JUMEAU le traite déjà correctement :
-- `auth/retour/route.ts` réclame la marque d'inscription puis appelle
-- `liberer_evenement_inscription()` si l'émission échoue. Il n'existait aucun
-- équivalent ici.
--
-- ── CE QUE CETTE FONCTION EST, ET CE QU'ELLE N'EST PAS ─────────────────────
--
-- Elle RETIRE une empreinte, elle n'en pose pas. Elle ne peut donc jamais servir
-- à faire ingérer deux fois un même corps : au pire, elle rouvre le droit de
-- rejouer un corps dont le traitement a ÉCHOUÉ, c'est-à-dire un corps dont rien
-- n'a été écrit. Le sens de l'erreur est celui qu'on veut : sur panne, on préfère
-- retraiter que perdre.
--
-- Elle est réservée au rôle système, comme sa jumelle : la surface publique n'a
-- aucune raison d'effacer une empreinte de déduplication, et lui en donner le
-- droit rouvrirait la double facturation que la 071 a fermée.

create function public.liberer_notification_vue(p_cle text)
  returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.tracking_notifications_vues where cle = p_cle;
$$;

comment on function public.liberer_notification_vue(text) is
  'Retire l''empreinte d''une notification dont le traitement a ÉCHOUÉ, pour que le renvoi du fournisseur soit ré-ingéré au lieu d''être pris pour un rejeu. Jumelle de liberer_evenement_inscription : une marque à usage unique consommée avant l''opération qui peut échouer perd son événement définitivement.';

revoke all on function public.liberer_notification_vue(text) from public, anon, authenticated;
grant execute on function public.liberer_notification_vue(text) to service_role;
