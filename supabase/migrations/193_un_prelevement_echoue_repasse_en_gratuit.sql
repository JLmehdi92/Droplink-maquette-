-- 193 — UN PRÉLÈVEMENT ÉCHOUÉ REPASSE LE COMPTE EN GRATUIT.
--
-- DÉCISION DE WASSIM, 24/09/2026 : « si l'abonnement est résilié sans date ça
-- retourne en gratuit et même si le client est débité et que ça paye pas bah le
-- compte retourne en gratuit ».
--
-- La 179 gardait `past_due` en Pro, au motif que le fournisseur réessaie le
-- prélèvement et qu'une carte expirée n'est pas une résiliation. C'était un
-- arbitrage, et Wassim tranche dans l'autre sens : le Pro est ce qui est PAYÉ.
-- Rien n'est perdu pour le vendeur qui régularise : le paiement suivant arrive
-- par le même webhook avec `active`, et `appliquer_abonnement` rend le Pro sur
-- le champ — la même écriture inconditionnelle, dans l'autre sens.
--
-- `cancelled` est inchangé : Pro jusqu'à `ends_at` si elle est dans le futur,
-- gratuit si elle est passée OU ABSENTE (confirmé par Wassim le même jour).
--
-- Signature inchangée : `create or replace` remplace bien la fonction et garde
-- ses droits ; ils sont redits pour qu'une réparation du falsificateur découpée
-- ici les rétablisse aussi.

create or replace function public.plan_pour_statut(p_statut text, p_ends_at timestamptz)
  returns public.account_plan
  language sql
  stable
  set search_path = ''
as $$
  select case
    when p_statut in ('on_trial', 'active') then 'pro'::public.account_plan
    -- ⚠️ `cancelled` RESTE PRO TANT QUE `ends_at` N'EST PAS PASSÉE : un vendeur
    -- qui résilie le 2 du mois a payé jusqu'au 30. Le couper à l'instant du
    -- clic lui vole ce qu'il a réglé.
    when p_statut = 'cancelled' and p_ends_at is not null and p_ends_at > now()
      then 'pro'::public.account_plan
    -- `past_due` (prélèvement échoué), `unpaid`, `paused`, `expired`, et tout
    -- statut inconnu : gratuit.
    else 'gratuit'::public.account_plan
  end;
$$;

comment on function public.plan_pour_statut(text, timestamptz) is
  'Traduit un statut d''abonnement du fournisseur en plan DropLink. Pro : on_trial, active, et cancelled jusqu''à ends_at (le vendeur a payé sa période). Tout le reste est gratuit, past_due compris — décision de Wassim du 24/09/2026 : un prélèvement échoué coupe le Pro, un paiement réussi le rend. Chemin de recherche épinglé à vide — sans quoi l''appelant pourrait substituer ses propres objets à ceux qui décident d''un plan.';

revoke execute on function public.plan_pour_statut(text, timestamptz) from public, anon, authenticated;
grant execute on function public.plan_pour_statut(text, timestamptz) to service_role;
