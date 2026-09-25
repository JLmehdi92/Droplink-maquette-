-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ EN PRO, LE PLAFOND DE COLIS VAUT CELUI DES COMMANDES — plus deux fois    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Décision de Wassim, 26/09/2026 : « dans le plan à 20 € par mois c'est 300
-- commandes par mois et 300 colis à suivre ». La 125 (reprise par la 181 puis
-- la 192) bornait les colis d'un compte Pro à DEUX FOIS son plafond mensuel de
-- commandes, pour laisser une correction de numéro sur chaque commande. La page
-- Tarifs et l'écran « Passer au Pro » annonçaient donc 600 colis pour 300
-- commandes — une offre que Wassim n'a pas faite.
--
-- Seule la ligne du Pro change. Le reste est la fonction de la 192 MOT POUR MOT
-- — le verrou consultatif avant le comptage compris —, parce qu'une fonction
-- réécrite de mémoire perdrait en silence ce qu'une migration précédente avait
-- corrigé. Le compte GRATUIT garde son facteur 2 (30 colis à vie pour 15
-- commandes) : la décision ne porte que sur le plan payant.
--
-- `create or replace` sans changement de signature : le déclencheur qui l'appelle
-- tient, et les droits aussi. `tests/rls/plafonds-par-compte.test.ts` l'éprouve
-- (plafond de commandes à 2 ⇒ 2 colis, le 3e refusé en DL051).

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
  -- ⚠️ LE VERROU AVANT LE COMPTAGE (192). Chaque ligne de trop est une prise en
  -- charge payante, sur un palier commun à tous les comptes.
  perform pg_advisory_xact_lock(hashtextextended('plafond-colis:' || new.shop_id::text, 0));

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

  -- ── Compte `pro` : le plafond MENSUEL, UNE FOIS celui des commandes (197) ──
  select count(*) into v_compte
  from public.tracked_parcels
  where shop_id = new.shop_id
    and created_at >= date_trunc('month', now());

  -- ⚠️ PLUS DE FACTEUR 2 EN PRO (197) : « 300 commandes par mois et 300 colis à
  -- suivre » — décision de Wassim, 26/09/2026.
  v_plafond := public.lire_plafond_commandes();

  if v_compte >= v_plafond then
    raise exception 'Plafond mensuel de colis atteint pour ce compte (% sur %).',
      v_compte, v_plafond
      using errcode = 'DL051';
  end if;

  return new;
end;
$$;

comment on function public.verifier_plafond_colis() is
  'Refuse la création d''un colis au-delà du quota du compte, ET LE QUOTA DÉPEND DU PLAN. Gratuit : deux fois le quota de commandes À VIE (30 par défaut), le facteur 2 laissant une correction de numéro par commande. Pro : UNE FOIS le plafond mensuel de commandes (197, décision de Wassim : 300 commandes et 300 colis). Un verrou consultatif par boutique, pris avant le comptage, empêche deux attaches simultanées de dépasser le plafond (192) — chaque ligne de trop serait une prise en charge payante sur un palier commun à tous les comptes.';
