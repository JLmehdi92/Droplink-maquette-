-- 020 — `enregistrer_vue` : le profil devient omissible par une chaîne vide.
--
-- POURQUOI CETTE MIGRATION EXISTE. La signature de 018 prend `p_profil uuid`, et
-- l'appelant doit pouvoir ne pas en fournir : la page publique est ouverte par
-- un visiteur sans compte dans l'immense majorité des cas. Or une signature
-- Postgres ne dit RIEN de la nullité de ses arguments — le générateur de types
-- les décrit donc tous comme non nuls, et le typage refuse l'appel légitime.
--
-- Le choix retenu est celui déjà fait pour `p_pays` : la chaîne vide vaut
-- absence, et la fonction traduit. L'alternative — affaiblir le typage côté
-- application par une conversion — aurait déplacé le problème là où plus aucun
-- outil ne le regarde.
--
-- `DROP` EXPLICITE, PAS `CREATE OR REPLACE`. Une fonction dont la LISTE
-- D'ARGUMENTS change n'est pas remplacée : Postgres en crée une SECONDE. Les
-- deux surcharges coexistent alors, un appel résout l'ANCIENNE sans la moindre
-- erreur, et l'exclusion du vendeur cesserait silencieusement de s'appliquer.

drop function public.enregistrer_vue(text, text, text, text, uuid);

create function public.enregistrer_vue(
  p_jeton text,
  p_ip_hash text,
  p_ua_hash text,
  p_pays text,
  p_profil text
)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_proprietaire uuid;
  v_insere uuid;
begin
  select o.id, p.id
    into v_order, v_proprietaire
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active';

  if v_order is null then
    return false;
  end if;

  -- LE VENDEUR QUI OUVRE SA PROPRE PAGE EST EXCLU. Il vérifie son travail, il ne
  -- consulte pas. Décidé ici et pas dans la route : une exclusion écrite dans un
  -- appelant est une exclusion que le prochain appelant n'aura pas.
  if nullif(p_profil, '') is not null and nullif(p_profil, '')::uuid = v_proprietaire then
    return false;
  end if;

  insert into public.link_views (order_id, ip_hash, user_agent_hash, country)
  values (v_order, p_ip_hash, p_ua_hash, nullif(p_pays, ''))
  on conflict (order_id, ip_hash, user_agent_hash, viewed_on) do nothing
  returning id into v_insere;

  return v_insere is not null;
end;
$$;

comment on function public.enregistrer_vue(text, text, text, text, text) is
  'Enregistre une vue dédupliquée par jour. Exclut le vendeur. Rend true seulement si une ligne a été créée.';

revoke execute on function public.enregistrer_vue(text, text, text, text, text)
  from public, anon, authenticated;
