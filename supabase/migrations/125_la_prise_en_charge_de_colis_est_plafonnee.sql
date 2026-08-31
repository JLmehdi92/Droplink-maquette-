-- ═══════════════════════════════════════════════════════════════════════════
-- LA PRISE EN CHARGE DE COLIS EST PLAFONNÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ LE 31/08/2026. `tracked_parcels` ne portait que deux
-- déclencheurs — `tracked_parcels_compter_prise_en_charge` et
-- `tracked_parcels_updated_at` — et AUCUN plafond. Or c'est la seule opération
-- PAYANTE du produit :
--
--     colis neuf → prendreEnCharge → /register chez le fournisseur → 1 quota
--
-- Et le palier gratuit du fournisseur n'est plus mensuel : **200 prises en
-- charge, une seule fois**. Le budget de suivi n'est donc pas par compte, il est
-- COMMUN à tout le produit.
--
-- ── LE VECTEUR N'EST PAS LE VOLUME, C'EST LE BATTEMENT ─────────────────────
--
-- `attacher_colis` (migration 032) détache l'ancien colis puis insère le
-- nouveau. Changer le numéro de suivi N fois SUR UNE SEULE COMMANDE crée donc N
-- colis, chacun avec `registered_at is null` — c'est-à-dire chacun repris par la
-- cadence. Un compte, une commande, une sauvegarde automatique toutes les 800 ms
-- suffisaient à épuiser le budget de tout le monde.
--
-- La fonction étant accordée à `authenticated`, elle est de surcroît appelable
-- directement en PostgREST, hors de l'application et donc hors de la limitation
-- de débit, qui vit dans nos chemins applicatifs.
--
-- ── LE PLAFOND RETENU, ET POURQUOI CELUI-LÀ ────────────────────────────────
--
-- **Deux fois le plafond mensuel de commandes**, lu par `lire_plafond_commandes`
-- — le réglage qui existe déjà, borné en base depuis la 087 et modifiable par
-- l'administration depuis la 095.
--
-- Un colis correspond à une commande : `attacher_colis` en garde un seul à la
-- fois par commande. Le facteur 2 laisse donc UNE correction de numéro de suivi
-- sur CHAQUE commande du mois — largement au-delà de l'usage réel — tout en
-- rendant le battement impossible. Un fournisseur à 200 commandes/semaine, soit
-- ~800/mois, reste très en dessous : le plafond de commandes vaut 3 000 par
-- défaut, donc 6 000 colis.
--
-- Aucun paramètre nouveau n'est introduit. Un réglage de plus est une surface de
-- plus, et celui-ci n'aurait aucune raison d'être bougé indépendamment de son
-- aîné : c'est la même volumétrie, vue deux fois.
--
-- ── LE REFUS PORTE SES DEUX NOMBRES ────────────────────────────────────────
--
-- « Plafond atteint » sans le plafond oblige à aller lire la configuration pour
-- savoir de combien on s'est trompé — exactement ce qu'un refus instrumenté
-- doit éviter de demander. Même forme que `verifier_plafond_commandes` (096).

create function public.verifier_plafond_colis()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_ce_mois integer;
  v_plafond integer;
begin
  -- Le décompte porte sur le MOIS COURANT, jamais sur tout l'historique : un
  -- compte ancien et légitime ne doit pas se retrouver bloqué par son passé. Le
  -- préfixe `shop_id` de l'unicité `(shop_id, tracking_number)` sert le filtre.
  select count(*) into v_ce_mois
  from public.tracked_parcels
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  -- MÊME SOURCE QUE LE PLAFOND DE COMMANDES, doublée. La fonction est lisible
  -- par le rôle du vendeur (migration 096) précisément pour qu'un déclencheur
  -- comme celui-ci puisse s'en servir sans être administrateur.
  v_plafond := public.lire_plafond_commandes() * 2;

  if v_ce_mois >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_ce_mois, v_plafond
      using errcode = 'DL051';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà de deux fois le plafond mensuel de commandes du compte. La prise en charge est la seule opération payante du produit, et le palier gratuit du fournisseur est COMMUN à tous les comptes : sans ce plafond, un seul compte épuisait le budget de suivi de tout le monde en changeant le numéro de suivi d''une même commande en boucle.';

revoke all on function public.verifier_plafond_colis() from public;

create trigger tracked_parcels_plafond
  before insert on public.tracked_parcels
  for each row execute function public.verifier_plafond_colis();
