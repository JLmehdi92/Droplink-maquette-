-- 006 — Les commandes. L'unité du produit : une commande = une page = un lien.

-- Les énumérations sont créées ici, avec la table qui les emploie. La règle qui
-- impose l'isolement ne vise que `alter type ... add value` : Postgres interdit
-- d'employer une valeur dans la transaction qui l'ajoute, mais pas d'employer un
-- type qu'on vient de créer.
--
-- La frise reste à QUATRE étapes. La granularité vit dans le détail du suivi, pas
-- dans la frise : un client qui voit douze étapes ne sait plus laquelle compte.
create type public.order_status as enum ('preparation', 'expedie', 'en_transit', 'livre');

create type public.qc_status as enum ('en_attente', 'approuve', 'refuse');

/*
 * LA BOUTIQUE DE L'APPELANT, EN UNE SEULE ÉVALUATION.
 *
 * Décision de MONTÉE EN CHARGE, pas de style. La formulation naturelle d'une
 * policy serait un `exists (select ... join ...)` corrélé à chaque ligne : à
 * dix mille commandes, la jointure est évaluée dix mille fois pour en rendre
 * cinquante. Une fonction STABLE est évaluée UNE fois par requête, et la policy
 * se réduit à une comparaison d'égalité que l'index sait servir.
 *
 * `security definer` parce qu'elle lit `profiles` et `shops`, dont les policies
 * la rappelleraient. Elle ne prend AUCUN argument : il n'y a donc rien à
 * détourner, elle ne peut répondre que sur l'appelant courant.
 */
create function public.mon_shop_id()
  returns uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select s.id
  from public.shops s
  join public.profiles p on p.id = s.owner_id
  where p.user_id = (select auth.uid())
$$;

-- Les policies s'exécutent avec le rôle APPELANT : sans ce droit, toute lecture
-- de commande échouerait. `anon` ne l'obtient pas — la page publique passe par
-- une vue dédiée, jamais par cette table.
revoke execute on function public.mon_shop_id() from public, anon;
grant execute on function public.mon_shop_id() to authenticated;

/*
 * GÉNÉRATION DU JETON PUBLIC.
 *
 * 21 caractères en base 62, soit environ 125 bits : non devinable par force
 * brute, et c'est la seule chose qui protège la page d'un client.
 *
 * TIRAGE SANS BIAIS. Un `octet % 62` naïf favoriserait les huit premiers
 * caractères de l'alphabet, puisque 256 n'est pas un multiple de 62. Le biais
 * serait minime, mais il est gratuit à supprimer : on rejette les octets au-delà
 * de 247 (soit 4 × 62) et on retire. Sur un secret dont dépend l'accès à des
 * photos privées, « minime » n'est pas un argument suffisant.
 */
create function public.generer_jeton_public()
  returns text
  language plpgsql
  volatile
  set search_path = ''
as $$
declare
  alphabet constant text :=
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  resultat text := '';
  octets bytea;
  o int;
  i int;
begin
  while length(resultat) < 21 loop
    octets := extensions.gen_random_bytes(32);
    for i in 0..31 loop
      exit when length(resultat) >= 21;
      o := get_byte(octets, i);
      -- 248 = 4 × 62 : au-delà, l'octet est rejeté plutôt que replié.
      if o < 248 then
        resultat := resultat || substr(alphabet, (o % 62) + 1, 1);
      end if;
    end loop;
  end loop;
  return resultat;
end;
$$;

revoke execute on function public.generer_jeton_public() from public, anon, authenticated;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,

  -- IMMUABLE À VIE. Le défaut est en base : un jeton produit côté application
  -- pourrait être oublié dans un nouveau chemin d'insertion, et une commande
  -- naîtrait sans jeton ou avec un jeton devinable. Un déclencheur en interdit
  -- la modification (migration 007).
  public_token text not null unique default public.generer_jeton_public(),

  -- DISTINCT du jeton public. Un jeton, un pouvoir : celui qui se désabonne des
  -- notifications ne doit pas, par ce seul geste, détenir de quoi ouvrir la page.
  unsubscribe_token text not null unique default public.generer_jeton_public(),

  -- TEXTE LIBRE, aucune clé étrangère vers un compte. Le destinataire n'a jamais
  -- de compte : ce champ est un pseudo, pas une recherche d'utilisateur.
  customer_label text,
  product_ref text,

  -- ABSENT de la vue publique ET de l'export. Porte le prix d'achat.
  internal_notes text,

  status public.order_status not null default 'preparation',
  qc_status public.qc_status not null default 'en_attente',

  tracking_number text,
  carrier_code text,
  cover_media_id uuid,
  notify_email text,

  -- Marque du PREMIER CONTENU RÉEL, posée par déclencheur. Sert la métrique de
  -- verdict : l'écart entre l'ouverture de l'éditeur et cette date est
  -- l'information — un brouillon ouvert puis abandonné est exactement le cas
  -- « teste une ou deux fois puis disparaît ».
  first_content_at timestamptz,

  -- Archiver range le plan de travail du vendeur ; cela NE RETIRE PAS la page
  -- publique. La promesse faite au client tient au-delà du rangement.
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_customer_label_taille check (customer_label is null or length(customer_label) <= 120),
  constraint orders_product_ref_taille check (product_ref is null or length(product_ref) <= 200),
  constraint orders_notes_taille check (internal_notes is null or length(internal_notes) <= 5000),
  constraint orders_tracking_taille check (tracking_number is null or length(tracking_number) <= 64),
  constraint orders_carrier_taille check (carrier_code is null or length(carrier_code) <= 32),
  constraint orders_email_forme check (
    notify_email is null or notify_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'
  )
);

alter table public.orders enable row level security;
alter table public.orders force row level security;

-- Le filtre se réduit à une égalité, servie par l'index. Voir `mon_shop_id()`.
create policy orders_lecture on public.orders
  for select to authenticated
  using (shop_id = public.mon_shop_id());

create policy orders_insertion on public.orders
  for insert to authenticated
  with check (shop_id = public.mon_shop_id());

create policy orders_maj on public.orders
  for update to authenticated
  using (shop_id = public.mon_shop_id())
  with check (shop_id = public.mon_shop_id());

create policy orders_suppression on public.orders
  for delete to authenticated
  using (shop_id = public.mon_shop_id());

-- Supabase accorde SELECT/INSERT/UPDATE/DELETE à `anon` par défaut : sans ce
-- retrait, la RLS serait la seule barrière entre un anonyme et toutes les lignes.
revoke all on public.orders from anon, authenticated;

grant select, insert, delete on public.orders to authenticated;

-- LES COLONNES ÉCRIVABLES SONT ÉNUMÉRÉES, et le privilège de COLONNE est évalué
-- AVANT la policy. Sont volontairement absentes :
--   `public_token`, `unsubscribe_token` : immuables, et le second est un pouvoir
--     distinct du premier ;
--   `shop_id`      : un transfert de commande entre comptes est interdit ;
--   `created_at`   : une date de création réécrite est une piste effacée ;
--   `updated_at`   : tenue par déclencheur, sinon elle affirme ce qu'on veut ;
--   `first_content_at` : c'est une MESURE, pas une donnée du vendeur. La lui
--     laisser écrire reviendrait à lui laisser écrire notre métrique de verdict.
grant update (
  customer_label, product_ref, internal_notes, status, qc_status,
  tracking_number, carrier_code, cover_media_id, notify_email, archived_at
) on public.orders to authenticated;

/*
 * INDEX — chacun sert une requête que l'écran fait réellement.
 *
 * L'index du TRI PAR DÉFAUT est le plus facile à oublier, parce que son absence
 * est invisible à faible volumétrie : sans lui, l'écran lit toutes les lignes du
 * vendeur pour en rendre cinquante, et cela ne se voit qu'une fois la
 * volumétrie installée — donc chez celui qui a le plus de données.
 *
 * `archived_at` est dans la clé et non en condition partielle : le tri par
 * défaut exclut les archivées, et une condition partielle obligerait à un second
 * index pour la vue « archivées ».
 */
create index orders_tri_defaut_idx
  on public.orders (shop_id, archived_at, created_at desc, id desc);

create index orders_statut_idx on public.orders (shop_id, status, created_at desc);

create index orders_qc_idx on public.orders (shop_id, qc_status, created_at desc);

-- Retrouver une commande par son numéro de suivi, à la frontière du vendeur.
create index orders_suivi_idx on public.orders (shop_id, tracking_number)
  where tracking_number is not null;

-- La page publique lit par jeton : l'unicité fournit déjà l'index.

/*
 * `updated_at` tenue par déclencheur.
 *
 * Une colonne qui porte un nom sans porter la garantie correspondante est un
 * mensonge en attente : personne ne s'en aperçoit tant que rien ne l'affiche, et
 * le jour où le tableau de bord s'en sert, elle est fausse sans être cassée.
 */
create trigger orders_toucher_updated_at
  before update on public.orders
  for each row execute function public.toucher_updated_at();

/*
 * PREMIER CONTENU RÉEL, marqué en base.
 *
 * En base et non dans le code applicatif, pour la raison habituelle : une règle
 * applicative peut être oubliée dans un nouveau chemin d'écriture, une règle en
 * base ne peut pas l'être. Et cette marque-là est une métrique de verdict — une
 * métrique légèrement faussée est pire qu'une métrique cassée, parce qu'elle
 * reste crédible.
 *
 * Les NOTES INTERNES ne comptent PAS comme contenu : elles sont pour le vendeur,
 * pas pour son client. Une commande qui ne porte qu'une note n'a rien à montrer.
 * Les médias sont traités par leur propre déclencheur, avec leur table.
 */
create function public.marquer_premier_contenu()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.first_content_at is null and (
       coalesce(new.customer_label, '') <> ''
    or coalesce(new.product_ref, '') <> ''
    or coalesce(new.tracking_number, '') <> ''
  ) then
    new.first_content_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.marquer_premier_contenu() from public, anon, authenticated;

create trigger orders_marquer_premier_contenu
  before insert or update on public.orders
  for each row execute function public.marquer_premier_contenu();
