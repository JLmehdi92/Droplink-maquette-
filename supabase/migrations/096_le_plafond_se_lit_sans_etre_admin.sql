-- 096 — LE PLAFOND DE COMMANDES SE LIT SANS ÊTRE ADMINISTRATEUR.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT INTRODUIT PAR LA 095, ET ATTRAPÉ PAR LES PORTES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La 095 fait lire le plafond par `lire_parametre_entier`. Cette fonction est
-- RÉSERVÉE AUX ADMINISTRATEURS depuis la 057 : son corps lève `DL031` si
-- `est_admin()` est faux.
--
-- Le déclencheur, lui, s'exécute avec le rôle du VENDEUR qui insère. Résultat :
-- toute création de commande par un utilisateur normal échouait avec « erreur
-- introuvable » — c'est-à-dire que la 095, censée assouplir un plafond, avait
-- ramené le plafond effectif à ZÉRO pour tout le monde.
--
-- Ce n'est pas une régression subtile, c'est la fonctionnalité centrale du
-- produit. Elle a été trouvée en trente secondes par la suite RLS, qui insère
-- de vraies commandes sous de vrais utilisateurs authentifiés. Une relecture du
-- SQL ne pouvait pas la voir : le corps de la 095 est correct, l'appel est
-- correct, et rien dans le fichier ne dit que la fonction appelée porte une
-- garde. La propriété vit dans le corps d'une AUTRE migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI UNE FONCTION DÉDIÉE PLUTÔT QUE D'OUVRIR L'AUTRE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Retirer la garde de `lire_parametre_entier` rouvrirait exactement le défaut
-- que la 057 a fermé : elle prend une CLÉ EN ARGUMENT, donc ouverte à tous elle
-- laisse lire n'importe quel réglage — et la forme de sa réponse (elle lève sur
-- une valeur non entière, rend le défaut sur une clé absente) est un oracle
-- d'existence sur n'importe quelle clé devinée. La table est prévue pour
-- accueillir d'autres paramètres : la protection tiendrait à l'ABSENCE de
-- contenu sensible, ce qui n'est pas une protection.
--
-- Celle-ci ne prend AUCUN argument et ne rend qu'une seule valeur : le plafond
-- que le vendeur va de toute façon lire dans le message d'erreur s'il l'atteint.
-- Elle n'ouvre donc rien qui ne soit déjà visible.

create function public.lire_plafond_commandes()
  returns integer
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_valeur integer;
begin
  select (s.value #>> '{}')::int into v_valeur
  from public.system_settings s
  where s.key = 'plafond_commandes_mensuel';

  -- LE DÉFAUT EST ÉCRIT ICI ET NULLE PART EN BASE. Une clé absente signifie
  -- « personne n'a jamais décidé », ce qui est l'état normal du produit ;
  -- insérer le défaut au démarrage ferait croire qu'il a été choisi alors qu'il
  -- n'a été que subi, et l'écran d'administration ne pourrait plus distinguer
  -- les deux.
  return coalesce(v_valeur, 3000);
end;
$$;

comment on function public.lire_plafond_commandes() is
  'Le plafond mensuel de commandes, lisible par le déclencheur qui s''exécute avec le rôle du vendeur. Sans argument, à dessein : lire_parametre_entier prend une clé et reste réservée aux administrateurs, parce qu''ouverte elle laisserait lire n''importe quel réglage et servirait d''oracle d''existence sur n''importe quelle clé devinée.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin. `anon` n'insère aucune commande : lui laisser ce
-- droit n'apporterait rien et l'exposerait sur la surface non authentifiée.
revoke execute on function public.lire_plafond_commandes() from public, anon;
grant execute on function public.lire_plafond_commandes() to authenticated;

-- ── Le déclencheur passe par elle ────────────────────────────────────────────
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

  v_plafond := public.lire_plafond_commandes();

  if v_ce_mois >= v_plafond then
    -- LE MESSAGE PORTE LES DEUX NOMBRES. « Plafond atteint » sans le plafond
    -- oblige à aller lire la configuration pour savoir de combien on s'est
    -- trompé — exactement ce qu'un refus instrumenté doit éviter de demander.
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_ce_mois, v_plafond
      using errcode = 'DL035';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_commandes() is
  'Refuse une commande au-delà du plafond mensuel du compte. Le plafond vient de system_settings via lire_plafond_commandes, avec 3000 pour défaut. Il était en dur : le seul seuil capable de refuser une écriture était le seul qu''on ne pouvait pas bouger sans migration.';
