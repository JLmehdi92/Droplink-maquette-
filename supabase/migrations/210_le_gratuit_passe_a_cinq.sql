-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE COMPTE GRATUIT PASSE À CINQ — 5 commandes et 5 colis suivis, à vie      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Décision de Mehdi, 30/09/2026 : « 5 suivis et 5 commandes ». Raison chiffrée :
-- le stock de prises en charge 17TRACK est COMMUN à tout le produit (~191 à vie).
-- À 15 colis par compte gratuit, 13 inscrits le vidaient — et le suivi
-- automatique s'arrêtait alors pour les clients Pro PAYANTS aussi. À 5, le stock
-- tient ~38 inscrits.
--
-- UN SEUL NOMBRE À CHANGER. Depuis la 201, le plafond de colis gratuit vaut UNE
-- FOIS le quota de commandes à vie : `verifier_plafond_colis` et
-- `mon_quota_colis_atteint` lisent tous deux `lire_plafond_gratuit_a_vie()`. En
-- baisser le défaut baisse les deux.
--
-- ⚠️ LE DÉFAUT VIT DANS LA FONCTION, pas en base (176 : « une clé absente
-- signifie personne n'a jamais décidé »). Mais un administrateur a pu RÉGLER la
-- valeur depuis l'écran des paramètres ; baisser le seul repli laisserait alors
-- ce réglage à 15 sans rien dire. La décision vaut pour tous : une valeur
-- réglée est ramenée à 5, au même titre que le défaut. L'administration peut
-- ensuite la changer comme avant (bornes 1 – 100 000, 175).
--
-- ⚠️ LES COMPTES EXISTANTS : la consommation n'est jamais réécrite (198). Un
-- compte gratuit qui a déjà créé 12 commandes ou suivi 12 colis les GARDE — ses
-- pages et ses suivis restent servis ; il ne peut simplement plus en ajouter.
--
-- `create or replace` et non `drop` : même signature, les droits (176 : revoke
-- public et anon, grant authenticated) et les appelants tiennent.

create or replace function public.lire_plafond_gratuit_a_vie()
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
  -- « personne n'a jamais décidé », ce qui est l'état normal du produit. 5 depuis
  -- la 210 (15 depuis la 176).
  return coalesce(v_valeur, 5);
end;
$$;

comment on function public.lire_plafond_gratuit_a_vie() is
  'Le nombre total de commandes qu''un compte gratuit peut créer sur sa vie — et, depuis la 201, de colis qu''il peut faire suivre. 5 par défaut depuis la 210 (décision de Mehdi, 30/09/2026 : le stock 17TRACK commun à tout le produit). Lisible par le déclencheur qui s''exécute avec le rôle du vendeur.';

-- Une valeur RÉGLÉE depuis l'administration suit la décision : sans cela, elle
-- resterait à 15 derrière un défaut passé à 5, et rien ne le dirait.
update public.system_settings
   set value = to_jsonb(5)
 where key = 'plafond_commandes_gratuit_a_vie';
