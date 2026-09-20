-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE QUOTA D'UN COMPTE GRATUIT EST À VIE — décision de Wassim, 20/09/2026   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- « on va faire 15 commandes a vie sur un compte gratuit, si le compte gratuit
-- a plus ces 15 commandes il doit payer un abonnement pour que il obtien genre
-- 300 commandes pour l'abo a 20€ et ça sert a perdre moins contre les mec qui
-- vont re créer des comptes on sait jamais, je minimise la perte de euros »
--
-- ── POURQUOI « À VIE » ET NON « PAR MOIS » ─────────────────────────────────
--
-- Un plafond MENSUEL se contourne en attendant. Un plafond à vie se contourne
-- en recréant un compte — ce qui laisse une trace que l'administration voit
-- désormais (les comptes en doublon, migrations 170-171). Le premier
-- contournement est gratuit et invisible ; le second coûte un effort et se
-- repère. C'est tout le raisonnement de Wassim, et il calque celui de notre
-- propre fournisseur de suivi : son palier gratuit donne 200 prises en charge
-- À VIE, pas 200 par mois.
--
-- ⚠️ ET CE PLAFOND N'EST PAS UN PAIEMENT. Rien de ce fichier n'encaisse quoi
-- que ce soit : la contrainte n° 1 tient. Le plan est un ÉTAT DU COMPTE, posé
-- à la main dans l'administration après un paiement reçu HORS du produit —
-- exactement le mécanisme de la migration 167. Un compte `pro` retrouve le
-- plafond mensuel, dont la valeur se règle à l'écran : « 300 commandes pour
-- l'abo à 20 € » se pose donc sans une ligne de code, en écrivant 300 dans
-- `plafond_commandes_mensuel`.
--
-- ── CE QUE LE COMPTAGE À VIE NE COÛTE PAS ──────────────────────────────────
--
-- Le décompte mensuel s'appuyait sur `(shop_id, created_at)`. Celui-ci ne
-- porte que sur `shop_id`, donc le même index le sert, et mieux : il n'a plus
-- de borne de date à évaluer. À quinze lignes, la question ne se pose pas ; à
-- trois cents non plus.

-- ── 1. Le quota gratuit entre dans l'inventaire fermé ───────────────────────
insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'plafond_commandes_gratuit_a_vie',
    1,
    100000,
    'Le nombre TOTAL de commandes qu''un compte gratuit peut créer sur sa vie. '
    'Minimum 1 et non 0 : à zéro, un compte gratuit ne pourrait rien créer, '
    'donc l''inscription ouvrirait sur un produit inutilisable — et personne ne '
    'paierait pour un produit qu''il n''a pas pu essayer. Maximum 100 000 : '
    'au-delà le plafond ne borne plus rien, et un garde qui ne peut pas se '
    'déclencher est un garde qu''on croit avoir.'
  );

-- ── 2. Le plafond dépend désormais du PLAN ──────────────────────────────────
--
-- `create or replace` est sûr ICI et le resterait mal ailleurs : la liste
-- d'arguments d'une fonction de déclencheur est vide et le reste, le type de
-- retour ne change pas. Partout où la signature bouge, Postgres créerait une
-- SECONDE fonction et un appel résoudrait l'ancienne sans la moindre erreur.
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
  -- plan décide. Lire `auth.uid()` ici ferait dépendre le plafond de qui écrit
  -- plutôt que de qui possède — et les chemins système n'ont pas d'appelant.
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
    -- À VIE : tout l'historique de la boutique, sans borne de date.
    select count(*) into v_compte
    from public.orders
    where shop_id = new.shop_id;

    select (s.value #>> '{}')::int into v_plafond
    from public.system_settings s
    where s.key = 'plafond_commandes_gratuit_a_vie';

    -- Le défaut est écrit ici et nulle part en base : une clé absente signifie
    -- « personne n'a jamais décidé », et c'est l'état normal du produit.
    v_plafond := coalesce(v_plafond, 15);

    if v_compte >= v_plafond then
      -- LE MESSAGE PORTE LES DEUX NOMBRES ET LA SORTIE. « Plafond atteint »
      -- sans le plafond oblige à aller lire la configuration pour savoir de
      -- combien on s'est trompé ; sans la sortie, le vendeur ne sait pas qu'il
      -- en existe une, et c'est précisément ce que ce plafond doit lui dire.
      raise exception
        'Quota du compte gratuit atteint : % commandes sur % au total. Ce quota est à vie, il ne se recharge pas.',
        v_compte, v_plafond
        using errcode = 'DL067';
    end if;

    return new;
  end if;

  -- ── Compte `pro` : le plafond MENSUEL d'avant, inchangé ────────────────────
  --
  -- Il reste mensuel parce qu'un abonnement se renouvelle : un quota à vie sur
  -- un compte payant transformerait un abonnement en achat unique, ce qui est
  -- l'inverse de ce qui a été décidé.
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

comment on function public.verifier_plafond_commandes() is
  'Refuse une commande au-delà du quota du compte, ET LE QUOTA DÉPEND DU PLAN. Gratuit : un total À VIE (plafond_commandes_gratuit_a_vie, 15 par défaut), parce qu''un plafond mensuel se contourne en attendant. Pro : le plafond mensuel d''avant (plafond_commandes_mensuel), parce qu''un abonnement se renouvelle. Aucun paiement ne passe par le produit : le plan est un état du compte, posé à la main dans l''administration.';
