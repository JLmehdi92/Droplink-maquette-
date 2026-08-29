-- 112 — La fiche d'un compte rend ce que sa planche montre, et compte comme
--       les deux autres écrans.
--
-- ⚠️ TROISIÈME ENDROIT OÙ « COMMANDE » NE VOULAIT PAS DIRE LA MÊME CHOSE. La
-- 111 a réuni la liste des comptes et celle des boutiques sur
-- `shops.commandes_reelles` ; `lire_compte_admin` comptait encore les LIGNES de
-- `orders`. Un administrateur qui ouvrait une fiche depuis la liste voyait donc
-- le nombre CHANGER en un clic, sans que rien ne bouge en base. C'est le pire
-- des trois cas : les deux nombres se succèdent sous les yeux de la même
-- personne, à une seconde d'intervalle.
--
-- CE QUE LA PLANCHE RÉCLAME EN PLUS : les médias et les octets occupés (tenus
-- par déclencheur depuis la 049), la couleur d'accent, le filigrane, les
-- réseaux configurés, les deux compteurs du MOIS pour les barres de plafond, et
-- une frise de ce que le vendeur a fait.
--
-- LA FRISE NE REND QUE DES AGRÉGATS, JAMAIS UN ÉVÉNEMENT. Type, jour, nombre —
-- et surtout PAS `payload`, qui porte le contenu de la commande. « Des volumes,
-- pas du contenu : ils suffisent à décider, et le contenu appartient au vendeur
-- et à ses clients. » Un `select *` sur `order_events` aurait rendu des noms de
-- clients et des références produit à un administrateur qui n'en a pas besoin.
--
-- ELLE VOYAGE DANS LA MÊME LIGNE, en `jsonb`, et ce n'est pas de la commodité :
-- une seconde fonction produirait une SECONDE entrée d'audit pour la même
-- ouverture de fiche, et une consultation qui laisse deux traces apprend à ne
-- plus les compter.
--
-- `vues` DISPARAÎT. La planche ne la dessine pas, et elle ne fonde aucune
-- décision d'administration : une page très consultée n'est ni un coût ni un
-- risque. Le coût — colis, médias, octets — reste, en entier.
--
-- `drop` OBLIGATOIRE : le type de retour change.

drop function if exists public.lire_compte_admin(uuid, text);

create function public.lire_compte_admin(p_profil uuid, p_ip_hash text)
  returns table (
    id uuid,
    email text,
    account_type public.account_type,
    role public.user_role,
    status public.account_status,
    locale text,
    created_at timestamptz,
    boutique_id uuid,
    boutique_nom text,
    accent_color text,
    watermark_enabled boolean,
    reseaux text[],
    commandes bigint,
    commandes_ce_mois bigint,
    colis_ce_mois bigint,
    medias bigint,
    stockage_octets bigint,
    evenements jsonb
  )
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- ON TRACE MÊME QUAND LE COMPTE N'EXISTE PAS. Ne tracer que les succès
  -- laisserait l'énumération d'identifiants totalement invisible.
  perform public.journaliser_admin(
    'comptes.detail', 'profiles', p_profil::text, p_profil, p_ip_hash, '{}'::jsonb
  );

  return query
  select
    p.id, p.email, p.account_type, p.role, p.status, p.locale, p.created_at,
    s.id, s.name, s.accent_color, s.watermark_enabled,
    -- LES RÉSEAUX CONFIGURÉS, PAR LEUR NOM, jamais par leur adresse : savoir
    -- qu'un vendeur a mis un Instagram suffit à décrire son compte, l'ouvrir ne
    -- regarde personne ici.
    array_remove(array[
      case when nullif(btrim(coalesce(s.instagram_url, '')), '') is null then null else 'instagram' end,
      case when nullif(btrim(coalesce(s.tiktok_url, '')), '') is null then null else 'tiktok' end,
      case when nullif(btrim(coalesce(s.whatsapp_url, '')), '') is null then null else 'whatsapp' end
    ], null),
    -- MÊME DÉFINITION QUE LES DEUX AUTRES ÉCRANS, enfin.
    coalesce(s.commandes_reelles, 0)::bigint,
    coalesce(u.orders_created, 0)::bigint,
    coalesce(u.parcels_registered, 0)::bigint,
    coalesce(s.medias_count, 0)::bigint,
    coalesce(s.stockage_octets, 0)::bigint,
    -- LA FRISE : agrégats seulement, six lignes au plus, du plus récent au plus
    -- ancien. `coalesce` sur un tableau vide plutôt que `null` — l'appelant ne
    -- doit pas avoir à distinguer « aucun événement » de « rien lu ».
    coalesce((
      select jsonb_agg(x order by x.jour desc)
        from (
          select e.type as type,
                 date_trunc('day', e.occurred_at)::date as jour,
                 count(*) as n
            from public.order_events e
            join public.orders o on o.id = e.order_id
           where o.shop_id = s.id
             and e.actor = 'vendeur'
           group by e.type, date_trunc('day', e.occurred_at)::date
           order by 2 desc
           limit 6
        ) as x
    ), '[]'::jsonb)
  from public.profiles p
  left join public.shops s on s.owner_id = p.id
  left join public.usage_counters u
         on u.profile_id = p.id
        and u.period_month = date_trunc('month', now())::date
  where p.id = p_profil;
end;
$$;

revoke all on function public.lire_compte_admin(uuid, text) from public;
grant execute on function public.lire_compte_admin(uuid, text) to authenticated;

comment on function public.lire_compte_admin(uuid, text) is
  'Fiche d''un compte pour l''administration. Garde interne : est_admin(). '
  'Trace écrite MÊME sur un compte inexistant, sinon l''énumération serait '
  'invisible. Ne rend aucun contenu de commande : la frise est agrégée.';

-- L'INDEX QUE LA FRISE DEMANDE.
--
-- Sans lui, l'agrégat lit tous les événements de la boutique à chaque ouverture
-- de fiche — et un vendeur à 9 600 commandes en produit des dizaines de
-- milliers. Le tri par jour décroissant est dans l'index, donc les six groupes
-- récents se lisent sans parcourir le reste.
create index if not exists order_events_par_commande_et_date_idx
  on public.order_events (order_id, occurred_at desc)
  where actor = 'vendeur';
