/*
 * LA SUPPRESSION DU COMPTE ET DES DONNÉES, PAR LE VENDEUR LUI-MÊME.
 *
 * DÉCISION DE WASSIM, 13/09/2026 — option A : le vendeur supprime son compte ;
 * on efface commandes, médias et suivis, et on garde UN AN l'adresse et les dates
 * d'inscription et de suppression. La décision 9 du brief interdit la
 * suppression PAR L'ADMINISTRATION ; celle-ci est un geste du titulaire.
 *
 * ⚠️ POURQUOI UNE FONCTION, ET UNE SEULE TRANSACTION. Garde, conservation, file
 * de purge et suppression tiennent ensemble ou pas du tout : une conservation
 * écrite sans suppression laisserait une trace d'un compte vivant, une
 * suppression sans conservation manquerait à l'obligation de l'hébergeur, et une
 * suppression sans file de purge laisserait les photos des clients dans le
 * bucket, sans plus aucune ligne pour dire qu'elles existent — le bucket ne
 * s'énumère jamais (`lib/storage/cles.ts`).
 *
 * ⚠️ POURQUOI PAS LA CLÉ DE SERVICE. Le rôle propriétaire de la fonction peut
 * supprimer la ligne `auth.users` de l'appelant — mesuré le 13/09/2026 en
 * transaction annulée, cascade comprise. Le produit n'a donc pas à manier la clé
 * de service pour un geste qu'un humain fait sur SON compte, et l'identité vient
 * de `auth.uid()`, jamais d'un argument.
 *
 * Le mot de passe actuel est vérifié par l'application AVANT l'appel ; la double
 * authentification, par le crochet de la migration 156 — un jeton `aal1` n'atteint
 * pas cette fonction.
 */

/*
 * LA CONSERVATION D'UN AN — ce que l'hébergeur doit pouvoir produire sur réquisition.
 * Aucune policy : ni `anon` ni `authenticated` n'y lisent ni n'y écrivent. Seules
 * les fonctions de cette migration l'atteignent.
 */
create table public.comptes_supprimes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  inscrit_le timestamptz not null,
  supprime_le timestamptz not null default now(),
  conserver_jusqu_au timestamptz not null default (now() + interval '1 year')
);

alter table public.comptes_supprimes enable row level security;
revoke all on public.comptes_supprimes from anon, authenticated;

comment on table public.comptes_supprimes is
  'Comptes supprimés par leur titulaire : adresse et dates, conservées un an (obligation de l''hébergeur), puis effacées par la veille.';

/*
 * LA FILE DE PURGE R2. Une clé y entre DANS la transaction qui supprime sa ligne ;
 * elle n'en sort qu'une fois l'objet réellement supprimé. L'application tente la
 * purge aussitôt, la veille la rejoue jusqu'au succès : `DELETE` est idempotent
 * chez R2, rejouer ne coûte rien.
 */
create table public.purges_r2 (
  cle text primary key,
  demande_le timestamptz not null default now(),
  tentatives integer not null default 0
);

alter table public.purges_r2 enable row level security;
revoke all on public.purges_r2 from anon, authenticated;

/*
 * Le cœur commun : met en file les clés de la boutique, et rend la liste.
 * `avec_logo` : le logo part avec le compte, pas avec les données.
 */
create function public.mettre_en_file_la_boutique(p_shop uuid, p_avec_logo boolean)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  return query
  with cles as (
    select m.cle
      from public.order_media m
      join public.orders o on o.id = m.order_id
     where o.shop_id = p_shop
    union
    select s.logo_url
      from public.shops s
     where s.id = p_shop
       and p_avec_logo
       and s.logo_url is not null
  ),
  inserees as (
    insert into public.purges_r2 (cle)
    select cle from cles
    on conflict (cle) do nothing
    returning cle
  )
  select cle from cles;
end;
$$;

revoke all on function public.mettre_en_file_la_boutique(uuid, boolean) from public;
revoke all on function public.mettre_en_file_la_boutique(uuid, boolean) from anon, authenticated;

/*
 * « SUPPRIMER LE COMPTE ».
 *
 * ⚠️ UN COMPTE SUSPENDU NE PEUT PAS SE SUPPRIMER. La suspension est ce qui fonde
 * notre statut d'hébergeur : un titulaire visé par un signalement effacerait
 * sinon le contenu signalé avant que quiconque l'ait examiné.
 *
 * ⚠️ LA CONFIRMATION EST L'ADRESSE DU COMPTE, recopiée — vérifiée ici autant que
 * dans l'application. Une Server Action appelée à la main ne doit pas pouvoir
 * sauter le geste qui force à lire quel compte on supprime.
 */
create function public.supprimer_mon_compte(p_confirmation text)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profil public.profiles%rowtype;
  v_shop uuid;
begin
  if v_uid is null then
    raise exception 'aucune session' using errcode = '42501';
  end if;

  select * into v_profil from public.profiles where user_id = v_uid for update;
  if not found or v_profil.status <> 'active' then
    raise exception 'suppression refusée : compte absent ou inactif' using errcode = 'DL053';
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(v_profil.email) then
    raise exception 'la confirmation ne reprend pas l''adresse du compte' using errcode = 'DL054';
  end if;

  select id into v_shop from public.shops where owner_id = v_profil.id;

  insert into public.comptes_supprimes (user_id, email, inscrit_le)
  values (v_uid, v_profil.email, v_profil.created_at);

  if v_shop is not null then
    return query select public.mettre_en_file_la_boutique(v_shop, true);
  end if;

  -- La cascade emporte profil, boutique, commandes, médias, vues, événements,
  -- colis et points de passage ; le journal d'audit garde ses lignes, clés mises
  -- à NULL (migration 042).
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.supprimer_mon_compte(text) from public;
revoke all on function public.supprimer_mon_compte(text) from anon;
grant execute on function public.supprimer_mon_compte(text) to authenticated;

/*
 * « SUPPRIMER TOUTES LES DONNÉES » — le compte reste, vide.
 *
 * Commandes, médias, vues, événements, colis et points de passage partent ; le
 * profil, la boutique, ses réglages et son logo restent. Les compteurs d'usage
 * restent aussi : ils décrivent ce qui a été CONSOMMÉ — un colis pris en charge
 * l'a été, et coûte, qu'on efface ou non sa ligne.
 */
create function public.supprimer_mes_donnees(p_confirmation text)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profil public.profiles%rowtype;
  v_shop uuid;
begin
  if v_uid is null then
    raise exception 'aucune session' using errcode = '42501';
  end if;

  select * into v_profil from public.profiles where user_id = v_uid for update;
  if not found or v_profil.status <> 'active' then
    raise exception 'suppression refusée : compte absent ou inactif' using errcode = 'DL053';
  end if;
  if lower(btrim(coalesce(p_confirmation, ''))) <> lower(v_profil.email) then
    raise exception 'la confirmation ne reprend pas l''adresse du compte' using errcode = 'DL054';
  end if;

  select id into v_shop from public.shops where owner_id = v_profil.id;
  if v_shop is null then
    return;
  end if;

  return query select public.mettre_en_file_la_boutique(v_shop, false);

  delete from public.orders where shop_id = v_shop;
  delete from public.tracked_parcels where shop_id = v_shop;
end;
$$;

revoke all on function public.supprimer_mes_donnees(text) from public;
revoke all on function public.supprimer_mes_donnees(text) from anon;
grant execute on function public.supprimer_mes_donnees(text) to authenticated;

/*
 * LA VEILLE : les clés à purger, par lots, et la sortie de file après succès.
 * Le rôle de service seul — une machine, pas un humain.
 */
create function public.cles_a_purger(p_limite integer)
  returns setof text
  language sql
  security definer
  set search_path = ''
as $$
  update public.purges_r2 p
     set tentatives = p.tentatives + 1
   where p.cle in (
     select cle from public.purges_r2
      order by demande_le
      limit greatest(1, least(coalesce(p_limite, 100), 500))
   )
  returning p.cle;
$$;

create function public.purges_effectuees(p_cles text[])
  returns integer
  language sql
  security definer
  set search_path = ''
as $$
  with parties as (
    delete from public.purges_r2 where cle = any (p_cles) returning 1
  )
  select count(*)::integer from parties;
$$;

/* Au bout d'un an, la conservation n'a plus de raison d'être : on efface. */
create function public.purger_comptes_supprimes()
  returns integer
  language sql
  security definer
  set search_path = ''
as $$
  with parties as (
    delete from public.comptes_supprimes where conserver_jusqu_au < now() returning 1
  )
  select count(*)::integer from parties;
$$;

revoke all on function public.cles_a_purger(integer) from public, anon, authenticated;
revoke all on function public.purges_effectuees(text[]) from public, anon, authenticated;
revoke all on function public.purger_comptes_supprimes() from public, anon, authenticated;
grant execute on function public.cles_a_purger(integer) to service_role;
grant execute on function public.purges_effectuees(text[]) to service_role;
grant execute on function public.purger_comptes_supprimes() to service_role;
