-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE BUDGET DE SUIVI DEVIENT LISIBLE — décision de Wassim, 20/09/2026       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- « a chaque quota utilisé sur notre compte 17track jpense en vrai, et quand
-- y'aura énormément de gens sur le saas on réduira a 50 dans le quota restant »
--
-- ── CE QUE CE BUDGET A DE PARTICULIER ──────────────────────────────────────
--
-- Le fournisseur de suivi facture À LA PRISE EN CHARGE, et le palier gratuit
-- en donne **200 À VIE** — pas par mois, pas par compte : 200 pour TOUT le
-- produit, une seule fois. Il en reste 191. Quand elles seront dépensées, le
-- suivi automatique s'arrêtera : c'est la deuxième des trois features qui font
-- la différence, et son extinction ne produirait AUCUNE erreur. Les colis
-- cesseraient simplement d'avancer, et on l'apprendrait par un client qui se
-- plaint à son vendeur.
--
-- ⚠️ ET AUCUN PLAFOND EXISTANT NE LE PROTÈGE. `plafond_commandes_mensuel` (095)
-- et le plafond de colis (125) bornent UN COMPTE. Le budget, lui, est GLOBAL :
-- dix comptes parfaitement dans les clous l'épuisent sans qu'aucun garde ne
-- s'oppose à rien. Un seuil par compte ne peut pas voir une somme.
--
-- ── CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS ─────────────────
--
-- Elle rend le budget LISIBLE. Elle ne refuse rien : aucune prise en charge
-- n'est bloquée ici. Refuser serait une décision produit — couper le suivi de
-- tout le monde pour préserver un solde — et Wassim ne l'a pas prise. Ce qu'il
-- a demandé est un SIGNAL, à chaque unité dépensée. On code le signal, pas la
-- décision qui n'a pas été prise.

-- ── 1. Le total entre dans l'inventaire fermé des réglages ──────────────────
--
-- `system_settings` accepte n'importe quelle clé : écrire `budget_suivi` au
-- lieu de `budget_suivi_total` créerait une ligne valide, tracée, affichée — et
-- que rien ne lirait jamais. `parametres_admis` est l'inventaire fermé avec ses
-- bornes, lu par `ecrire_parametre`.
insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'budget_suivi_total',
    0,
    1000000,
    'Le nombre TOTAL de prises en charge que le palier du fournisseur autorise, '
    'sur la vie du compte. Minimum 0 : un palier épuisé est un état réel, et le '
    'réglage doit pouvoir le dire plutôt que de mentir avec un 1. Maximum '
    '1 000 000 : au-delà, la notion de budget ne borne plus rien et l''alerte '
    'ne pourrait plus se déclencher — un garde qui ne peut pas se déclencher '
    'est un garde qu''on croit avoir.'
  );

-- ── 2. L'état du budget, en une lecture ─────────────────────────────────────
--
-- `registered_at is not null` EST la définition d'une unité dépensée : c'est la
-- colonne que `marquer_prise_en_charge` pose au moment exact où le fournisseur
-- a accepté le numéro. Compter autre chose — les colis, les commandes avec un
-- numéro — compterait ce qu'on n'a pas payé.
create function public.etat_budget_suivi()
  returns table (utilisees bigint, total integer, restantes integer)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_utilisees bigint;
  v_total integer;
begin
  select count(*) into v_utilisees
  from public.tracked_parcels
  where registered_at is not null;

  -- LE DÉFAUT EST ÉCRIT ICI ET NULLE PART EN BASE, comme pour le plafond de
  -- commandes (096) : une clé absente signifie « personne n'a jamais décidé »,
  -- et c'est l'état normal du produit. L'insérer au démarrage ferait croire
  -- qu'il a été choisi alors qu'il n'a été que subi.
  select (s.value #>> '{}')::int into v_total
  from public.system_settings s
  where s.key = 'budget_suivi_total';

  v_total := coalesce(v_total, 200);

  return query select
    v_utilisees,
    v_total,
    -- `greatest(…, 0)` : si le palier est revu à la baisse alors qu'on a déjà
    -- dépensé davantage, « restantes » doit dire zéro, jamais un négatif. Un
    -- nombre négatif se lirait comme un crédit dans un message d'alerte.
    greatest(v_total - v_utilisees, 0)::integer;
end;
$$;

comment on function public.etat_budget_suivi() is
  'Utilisées / total / restantes du budget de prises en charge du fournisseur de suivi. Compte les tracked_parcels dont registered_at est posée : c''est la colonne écrite à l''instant où le fournisseur accepte le numéro, donc la seule qui compte ce qui a réellement été payé. Ne refuse rien — elle rend un état, l''appelant en fait une alerte.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin.
--
-- `service_role` SEUL, et c'est un choix : l'appelant est la prise en charge,
-- c'est-à-dire un chemin SANS HUMAIN. Ni `anon` ni `authenticated` n'ont à
-- connaître le solde d'un palier commercial — pour un vendeur c'est une
-- information sur notre exploitation, pas sur sa boutique, et elle dirait à qui
-- la lit combien de colis le produit entier a suivis.
revoke execute on function public.etat_budget_suivi() from public, anon, authenticated;
grant execute on function public.etat_budget_suivi() to service_role;
