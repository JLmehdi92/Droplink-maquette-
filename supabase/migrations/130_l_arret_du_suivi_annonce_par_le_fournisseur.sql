-- ═══════════════════════════════════════════════════════════════════════════
-- L'ARRÊT DU SUIVI, ANNONCÉ PAR LE FOURNISSEUR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ LE 01/09/2026 EN LISANT LEUR DOCUMENTATION. 17TRACK
-- pousse DEUX événements, et pas un :
--
--   TRACKING_UPDATED  — le colis a bougé ;
--   TRACKING_STOPPED  — ILS CESSENT DE SUIVRE.
--
-- Notre schéma lisait bien `event`, mais ne branchait jamais dessus. L'arrêt
-- n'était détecté qu'INDIRECTEMENT, par l'absence d'état dans la charge utile.
-- Or rien n'oblige un `TRACKING_STOPPED` à venir vide : accompagné du dernier
-- état connu, il passait pour une mise à jour ordinaire.
--
-- CE QUE ÇA COÛTAIT, ET POURQUOI ÇA NE SE VOYAIT PAS :
--
--   - la cadence continuait d'interroger un numéro que PLUS PERSONNE ne suit,
--     donc des appels pour rien, indéfiniment jusqu'à la fenêtre d'abandon ;
--   - `abandoned_at` restait nulle, donc nos compteurs déclaraient vivant un
--     suivi éteint ;
--   - et surtout, le SILENCE affiché au client d'un vendeur était imputé au
--     transporteur — « aucun mouvement depuis 12 jours » — alors que la vraie
--     cause est que la SOURCE s'est tue. Nommer un silence dont on se trompe
--     de cause est pire que de ne rien dire : le brief le pose comme une
--     information, et c'en devenait une fausse.
--
-- Leur politique, confirmée : arrêt après 30 jours sans événement, 15 jours
-- après une livraison, données conservées 90 jours. Notre rétention en prévoit
-- 90 après le DERNIER MOUVEMENT — un colis bloqué en douane sort donc de leur
-- radar avant du nôtre, et c'est précisément là que cette annonce compte.
--
-- ── POURQUOI PAR NUMÉRO, ET NON PAR IDENTIFIANT ────────────────────────────
--
-- `abandonner_colis(uuid, text)` existe déjà, mais prend l'identifiant du
-- colis. Une notification ne connaît que le NUMÉRO — c'est sa seule clef. La
-- sélection par `tracking_number` reprend exactement celle
-- d'`appliquer_etat_colis`, qui touche toutes les lignes portant ce numéro :
-- l'unicité est `(shop_id, tracking_number)`, donc deux vendeurs peuvent suivre
-- le même colis, et le fournisseur qui cesse de le suivre cesse pour les deux.
--
-- ⚠️ ELLE N'ÉCRASE JAMAIS UN ABANDON DÉJÀ POSÉ (`abandoned_at is null`) : un
-- rejeu de notification ne doit pas repousser la date d'abandon, sans quoi
-- l'ancienneté qu'on affiche au client repartirait de zéro à chaque renvoi.

create function public.arreter_suivi(p_numero text, p_motif text)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_touches integer;
begin
  update public.tracked_parcels
     set abandoned_at = now(),
         raw_status = coalesce(nullif(p_motif, ''), raw_status)
   where tracking_number = p_numero
     and abandoned_at is null;

  get diagnostics v_touches = row_count;

  -- LE NOMBRE DE LIGNES EST RENDU, jamais tu. Zéro est un état LÉGITIME — le
  -- colis était déjà abandonné, ou le numéro ne nous concerne pas — mais c'est
  -- aussi le symptôme d'une notification qui vise un numéro inconnu. L'appelant
  -- doit pouvoir faire la différence ; la fonction ne la fait pas à sa place.
  return v_touches;
end;
$$;

comment on function public.arreter_suivi(text, text) is
  'Marque abandonnés les colis portant ce numéro, quand le FOURNISSEUR annonce qu''il cesse de suivre (TRACKING_STOPPED). N''écrase jamais un abandon déjà posé : un rejeu ne doit pas repousser l''ancienneté affichée au client.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin : le point de réception des notifications tourne
-- avec le client SYSTÈME, sans humain.
revoke execute on function public.arreter_suivi(text, text) from public, anon, authenticated;
grant execute on function public.arreter_suivi(text, text) to service_role;
