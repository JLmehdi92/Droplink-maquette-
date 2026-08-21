-- 046 — Les compteurs d'usage, pour que le panneau tienne à des milliers de comptes.
--
-- DÉFAUT CONSTATÉ PAR MESURE, avant qu'il ne se produise.
--
-- Le panneau agrégeait `tracked_parcels` directement : 19 244 lignes lues en
-- 17,9 ms pour DEUX comptes de 9 600 colis. Le coût est linéaire dans le nombre
-- de colis pris en charge, donc dans le nombre de comptes multiplié par leur
-- activité. À mille vendeurs, la même requête lirait des millions de lignes et
-- l'écran deviendrait inutilisable — exactement au moment où le produit marche.
--
-- C'EST LE MÊME MOTIF QUE LA MIGRATION 027, qui avait déjà résolu ce problème
-- pour le tri « jamais ouvert » : quand un agrégat porte sur une table qui
-- grossit avec l'usage, aucun index ne le rattrape. La seule issue est de ne pas
-- avoir à le faire — donc de tenir le compte à l'écriture.
--
-- APRÈS : le panneau lit UNE LIGNE PAR COMPTE ET PAR MOIS. Le volume suit le
-- nombre d'inscrits, pas leur activité, et il est borné par le mois.
--
-- La table est celle que le brief prévoit. Seule `parcels_registered` est
-- alimentée ici : les autres colonnes viendront avec les mécanismes qui les
-- mesurent, et les créer vides plutôt que de les inventer permet de distinguer
-- « pas encore mesuré » de « mesuré à zéro ».

create table public.usage_counters (
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  -- Le PREMIER JOUR du mois, pas une chaîne « 2026-08 » : une date se compare,
  -- s'indexe et se tronque sans conversion, et deux formats textuels du même
  -- mois ne peuvent pas coexister.
  period_month       date not null,
  parcels_registered integer not null default 0,
  orders_created     integer not null default 0,
  media_count        integer not null default 0,
  -- NULLABLE, ET C'EST LE POINT : tant qu'aucun mécanisme ne mesure le stockage,
  -- la valeur est INCONNUE. Un `default 0` ferait afficher « 0 o » là où il faut
  -- écrire « indisponible » — zéro affirme qu'on a mesuré.
  storage_bytes      bigint,
  updated_at         timestamptz not null default now(),

  primary key (profile_id, period_month)
);

-- Le panneau interroge un MOIS : c'est cet index qui rend sa lecture bornée.
create index usage_counters_periode_idx
  on public.usage_counters (period_month, parcels_registered desc);

alter table public.usage_counters enable row level security;
alter table public.usage_counters force row level security;

-- Aucune policy : la table n'est atteignable que par les fonctions ci-dessous.
revoke all on public.usage_counters from anon, authenticated;

/*
 * LE COMPTEUR EST TENU À L'ÉCRITURE, PAR DÉCLENCHEUR.
 *
 * Pourquoi un déclencheur plutôt qu'un appel dans le code : la prise en charge
 * s'écrit depuis DEUX chemins — la première interrogation immédiate et la tâche
 * de fond — et un troisième viendra. Un appel explicite serait oublié dans l'un
 * d'eux, et l'oubli ne casserait rien : le compteur serait simplement plus bas
 * que la réalité. Or ce compteur est celui qui correspond à une FACTURE.
 *
 * IL NE COMPTE QUE LA TRANSITION vers « pris en charge ». Sans cette condition,
 * chaque mise à jour de la ligne — et il y en a une par interrogation —
 * incrémenterait le compteur, qui mesurerait alors les interrogations et non les
 * prises en charge. Les deux chiffres se ressemblent assez pour qu'on ne
 * remarque rien avant de comparer à une facture.
 */
create function public.compter_prise_en_charge()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  if new.registered_at is null or old.registered_at is not null then
    return new;
  end if;

  select s.owner_id into v_profil from public.shops s where s.id = new.shop_id;
  if v_profil is null then
    return new;
  end if;

  insert into public.usage_counters (profile_id, period_month, parcels_registered)
  values (v_profil, date_trunc('month', new.registered_at)::date, 1)
  on conflict (profile_id, period_month) do update
    set parcels_registered = public.usage_counters.parcels_registered + 1,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.compter_prise_en_charge() from public;

create trigger tracked_parcels_compter_prise_en_charge
  after insert or update of registered_at on public.tracked_parcels
  for each row execute function public.compter_prise_en_charge();

-- REPRISE DE L'EXISTANT. Sans elle, le compteur démarrerait à zéro et le panneau
-- afficherait un mois vide pour des colis réellement pris en charge — un
-- compteur branché après coup démarre avec un historique vide, donc inexploitable
-- au moment précis où il faut décider.
insert into public.usage_counters (profile_id, period_month, parcels_registered)
select s.owner_id, date_trunc('month', tp.registered_at)::date, count(*)
from public.tracked_parcels tp
join public.shops s on s.id = tp.shop_id
where tp.registered_at is not null
group by s.owner_id, date_trunc('month', tp.registered_at)::date
on conflict (profile_id, period_month) do update
  set parcels_registered = excluded.parcels_registered;
