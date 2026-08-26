-- ═══════════════════════════════════════════════════════════════════════════
-- LA BASE EXIGE LA MÊME FORME DE CLÉ QUE LE CODE QUI SIGNE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DIVERGENCE TROUVÉE LE 26/08/2026, en corrigeant la traversée de chemin.
--
-- Le déclencheur de la migration 055 vérifie que `order_media.cle` COMMENCE par
-- `medias/{shop}/{commande}/`. C'est ce qui empêche d'attribuer à une commande
-- un objet rangé ailleurs, et c'est juste.
--
-- Mais depuis la correction du 26/08, `lib/storage/cles.ts` exige la forme
-- COMPLÈTE — trois UUID et une extension de la table fermée — avant de signer
-- quoi que ce soit. Les deux ne disaient donc pas la même chose : une clé comme
--
--     medias/{shop}/{commande}/pub.jpg
--
-- était ACCEPTÉE À L'ÉCRITURE et REFUSÉE À LA SIGNATURE. Le média serait
-- enregistré, visible dans le dashboard, compté dans les plafonds — et
-- invisible sur la page du client, sans message, parce que la signature échoue
-- et que l'appelant convertit l'échec en « pas d'URL ».
--
-- CE N'EST PAS UNE FAILLE : rien ne fuit, le refus est fermé. C'est une
-- DIVERGENCE, et le mode de défaillance est celui que ce produit redoute le
-- plus — tout paraît fonctionner côté vendeur, et le client ne voit rien.
--
-- AUCUN CHEMIN DU PRODUIT NE PRODUIT UNE TELLE CLÉ : `cleMedia()` n'assemble
-- que des UUID validés. Ce qui l'a révélée est un test qui forgeait sa clé à la
-- main — donc un chemin d'écriture que la base autorisait.
--
-- ÉTAT VÉRIFIÉ AVANT D'APPLIQUER : les 12 lignes d'`order_media` présentes en
-- base respectent déjà la forme complète, vignettes comprises. Ce resserrement
-- ne rejette aucune donnée existante.
--
-- POURQUOI EN BASE PLUTÔT QU'EN TYPESCRIPT SEULEMENT : « une règle applicative
-- peut être oubliée dans un nouveau chemin de code, une règle en base ne peut
-- pas l'être ». Le chemin oublié, ici, ce sont les écritures directes — reprise
-- de données, correction manuelle, test.
--
-- ⚠️ LES DEUX FORMES DOIVENT RESTER D'ACCORD, et ce fichier ne peut pas
-- l'imposer. C'est `tests/rls/cles-medias-forme.test.ts` qui compare la forme
-- de la base à celle du code, dans les deux sens.

-- ─────────────────────────────────────────────────────────────────────────────
-- La forme, écrite UNE FOIS, dans une fonction immuable.
--
-- Une fonction plutôt qu'une expression recopiée dans deux contraintes : la
-- recopie diverge, et c'est exactement le défaut qu'on corrige. `immutable`
-- parce qu'elle ne dépend que de son argument — c'est ce qui la rend utilisable
-- dans une contrainte `check`.
-- ─────────────────────────────────────────────────────────────────────────────

create function public.cle_media_canonique(p_cle text, p_vignette boolean)
  returns boolean
  language sql
  immutable
  set search_path = ''
as $$
  select p_cle ~ (
    '^medias/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || case when p_vignette then '[.]vignette[.]webp$'
            else '[.](avif|jpg|mov|mp4|png|webm|webp)$' end
  );
$$;

comment on function public.cle_media_canonique(text, boolean) is
  'La forme exacte des clés d''objet que le produit fabrique. Doit rester '
  'd''accord avec `exigerCleCanonique` dans lib/storage/cles.ts — une suite de '
  'tests compare les deux, dans les deux sens.';

-- ⚠️ `EXECUTE` EST ACCORDÉ À `authenticated`, ET C'EST OBLIGATOIRE.
--
-- PIÈGE RENCONTRÉ EN POSANT CETTE MIGRATION : une contrainte `CHECK` qui
-- appelle une fonction s'exécute avec les droits de CELUI QUI ÉCRIT, pas avec
-- ceux du propriétaire de la table. Révoquer `EXECUTE` à tout le monde — le
-- réflexe juste partout ailleurs dans ce dépôt, puisque Postgres l'accorde à
-- PUBLIC par défaut — rend donc la table INSERTABLE PAR PERSONNE.
--
-- Et le refus ne ressemble pas à ce qu'il est : PostgREST rend une erreur de
-- permission sur la fonction, pas sur la contrainte. Le symptôme observé était
-- « la commande n'a aucun média » trois écrans plus loin, sur un jeu de test
-- dont l'insertion échouait en silence.
--
-- `anon` n'en a pas besoin : il ne fait que LIRE la page publique, et une
-- contrainte `CHECK` ne s'évalue qu'à l'écriture.
revoke all on function public.cle_media_canonique(text, boolean) from public;
grant execute on function public.cle_media_canonique(text, boolean) to authenticated;

-- Les contraintes s'ajoutent SANS `not valid` : les lignes existantes ont été
-- vérifiées avant d'écrire cette migration, et une contrainte non validée
-- donnerait l'illusion d'une garantie qui ne couvre que le futur.
alter table public.order_media
  add constraint order_media_cle_canonique
  check (public.cle_media_canonique(cle, false));

alter table public.order_media
  add constraint order_media_cle_vignette_canonique
  check (cle_vignette is null or public.cle_media_canonique(cle_vignette, true));

comment on constraint order_media_cle_canonique on public.order_media is
  'La clé a exactement la forme que `cleMedia()` produit. Le déclencheur de la '
  '055 vérifie l''APPARTENANCE (le bon shop, la bonne commande) ; cette '
  'contrainte vérifie la FORME. Les deux sont nécessaires : l''une empêche '
  'd''attribuer l''objet d''un autre, l''autre empêche d''enregistrer une clé '
  'que le signeur refusera ensuite en silence.';
