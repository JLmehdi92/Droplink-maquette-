-- 095 — LE PLAFOND MENSUEL DE COMMANDES SORT DU CORPS DE LA FONCTION.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE PROBLÈME
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `verifier_plafond_commandes` portait `3000` EN DUR dans son corps. C'est le
-- seul seuil du produit capable de REFUSER une écriture à un utilisateur
-- légitime, et c'était le seul qu'on ne pouvait pas changer sans migration.
--
-- Le jour où un fournisseur le heurte, il ne voit pas un avertissement : sa
-- commande n'est pas créée. Devoir écrire, relire, appliquer et déployer une
-- migration pour le débloquer, c'est mesurer le délai en heures là où la table
-- `system_settings` le mesure en secondes — et un seuil qu'on ne peut pas
-- bouger vite est un seuil qu'on finit par retirer.
--
-- REPÈRE CHIFFRÉ : à 200 commandes par semaine — le persona fournisseur du
-- brief — un compte en crée environ 870 par mois. La marge est donc de 3,4×.
-- Le plafond n'est pas là pour brider l'usage normal, il est là pour qu'un
-- emballement (script, boucle, import) coûte une erreur et non une facture.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI PASSER PAR `parametres_admis` ET NON PAR `system_settings` SEULE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `system_settings` accepte N'IMPORTE QUELLE clé. Une valeur qui a la FORME
-- d'une configuration franchit toutes les validations de présence : écrire
-- `plafond_commandes` au lieu de `plafond_commandes_mensuel` créerait une ligne
-- parfaitement valide, tracée, affichée — et que rien ne lirait jamais.
--
-- `parametres_admis` est l'inventaire FERMÉ, avec ses bornes, lu par
-- `ecrire_parametre`. Les bornes n'ont vécu qu'en TypeScript jusqu'à la 087 :
-- un admin appelant la RPC hors du formulaire écrivait n'importe quelle clé,
-- hors bornes. Elles vivent en base depuis, et cette entrée les respecte.

insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'plafond_commandes_mensuel',
    100,
    100000,
    'Minimum 100 et non 1 : le revendeur type du brief crée 20 à 80 commandes '
    'par mois, donc un plafond sous 100 refuserait des écritures à un compte '
    'parfaitement normal — et le vendeur l''apprendrait par son client. '
    'Maximum 100 000 : au-delà le plafond ne borne plus rien, et un garde qui '
    'ne peut pas se déclencher est un garde qu''on croit avoir.'
  );

-- ── La fonction lit désormais le paramètre ───────────────────────────────────
--
-- `create or replace` : la liste d'arguments d'une fonction de déclencheur est
-- vide et le reste. Le type de retour ne change pas non plus. C'est bien le seul
-- cas où le remplacement est sûr — ailleurs, Postgres créerait une SECONDE
-- fonction et un appel résoudrait l'ancienne sans la moindre erreur.
--
-- LE DÉFAUT RESTE ÉCRIT DANS L'APPEL, jamais inséré en base. Une clé absente
-- signifie « jamais décidé », ce qui est l'état normal du produit ; insérer les
-- défauts au démarrage ferait croire qu'ils ont été choisis alors qu'ils n'ont
-- été que subis, et l'écran d'administration ne pourrait plus distinguer les
-- deux.
create or replace function public.verifier_plafond_commandes()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_ce_mois integer;
  v_plafond integer;
begin
  -- Le décompte s'appuie sur l'index `(shop_id, created_at)` posé pour le
  -- dashboard. Il porte sur le MOIS COURANT, jamais sur tout l'historique : un
  -- compte ancien et légitime ne doit pas se retrouver bloqué par son passé.
  select count(*) into v_ce_mois
  from public.orders
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  v_plafond := public.lire_parametre_entier('plafond_commandes_mensuel', 3000);

  if v_ce_mois >= v_plafond then
    -- LE MESSAGE PORTE LES DEUX NOMBRES, et c'est délibéré. « Plafond atteint »
    -- sans le plafond oblige à aller lire la configuration pour savoir de
    -- combien on s'est trompé — exactement ce qu'un refus instrumenté doit
    -- éviter de demander.
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_ce_mois, v_plafond
      using errcode = 'DL035';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_commandes() is
  'Refuse une commande au-delà du plafond mensuel du compte. Le plafond vient de system_settings via lire_parametre_entier, avec 3000 pour défaut : il était en dur, donc le seul seuil capable de refuser une écriture était le seul qu''on ne pouvait pas bouger sans migration.';
