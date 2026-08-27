-- 098 — LE DROIT D'ÉCRIRE LA COUVERTURE, ET SON PROPRE CODE D'ERREUR.
--
-- Deux défauts de la 097, tous deux trouvés PAR EXÉCUTION et non par relecture.
-- Ils sont corrigés ici plutôt que dans la 097 : une migration appliquée ne se
-- rouvre jamais, sinon les environnements divergent en silence.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. LE PRIVILÈGE DE COLONNE — la 097 rendait `order_media` NON INSERTIBLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ AJOUTER UNE COLONNE À UNE TABLE DONT LES DROITS SONT PAR COLONNE CASSE
-- L'INSERTION ENTIÈRE. Les droits d'`order_media` sont énumérés colonne par
-- colonne depuis la 014 — c'est ce qui empêche un vendeur de réécrire `cle` ou
-- `taille_octets`, donc de désigner le média d'un autre ou de fausser le modèle
-- de coût. La colonne née à la 097 n'était accordée à personne, et Postgres
-- refuse un INSERT dès qu'UNE colonne citée n'est pas accordée.
--
-- LE SYMPTÔME NE RESSEMBLE PAS À LA CAUSE : `42501 permission denied for table
-- order_media`, sur une table dont le vendeur possède manifestement les lignes.
-- Rien ne nomme la colonne fautive. Douze tests de dépôt sont passés au rouge
-- d'un coup — c'est ce qui a rendu le diagnostic rapide ; en production, ç'aurait
-- été « je n'arrive plus à ajouter mes photos ».
--
-- SEULEMENT `insert`, PAS `update`. La couverture est écrite UNE FOIS, par le
-- serveur, avec une clé qu'il dérive lui-même — comme `cle` et `taille_octets`,
-- volontairement absentes des droits d'UPDATE depuis la 014. Rien dans le
-- produit ne la réécrit ; lui accorder l'UPDATE serait un droit qu'aucun chemin
-- ne demande, c'est-à-dire une surface offerte pour rien.
grant insert (cle_couverture) on public.order_media to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. UN CODE D'ERREUR DÉSIGNE UN SEUL FAIT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 097 levait `DL040` pour « couverture non dérivée » — le code qui désignait
-- déjà « vignette non dérivée ». Ce sont DEUX faits : un appelant qui distingue
-- sur le code ne pourrait pas savoir laquelle des deux dérivées est en cause, et
-- le code fait partie du CONTRAT, jamais le message.
--
-- La suite `codes-erreur` l'a refusé immédiatement, et elle a raison : les
-- quatre collisions qu'elle avait déjà trouvées étaient toutes durables
-- précisément parce qu'aucune n'était atteignable par le même chemin. Celle-ci
-- l'était.
--
-- `create or replace` est sûr : fonction de déclencheur, liste d'arguments vide,
-- type de retour inchangé.
create or replace function public.verifier_cles_media()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_prefixe text;
begin
  select 'medias/' || s.id::text || '/' || o.id::text || '/'
    into v_prefixe
  from public.orders o
  join public.shops s on s.id = o.shop_id
  where o.id = new.order_id;

  if v_prefixe is null or position(v_prefixe in new.cle) <> 1 then
    raise exception 'cle hors du perimetre de la commande'
      using errcode = 'DL039';
  end if;

  if new.cle_vignette is not null
     and new.cle_vignette <> regexp_replace(new.cle, '\.[^./]+$', '') || '.vignette.webp' then
    raise exception 'vignette non derivee de la cle du media'
      using errcode = 'DL040';
  end if;

  if new.cle_couverture is not null
     and new.cle_couverture <> regexp_replace(new.cle, '\.[^./]+$', '') || '.couverture.webp' then
    raise exception 'couverture non derivee de la cle du media'
      using errcode = 'DL048';
  end if;

  return new;
end;
$$;

comment on function public.verifier_cles_media() is
  'Contrôle PAR VALEUR que les clés d''un média vivent sous le préfixe de sa commande, et que vignette et couverture sont dérivées EXACTEMENT comme cleVignette() et cleCouverture() les dérivent. Un code par fait : DL039 le périmètre, DL040 la vignette, DL048 la couverture.';

revoke all on function public.verifier_cles_media() from public;
