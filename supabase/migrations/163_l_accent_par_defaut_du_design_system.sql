-- =============================================================================
-- 163 — LA COULEUR D'ACCENT PAR DÉFAUT EST CELLE DU DESIGN SYSTEM
-- =============================================================================
--
-- La 100 posait `default '#7c5cf5'`, relevé dans le canevas Claude Design.
-- Ce canevas n'est plus la référence depuis le 11/09/2026 (décision de Wassim) :
-- le design system le remplace, et il déclare `primary: "#5B4BF5"` comme couleur
-- du vendeur sur les DEUX planches qui la montrent — Ma marque et la page client.
-- Relevé le 14/09/2026 en cherchant les valeurs mortes dans le code : le produit
-- servait l'ancien violet à tout vendeur qui n'avait rien configuré, c'est-à-dire
-- aux tout premiers clients du produit, et aucune sonde ne pouvait le voir — le
-- jeu de mesure prend lui aussi le défaut de la colonne.
--
-- ⚠️ AUCUNE LIGNE EXISTANTE N'EST RÉÉCRITE, pour la même raison que la 100 : la
-- valeur stockée fait foi et n'est jamais réécrite. Un vendeur né avant cette
-- migration garde `#7c5cf5` tant qu'il ne change pas sa couleur ; les pages déjà
-- envoyées à ses clients ne changent pas sous leurs yeux.
--
-- Le changement vaut pour les boutiques créées APRÈS son application.

alter table public.shops
  alter column accent_color set default '#5B4BF5';

comment on column public.shops.accent_color is
  'Couleur de marque du vendeur. Défaut #5B4BF5, celui du design system. '
  'Non nulle : aucun état « non configurée » n''existe, la valeur stockée fait foi '
  'et n''est jamais réécrite.';
