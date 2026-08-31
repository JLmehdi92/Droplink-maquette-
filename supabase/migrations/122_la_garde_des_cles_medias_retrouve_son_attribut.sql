-- ═══════════════════════════════════════════════════════════════════════════
-- LA GARDE DES CLÉS MÉDIAS RETROUVE SON ATTRIBUT DE SÉCURITÉ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, RELEVÉ DANS LE CATALOGUE LE 31/08/2026 :
--
--     select proname, prosecdef from pg_proc … where proname = 'verifier_cles_media';
--     → verifier_cles_media | prosecdef = FALSE
--
-- Ses trois versions précédentes — migrations 055, 078 et 083 — portaient
-- toutes `security definer`. La 097 l'a réécrite par `create or replace` et
-- l'attribut a disparu du texte. **`create or replace` REMPLACE l'attribut de
-- sécurité** : la fonction s'exécute depuis lors avec le rôle APPELANT.
--
-- C'est le seul des 144 `create function` du dépôt dont un attribut de sécurité
-- change sans être nommé. L'en-tête de la 097 argumente longuement que le
-- `create or replace` est sûr « sur les arguments et le type de retour » — deux
-- points sur trois.
--
-- ── CE QUI L'A SAUVÉ, ET POURQUOI ON LE RÉPARE QUAND MÊME ──────────────────
--
-- La 097 a en même temps remplacé l'appel à `prefixe_media_attendu()` (elle,
-- `security definer`) par une jointure directe `orders ⨝ shops`. Le seul chemin
-- d'insertion réel — `lib/commandes/medias.ts`, client à session — voit bien
-- ses deux lignes sous RLS. **Il n'y a donc pas de brèche aujourd'hui.**
--
-- Mais le SENS de la garde en dépend. Sur un chemin dont le rôle ne verrait pas
-- la commande, `v_prefixe` serait NULL et le déclencheur lèverait
-- « cle hors du perimetre de la commande » (DL039) — un message qui envoie
-- chercher une clé mal formée là où le vrai problème est un droit de lecture.
-- Une garde qui, privée de visibilité, accuse la donnée plutôt que de le dire,
-- est une garde qui fera perdre une journée à quelqu'un.
--
-- LE CORPS EST REPRIS DE `pg_get_functiondef`, à l'attribut près. Rien d'autre
-- ne change : ni les trois codes d'erreur, ni les dérivations, ni le
-- `search_path`.

create or replace function public.verifier_cles_media()
  returns trigger
  language plpgsql
  security definer
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
  'Refuse un média dont la clé sort du préfixe de sa commande, ou dont une dérivée n''est pas dérivée de cette clé. SECURITY DEFINER, restauré après que la migration 097 l''eut perdu par create or replace : sans lui, un appelant qui ne voit pas la commande obtient DL039 — un message qui accuse la clé alors que le problème est un droit de lecture.';

revoke all on function public.verifier_cles_media() from public;
