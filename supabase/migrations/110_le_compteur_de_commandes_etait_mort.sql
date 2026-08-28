-- 110 — `usage_counters.orders_created` n'a JAMAIS été écrit.
--
-- DÉFAUT TROUVÉ EN PILOTANT LE PANNEAU : sept commandes créées dans le mois, et
-- la carte affichait 0. La colonne est née avec la 046, a reçu une contrainte de
-- positivité en 064 — donc quelqu'un l'a relue et l'a crue vivante — et aucune
-- migration ne l'incrémente. Elle valait zéro depuis le premier jour.
--
-- CE QUE ÇA COÛTAIT. C'est le compteur mensuel de la seule métrique de verdict
-- de la phase de validation : « un fournisseur crée plus de 15 commandes en une
-- semaine sans relance ». Un compteur branché après coup démarre avec un
-- historique vide, donc inexploitable au moment précis où il faut décider — et
-- celui-ci se présentait comme branché. Un zéro crédible est pire qu'une
-- absence : il ne fait chercher personne.
--
-- POURQUOI IL A SURVÉCU. La 049 compte bien la même transition, mais dans
-- `shops.commandes_reelles`, un CUMUL sans mois. Les deux chiffres se
-- ressemblent assez pour qu'on lise l'un en croyant vérifier l'autre.
--
-- ON COMPTE LA TRANSITION, PAS LA LIGNE. `first_content_at` passant de nul à non
-- nul est la définition que le produit donne d'une commande créée : un brouillon
-- ouvert puis abandonné est exactement le cas « teste une ou deux fois puis
-- disparaît », et le compter gonflerait la métrique du côté rassurant.
--
-- LA SUPPRESSION NE DÉCRÉMENTE PAS, contrairement à `shops.commandes_reelles`.
-- Ce compteur-ci dit combien de commandes ont été CRÉÉES dans le mois, pas
-- combien existent : une création a bien eu lieu, et l'effacer réécrirait le
-- passé. C'est le même raisonnement que `parcels_registered`, qui ne redescend
-- pas non plus.

create function public.compter_commande_du_mois()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  -- Rien à compter tant que la commande n'a pas de contenu réel.
  if new.first_content_at is null then
    return new;
  end if;

  -- ON OUVRE SUR L'OPÉRATION AVANT DE TOUCHER À `OLD` : `OLD` n'existe que sur
  -- UPDATE et DELETE, et le lire ailleurs annule l'insertion entière. Le piège
  -- a déjà mordu en 088.
  if tg_op = 'UPDATE' and old.first_content_at is not null then
    return new;
  end if;

  select s.owner_id into v_profil from public.shops s where s.id = new.shop_id;
  if v_profil is null then
    return new;
  end if;

  -- LE MOIS EST CELUI DU PREMIER CONTENU, pas celui de la mise à jour : une
  -- commande créée le 31 et complétée le 1er appartient au mois où elle est
  -- devenue réelle.
  insert into public.usage_counters (profile_id, period_month, orders_created)
  values (v_profil, date_trunc('month', new.first_content_at)::date, 1)
  on conflict (profile_id, period_month) do update
    set orders_created = public.usage_counters.orders_created + 1,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.compter_commande_du_mois() from public;

comment on function public.compter_commande_du_mois() is
  'Compte une commande devenue réelle, UNE SEULE FOIS, dans le mois de son '
  'premier contenu. Ne décrémente pas : une création a eu lieu.';

create trigger orders_compter_commande_du_mois
  after insert or update of first_content_at on public.orders
  for each row execute function public.compter_commande_du_mois();

-- RATTRAPAGE DE L'HISTORIQUE EXISTANT.
--
-- Sans lui, le compteur ne dirait la vérité que sur les commandes à venir,
-- et l'écran afficherait un chiffre plus petit que la réalité — exactement le
-- biais rassurant qu'on vient de corriger. `set` et non `+` : les lignes valent
-- toutes zéro puisque rien ne les a jamais écrites, et une addition rendrait
-- cette migration dangereuse si elle était rejouée.
insert into public.usage_counters (profile_id, period_month, orders_created)
select s.owner_id, date_trunc('month', o.first_content_at)::date, count(*)
  from public.orders o
  join public.shops s on s.id = o.shop_id
 where o.first_content_at is not null
 group by s.owner_id, date_trunc('month', o.first_content_at)::date
on conflict (profile_id, period_month) do update
  set orders_created = excluded.orders_created,
      updated_at = now();
