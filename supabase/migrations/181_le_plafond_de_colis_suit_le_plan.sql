-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE PLAFOND DE COLIS SUIT LE PLAN — trou ouvert par la 176, le même jour  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DÉFAUT RÉEL, ET C'EST MOI QUI L'AI OUVERT EN CORRIGEANT AUTRE CHOSE.
--
-- La migration 125 borne les colis à « deux fois le plafond MENSUEL de
-- commandes » — 6 000 par défaut. Le raisonnement était juste : un colis par
-- commande, le facteur 2 laisse une correction de numéro de suivi sur chacune.
--
-- Puis la 176 a fait dépendre le quota de commandes du PLAN : un compte gratuit
-- a 15 commandes À VIE, et ne passe plus du tout par le plafond mensuel. Les
-- deux plafonds se sont désolidarisés SANS QUE RIEN NE LE DISE, et le second a
-- continué de rendre 6 000.
--
-- MESURÉ sur la base de tests : **60 colis créés sans un seul refus** par un
-- compte à 15 commandes à vie — et c'est la sonde qui s'est arrêtée, pas le
-- produit. Le vrai plafond était à 6 000, soit 400 fois son quota.
--
-- ⚠️ CE QUE ÇA COÛTAIT, ET POURQUOI C'EST LE PIRE ENDROIT POSSIBLE. La prise en
-- charge est le SEUL geste payant du produit, et le palier du fournisseur est
-- COMMUN à tous les comptes. Un vendeur gratuit qui change le numéro de suivi
-- de ses quinze commandes toutes les trente secondes épuise le budget de TOUT
-- LE MONDE en quelques minutes. Son quota de commandes ne l'arrête pas : il
-- compte des commandes, et la dépense porte sur des colis.
--
-- ── LA LEÇON, QUI VAUT PLUS QUE LE CORRECTIF ───────────────────────────────
--
-- Un plafond DÉRIVÉ d'un autre plafond hérite de ses hypothèses en silence. Le
-- jour où l'aîné change de nature — ici, de mensuel à « à vie », et de commun à
-- « par plan » —, le cadet continue de répondre comme avant, sans erreur, sans
-- avertissement, et sans que personne ne relise la dérivation. La 125 écrivait
-- « aucun paramètre nouveau n'est introduit […] c'est la même volumétrie, vue
-- deux fois » : c'était vrai, et ça a cessé de l'être.

create or replace function public.verifier_plafond_colis()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  v_plan    public.account_plan;
  v_compte  integer;
  v_plafond integer;
begin
  -- Le plan se lit par la BOUTIQUE, comme pour les commandes : un colis est
  -- créé pour un `shop_id`, et c'est le plan de son propriétaire qui décide.
  select p.plan into v_plan
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where s.id = new.shop_id;

  -- Boutique introuvable : ce n'est pas à ce déclencheur de le dire, la clé
  -- étrangère refusera avec un message qui nomme la vraie cause.
  if v_plan is null then
    return new;
  end if;

  if v_plan = 'gratuit' then
    -- À VIE, exactement comme son quota de commandes. Un plafond mensuel sur un
    -- compte dont le quota est à vie se contournerait en attendant le 1er du
    -- mois — et ce qu'on borne ici est une dépense qui, elle, ne se recharge pas.
    select count(*) into v_compte
    from public.tracked_parcels
    where shop_id = new.shop_id;

    -- Le facteur 2 est celui de la 125, et il garde sa raison : UNE correction
    -- de numéro de suivi sur CHAQUE commande.
    v_plafond := public.lire_plafond_gratuit_a_vie() * 2;

    if v_compte >= v_plafond then
      raise exception
        'Plafond de colis du compte gratuit atteint (% sur % au total). Ce plafond est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL070';
    end if;

    return new;
  end if;

  -- ── Compte `pro` : le plafond MENSUEL d'avant, inchangé ───────────────────
  select count(*) into v_compte
  from public.tracked_parcels
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  v_plafond := public.lire_plafond_commandes() * 2;

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL051';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà de deux fois le quota de commandes du compte, ET LE QUOTA DÉPEND DU PLAN. Gratuit : deux fois le quota À VIE (30 par défaut) — un plafond mensuel se contournerait en attendant, alors que la dépense qu''il borne ne se recharge pas. Pro : deux fois le plafond mensuel, inchangé. Le facteur 2 laisse UNE correction de numéro de suivi par commande. La prise en charge est le seul geste payant du produit et le palier du fournisseur est COMMUN à tous les comptes : sans ce plafond, un seul compte épuise le budget de tout le monde.';
