-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE QUOTA GRATUIT SE LIT SANS DROITS SUR LA TABLE DES RÉGLAGES            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DÉFAUT RÉEL DE LA MIGRATION 175, TROUVÉ PAR SON PROPRE TEST, LE MÊME JOUR.
--
-- La 175 lisait `system_settings` DIRECTEMENT depuis `verifier_plafond_commandes`.
-- Or ce déclencheur n'est pas `security definer` : il s'exécute avec le rôle de
-- l'APPELANT, c'est-à-dire `authenticated`, qui n'a aucun droit sur cette table.
-- Résultat mesuré : toute création de commande échouait en
-- `42501 permission denied for table system_settings` — y compris la PREMIÈRE,
-- donc le produit entier était inutilisable pour un compte gratuit.
--
-- C'est exactement la raison d'être de `lire_plafond_commandes()` (096), dont le
-- commentaire le dit mot pour mot : « lisible par le déclencheur qui s'exécute
-- avec le rôle du vendeur ». J'avais le motif sous les yeux et j'ai lu la table
-- en direct.
--
-- CE QUI L'A ATTRAPÉ : un test qui crée de VRAIES commandes avec une VRAIE
-- session, et qui exige de voir les quinze premières PASSER avant de voir la
-- seizième être refusée. Un test qui n'aurait vérifié que le refus serait passé
-- au vert sur un produit qui refusait TOUT — le contre-test positif n'est pas
-- une politesse, c'est lui qui a fait la différence ici.
--
-- LA 175 N'EST PAS ROUVERTE : elle est appliquée, donc le correctif est une
-- migration NEUVE. L'ordre lexicographique doit être l'ordre d'application.

-- ── 1. Une lecture que le rôle du vendeur peut faire ────────────────────────
--
-- Même forme que `lire_plafond_commandes()` (096), et pour la même raison. Sans
-- argument, à dessein : `lire_parametre_entier` prend une clé et reste réservée
-- aux administrateurs — ouverte, elle laisserait lire n'importe quel réglage et
-- servirait d'oracle d'existence sur n'importe quelle clé devinée.
create function public.lire_plafond_gratuit_a_vie()
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
  where s.key = 'plafond_commandes_gratuit_a_vie';

  -- Le défaut vit ici et nulle part en base : une clé absente signifie
  -- « personne n'a jamais décidé », ce qui est l'état normal du produit.
  return coalesce(v_valeur, 15);
end;
$$;

comment on function public.lire_plafond_gratuit_a_vie() is
  'Le nombre total de commandes qu''un compte gratuit peut créer sur sa vie, lisible par le déclencheur qui s''exécute avec le rôle du vendeur. Sans elle, le déclencheur lirait system_settings en direct — ce que authenticated n''a pas le droit de faire, et toute création de commande échouait en 42501.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin. `anon` ne crée aucune commande.
revoke execute on function public.lire_plafond_gratuit_a_vie() from public, anon;
grant execute on function public.lire_plafond_gratuit_a_vie() to authenticated;

-- ── 2. Le déclencheur passe par elle ────────────────────────────────────────
--
-- `create or replace` reste sûr : fonction de déclencheur, liste d'arguments
-- vide, type de retour inchangé.
create or replace function public.verifier_plafond_commandes()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_plan public.account_plan;
  v_compte integer;
  v_plafond integer;
begin
  -- LE PLAN SE LIT PAR LA BOUTIQUE, jamais par l'appelant : une commande est
  -- créée pour un `shop_id`, et c'est le propriétaire de CETTE boutique dont le
  -- plan décide.
  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  -- Boutique introuvable : ce n'est pas à ce déclencheur de le dire. La clé
  -- étrangère refusera l'insertion avec un message qui nomme la vraie cause.
  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE : tout l'historique de la boutique, sans borne de date. Un plafond
    -- mensuel se contourne en attendant ; celui-ci se contourne en recréant un
    -- compte, ce qui laisse une trace que l'administration voit (170-171).
    select count(*) into v_compte
    from public.orders
    where shop_id = new.shop_id;

    v_plafond := public.lire_plafond_gratuit_a_vie();

    if v_compte >= v_plafond then
      -- LE MESSAGE PORTE LES DEUX NOMBRES ET LA NATURE DU QUOTA. Sans « à vie »,
      -- le vendeur attendrait le mois suivant — indéfiniment.
      raise exception
        'Quota du compte gratuit atteint : % commandes sur % au total. Ce quota est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL067';
    end if;

    return new;
  end if;

  -- Compte `pro` : le plafond MENSUEL d'avant, inchangé — un abonnement se
  -- renouvelle, donc un quota à vie en ferait un achat unique.
  select count(*) into v_compte
  from public.orders
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de commandes atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL035';
  end if;

  return new;
end;
$$;
