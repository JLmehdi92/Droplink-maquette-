-- 076 — UNE VUE DE LIEN EXIGE UNE EMPREINTE RÉELLE.
--
-- MESURÉ AVANT CORRECTION, sur la base : `enregistrer_vue` acceptait
-- `p_ip_hash = ''` et `p_ua_hash = ''` et créait la ligne. Elle acceptait aussi
-- `'x'` et `'y'`. La clé de déduplication est pourtant EXACTEMENT ce couple :
-- avec deux chaînes vides, tous les visiteurs d'un jour fusionnent en une ligne
-- — ou, si l'appelant varie l'une des deux, se multiplient sans borne.
--
-- LE REFUS EXISTAIT, MAIS DANS L'APPELANT. `vue.ts` renvoie « ignorée » quand
-- l'adresse ou l'agent manque, et c'est ce qui rendait le défaut invisible : la
-- protection tenait à ce qu'un seul chemin de code pense à la poser. C'est
-- L-029 littéralement — la phrase juste était « ce serait faussé si quelqu'un
-- appelait cette fonction d'ailleurs », et le prochain appelant ne l'aurait pas
-- su, puisque rien dans la signature ne le dit.
--
-- `link_views` N'EST PAS UNE TABLE COMME LES AUTRES. La ligne « un visiteur, un
-- JOUR » n'est pas un détail d'implémentation : c'est la DÉFINITION de « vues
-- par lien », qui est une métrique de verdict de la phase de validation. Une
-- métrique de verdict légèrement faussée est pire qu'une métrique cassée, parce
-- qu'elle reste crédible.
--
-- LE CONTRÔLE PORTE SUR LA FORME, pas sur la présence. Valider la présence ne
-- dit rien de la substitution : `'x'` a la forme d'une empreinte au sens où elle
-- n'est pas vide, et franchissait donc toute validation de présence. Ce qui est
-- exigé ici est ce que `empreinte()` produit réellement — trente-deux
-- caractères hexadécimaux — et rien d'autre ne passe.

create or replace function public.enregistrer_vue(
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
  -- AVANT TOUTE LECTURE. Une empreinte hors format ne devient pas valable parce
  -- que le jeton, lui, existe.
  if coalesce(p_ip_hash, '') !~ '^[0-9a-f]{32}$'
     or coalesce(p_ua_hash, '') !~ '^[0-9a-f]{32}$' then
    return false;
  end if;

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
  'Enregistre une vue de lien. Exige des empreintes AU FORMAT : la clé de déduplication EST la définition de la métrique de verdict.';

revoke execute on function public.enregistrer_vue(text, text, text, text, text)
  from public, anon, authenticated;
