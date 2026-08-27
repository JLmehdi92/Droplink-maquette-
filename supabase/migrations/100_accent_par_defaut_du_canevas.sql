-- =============================================================================
-- 100 — LA COULEUR D'ACCENT PAR DÉFAUT EST CELLE DU CANEVAS
-- =============================================================================
--
-- La 001 posait `default '#0058be'`. Le canevas Claude Design, lui, déclare
-- `default:"#7c5cf5"` dans le script de la planche Marque, et offre `#0058be`
-- parmi les OPTIONS — c'est-à-dire comme une couleur qu'un vendeur peut
-- choisir, jamais comme celle qu'il reçoit sans rien choisir.
--
-- L'écart compte plus qu'il n'en a l'air. `shops` est créée à l'INSCRIPTION,
-- donc avant l'onboarding : un vendeur peut envoyer un lien sans avoir jamais
-- configuré sa boutique, et le brief dit que c'est le cas le plus fréquent au
-- début de vie d'un compte. La couleur par défaut n'est donc pas un repli
-- théorique — c'est la couleur que voient les premiers clients du produit.
--
-- ⚠️ CETTE MIGRATION NE TOUCHE AUCUNE LIGNE EXISTANTE, et c'est voulu.
-- `shops.accent_color` est NON NULLE avec défaut : il n'existe aucun état
-- « couleur non configurée » à rattraper, et le brief est explicite — la valeur
-- stockée fait foi, elle n'est JAMAIS réécrite. Un `update` ici changerait sous
-- ses yeux la couleur d'un vendeur qui a peut-être choisi #0058be exprès, et
-- les pages déjà envoyées à ses clients changeraient avec.
--
-- Le changement ne vaut donc que pour les shops créés APRÈS son application.

alter table public.shops
  alter column accent_color set default '#7c5cf5';

comment on column public.shops.accent_color is
  'Couleur de marque du vendeur. Défaut #7c5cf5, celui du canevas Claude Design. '
  'Non nulle : aucun état « non configurée » n''existe, la valeur stockée fait foi '
  'et n''est jamais réécrite.';
