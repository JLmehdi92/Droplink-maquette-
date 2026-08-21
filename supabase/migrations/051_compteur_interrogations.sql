-- 051 — Compter les interrogations du fournisseur de suivi.
--
-- C'EST LE SEUL COÛT VARIABLE DU PRODUIT AVEC LE STOCKAGE, et le seul qu'un
-- tiers facture. Il n'était mesuré nulle part : `tracking_snapshots` porte une
-- ligne par interrogation, mais les compter à la lecture ferait suivre le coût
-- de l'écran au trafic total du produit — et cette table n'a d'index que par
-- colis, donc un décompte global la balaierait entièrement.
--
-- LE COMPTEUR VIT DANS `usage_counters`, avec les autres compteurs MENSUELS.
-- C'est le bon endroit, et pour une raison précise : ce que l'on facture se
-- rattache à un mois. Une interrogation faite en juillet reste une interrogation
-- de juillet, même si le colis bouge encore en septembre. Le stockage, lui, est
-- cumulatif et vit sur `shops` (migration 049) — deux natures, deux endroits.
--
-- La colonne est celle que le brief prévoit depuis le début ; elle naît ici,
-- avec le mécanisme qui la remplit. La créer plus tôt, vide, aurait rendu
-- « pas encore mesuré » indiscernable de « mesuré à zéro ».

alter table public.usage_counters
  add column tracking_api_calls integer not null default 0
    check (tracking_api_calls >= 0);

/*
 * UN INSTANTANÉ = UNE INTERROGATION FACTURÉE.
 *
 * Le déclencheur compte à l'INSERTION, ce qui est exact par construction : le
 * produit n'écrit un instantané que lorsqu'il a réellement interrogé le
 * fournisseur. Compter ailleurs — dans l'adaptateur, dans la tâche de fond —
 * exigerait un appel explicite dans chaque chemin, et il en existe déjà deux :
 * la première interrogation immédiate et la cadence de fond. Un appel oublié ne
 * casserait rien ; le compteur serait simplement plus bas que la facture.
 *
 * LES INTERROGATIONS VIDES COMPTENT AUSSI, et c'est voulu : un numéro fraîchement
 * collé n'est souvent pas encore scanné, mais le fournisseur facture l'appel de
 * la même façon. Les exclure ferait diverger notre compteur de sa facture, du
 * côté rassurant.
 */
create function public.compter_interrogation()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select s.owner_id into v_profil
  from public.tracked_parcels tp
  join public.shops s on s.id = tp.shop_id
  where tp.id = new.parcel_id;

  -- Le colis a disparu entre l'interrogation et l'écriture : rien à imputer, et
  -- surtout pas à un compte au hasard.
  if v_profil is null then return new; end if;

  insert into public.usage_counters (profile_id, period_month, tracking_api_calls)
  values (v_profil, date_trunc('month', new.fetched_at)::date, 1)
  on conflict (profile_id, period_month) do update
    set tracking_api_calls = public.usage_counters.tracking_api_calls + 1,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.compter_interrogation() from public;

create trigger tracking_snapshots_compter
  after insert on public.tracking_snapshots
  for each row execute function public.compter_interrogation();

-- REPRISE DE L'EXISTANT : un compteur branché après coup démarre avec un
-- historique vide, donc inexploitable au moment précis où il faut décider.
insert into public.usage_counters (profile_id, period_month, tracking_api_calls)
select s.owner_id, date_trunc('month', ts.fetched_at)::date, count(*)
from public.tracking_snapshots ts
join public.tracked_parcels tp on tp.id = ts.parcel_id
join public.shops s on s.id = tp.shop_id
group by s.owner_id, date_trunc('month', ts.fetched_at)::date
on conflict (profile_id, period_month) do update
  set tracking_api_calls = excluded.tracking_api_calls;

/*
 * L'INDEX DES ABANDONS.
 *
 * Les abandons restent lus sur `tracked_parcels` plutôt que dénormalisés — le
 * raisonnement de la migration 047 s'applique tel quel : ils sont RARES par
 * construction, la fenêtre étant de 7 jours et 16 interrogations. Ce qui manquait
 * était l'index : sans lui, un décompte mensuel balaie toute la table, et le coût
 * suit le nombre total de colis du produit.
 *
 * Index PARTIEL : il ne porte que les lignes abandonnées, donc sa taille suit le
 * nombre d'abandons et non celui des colis. Le jour où la mesure dira que les
 * abandons ne sont plus rares, le motif de la 046 s'appliquera à l'identique.
 */
create index tracked_parcels_abandon_idx
  on public.tracked_parcels (abandoned_at)
  where abandoned_at is not null;
