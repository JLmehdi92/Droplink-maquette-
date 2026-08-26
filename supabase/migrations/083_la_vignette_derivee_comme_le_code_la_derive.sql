-- 083 — LA BASE ET LE CODE NE S'ACCORDAIENT PAS SUR LA CLÉ D'UNE VIGNETTE.
--
-- SYMPTÔME, VU PAR UN VENDEUR : « Enregistrement impossible. » sur CHAQUE photo
-- déposée. Onze photos, onze refus. Le dépôt aboutissait pourtant — l'objet et
-- sa vignette arrivaient bien dans le stockage — et c'est l'écriture en base qui
-- refusait, avec DL040.
--
-- LES DEUX RÈGLES, CÔTE À CÔTE :
--
--   `cleVignette()` (code)  ->  medias/…/abc.vignette.webp
--   migration 055 (base)    ->  medias/…/abc.jpg.vignette.webp
--
-- Le code RETIRE l'extension du média avant d'ajouter la sienne ; la 055 exigeait
-- `cle || '.vignette.webp'`, donc la conservait. Les deux dérivent bien la clé
-- de celle du média — l'intention était la même — mais pas de la même façon, et
-- il suffit d'un point pour que le déclencheur refuse.
--
-- COMMENT C'EST ARRIVÉ, ET C'EST LE MOTIF QUI COMPTE. La 055 a été écrite
-- pendant l'audit de sécurité, pour fermer un chemin réel : une vignette dont le
-- client choisirait l'emplacement pouvait écraser le média d'un autre. La règle
-- était juste, la garde nécessaire — mais elle a été écrite en regardant la
-- FORME qu'on voulait interdire, sans être confrontée à la fonction qui produit
-- la forme légitime. Un garde écrit après coup hérite du champ de vision de la
-- correction, pas du produit.
--
-- ET LE TEST NE POUVAIT PAS LE VOIR : `cles-medias.test.ts` construisait ses
-- clés À LA MAIN, en recopiant la règle de la migration. Il éprouvait donc la
-- base contre une copie d'elle-même. Deux sources qui se citent l'une l'autre ne
-- se contredisent jamais. Il emploie désormais `cleVignette()`.
--
-- C'EST LA BASE QUI S'ALIGNE SUR LE CODE, et non l'inverse : les objets déjà
-- déposés dans le stockage portent la forme du code. Changer le code
-- obligerait à les renommer, c'est-à-dire à faire dépendre une correction de
-- schéma d'une migration d'objets — pour un choix qui, sur le fond, est
-- indifférent.

create or replace function public.verifier_cles_media()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_prefixe text;
begin
  v_prefixe := public.prefixe_media_attendu(new.order_id);

  -- La commande a disparu entre-temps : la clé étrangère refusera de toute
  -- façon. On ne devine pas un préfixe, on laisse la contrainte parler.
  if v_prefixe is null then
    return new;
  end if;

  if position(v_prefixe in new.cle) <> 1 then
    raise exception 'cle hors du perimetre de la commande'
      using errcode = 'DL039';
  end if;

  /*
   * LA VIGNETTE RESTE DÉRIVÉE, PAS LIBRE — c'est tout l'intérêt de ce contrôle,
   * et il ne bouge pas : une vignette dont le client choisirait l'emplacement
   * pourrait écraser le média d'un autre, par l'UPDATE comme par l'INSERT.
   *
   * Seule change la DÉRIVATION, qui est maintenant celle de `cleVignette()` :
   * l'extension du média est retirée avant que la sienne soit ajoutée. La
   * règle reste exacte — pour une clé de média donnée, il n'existe qu'une seule
   * clé de vignette acceptable.
   */
  if new.cle_vignette is not null
     and new.cle_vignette <> regexp_replace(new.cle, '\.[^./]+$', '') || '.vignette.webp' then
    raise exception 'vignette non derivee de la cle du media'
      using errcode = 'DL040';
  end if;

  return new;
end;
$$;

comment on function public.verifier_cles_media() is
  'Contrôle PAR VALEUR que les clés d''un média vivent sous le préfixe de sa commande, et que la vignette est dérivée EXACTEMENT comme cleVignette() la dérive.';

revoke all on function public.verifier_cles_media() from public;
