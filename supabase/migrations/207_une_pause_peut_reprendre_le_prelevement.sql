/*
 * 207 — UNE PAUSE PEUT REPRENDRE LE PRÉLÈVEMENT, ET LE CONTRÔLE NE DOIT PAS SE
 * FAIRE DOUBLER. Revue sécurité ECC de la 206, 29/09/2026.
 *
 * 1. LA PAUSE. La 206 laissait supprimer un compte dont l'abonnement était
 *    `paused`, en le croyant sans prélèvement. Faux : la doc Lemon Squeezy
 *    (« Pausing a subscription ») prévoit `resumes_at`, qui REPREND
 *    l'abonnement tout seul — prélèvement compris. On ne stocke pas cette date
 *    (le webhook ne nous la garantit pas) : toute pause est donc traitée comme
 *    un prélèvement possible. Le vendeur résilie depuis le portail, puis
 *    supprime.
 *
 * 2. LE VERROU. Le contrôle lisait `subscriptions` sans la verrouiller : un
 *    webhook passant l'abonnement à `active` entre le contrôle et la
 *    suppression aurait laissé partir un compte encore prélevé. Les lignes
 *    d'abonnement du compte sont désormais verrouillées (`for update`) le temps
 *    de la transaction : le webhook attend, puis trouve un compte déjà supprimé
 *    (sa ligne partie avec la cascade) — ou la suppression attend le webhook et
 *    voit le nouveau statut.
 *
 * Le reste de la fonction est celui de la 206 (donc de la 157), à l'identique.
 */

create or replace function public.supprimer_mon_compte(p_confirmation text)
  returns setof text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profil public.profiles%rowtype;
  v_shop uuid;
  v_peut_prelever boolean;
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

  -- 206 + 207 : un abonnement qui peut encore prélever doit être résilié AVANT.
  -- Les lignes sont VERROUILLÉES : un webhook concurrent ne peut pas les changer
  -- entre ce contrôle et la suppression.
  perform 1 from public.subscriptions where profile_id = v_profil.id for update;
  select exists (
    select 1 from public.subscriptions
     where profile_id = v_profil.id
       and status in ('active', 'on_trial', 'past_due', 'unpaid', 'paused')
  ) into v_peut_prelever;
  if v_peut_prelever then
    raise exception 'un abonnement en cours doit être résilié avant la suppression du compte'
      using errcode = 'DL077';
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
