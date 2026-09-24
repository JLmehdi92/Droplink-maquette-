-- 194 — LES DEMANDES D'E-MAIL SE COMPTENT PAR JOUR, ET PAR BOUTIQUE.
--
-- DÉFAUT TROUVÉ PAR L'AUDIT ECC DU 24/09/2026 : UN RELAIS DE SPAM.
--
-- `demander_notification` (188, reprise en 192) acceptait trois demandes par
-- HEURE et par commande. Quiconque détient un lien client peut donc faire partir
-- 72 e-mails de confirmation par jour, vers des adresses de son choix — et le
-- NOM DE BOUTIQUE, que le vendeur écrit librement, figure dans l'e-mail. Un
-- compte gratuit a quinze liens : environ un millier d'e-mails par jour, depuis
-- NOTRE domaine d'envoi, dont la réputation est partagée par tous les vendeurs.
--
-- DEUX BORNES, et la seconde est celle qui compte :
--   · 3 demandes par commande sur 24 h — un client qui s'est trompé d'adresse
--     a encore deux essais ;
--   · 60 demandes par boutique sur 24 h — sans elle, multiplier les commandes
--     multiplierait le spam. Un vendeur à 200 commandes par semaine en crée
--     une trentaine par jour, dont une partie seulement de clients s'inscrit.
--
-- La borne par commande garde son code (DL074) ; celle de la boutique a le sien
-- (DL075) — un code désigne UN fait, la garde `codes-erreur` l'exige. L'écran
-- dit « trop » pour les deux. Même vide pour un lien inconnu.
-- Signature inchangée : `create or replace`, droits redits.

create or replace function public.demander_notification(p_jeton_public text, p_email text, p_token_hash text)
  returns table (langue text, nom_boutique text)
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_shop uuid;
  v_langue text;
  v_nom text;
  v_recentes integer;
begin
  -- LE MÊME FILTRE QUE LA PAGE (166, 192) : un vendeur suspendu n'a plus de
  -- page, donc rien à suivre. Le vide est le même que pour un lien inconnu.
  select o.id, o.shop_id, s.default_language::text, s.name
    into v_order, v_shop, v_langue, v_nom
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton_public
    and o.archived_at is null
    and o.admin_blocked_at is null
    and p.status = 'active';

  if v_order is null then
    return;
  end if;

  -- Deux demandes simultanées pour la même boutique comptent l'une après
  -- l'autre : sans ce verrou, la borne se contournerait en parallèle (192).
  perform pg_advisory_xact_lock(hashtextextended('demandes-notification:' || v_shop::text, 0));

  select count(*) into v_recentes
  from public.notification_requests r
  where r.order_id = v_order and r.created_at > now() - interval '24 hours';
  if v_recentes >= 3 then
    raise exception 'trop de demandes pour cette commande' using errcode = 'DL074';
  end if;

  select count(*) into v_recentes
  from public.notification_requests r
  join public.orders o on o.id = r.order_id
  where o.shop_id = v_shop and r.created_at > now() - interval '24 hours';
  if v_recentes >= 60 then
    raise exception 'trop de demandes pour cette boutique' using errcode = 'DL075';
  end if;

  insert into public.notification_requests (order_id, email, token_hash)
  values (v_order, lower(trim(p_email)), p_token_hash);

  return query select v_langue, v_nom;
end;
$$;
revoke all on function public.demander_notification(text, text, text) from public, anon, authenticated;
grant execute on function public.demander_notification(text, text, text) to service_role;
