-- 024 — L'arbitrage QC par celui qui consulte le lien.
--
-- C'est la SEULE écriture que la page publique autorise, et elle est faite par
-- quelqu'un qui n'a pas de compte et n'en aura jamais. Tout ce qui suit découle
-- de cette phrase.
--
-- LE JETON EST LE SEUL LAISSEZ-PASSER, et il ne désigne qu'une commande : il n'y
-- a pas d'identifiant de commande dans les arguments. En accepter un
-- permettrait d'arbitrer la commande d'un autre vendeur en présentant un jeton
-- valide quelconque — la faute classique de l'écriture par jeton.
--
-- LE FILTRE DE SUSPENSION EST REFAIT ICI. Un compte suspendu dont les pages ne
-- répondent plus mais dont les commandes restent arbitrables serait une coupure
-- à moitié faite, c'est-à-dire une coupure qui n'a pas eu lieu.
--
-- LA DÉCISION EST RÉVERSIBLE, et chaque arbitrage écrit sa ligne de journal. Un
-- client qui regarde mieux ses photos et change d'avis est un cas normal ; ce
-- qui ne doit pas se perdre, c'est l'HISTORIQUE de ses décisions, parce que
-- c'est la pièce qu'un vendeur produirait en cas de désaccord. La règle « le
-- statut ne recule jamais » vaut pour l'expédition, que le transporteur seul
-- connaît — pas pour un avis.
--
-- ELLE REND LE NOUVEAU STATUT, ou NULL. Jeton inconnu, jeton révoqué et compte
-- suspendu rendent tous NULL, par le même chemin : un code distinct dirait
-- laquelle des trois situations on vient de rencontrer.

create function public.arbitrer_qc(
  p_jeton text,
  p_decision text,
  p_commentaire text
)
  returns public.qc_status
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_order uuid;
  v_statut public.qc_status;
  v_commentaire text;
begin
  -- La valeur d'énumération est vérifiée AVANT d'être employée : une valeur
  -- citée mais absente ferait échouer l'écriture, et la transaction étant
  -- partagée, annulerait la mutation entière.
  if p_decision not in ('approuve', 'refuse') then
    raise exception 'décision inconnue : %', p_decision using errcode = '22023';
  end if;

  select o.id into v_order
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.profiles p on p.id = s.owner_id
  where o.public_token = p_jeton
    and p.status = 'active';

  if v_order is null then
    return null;
  end if;

  -- Tronqué EN BASE, pas seulement à la saisie. Une longueur validée uniquement
  -- côté application est une longueur que le prochain appelant ne validera pas,
  -- et la charge utile du journal est bornée par contrainte : un commentaire
  -- trop long ferait échouer l'arbitrage entier au lieu d'être raccourci.
  v_commentaire := left(coalesce(nullif(btrim(p_commentaire), ''), ''), 1000);

  v_statut := p_decision::public.qc_status;

  update public.orders
     set qc_status = v_statut
   where id = v_order;

  perform public.journaliser(
    v_order,
    case when v_statut = 'approuve' then 'qc_approuve' else 'qc_refuse' end,
    'client',
    case
      when v_commentaire = '' then '{}'::jsonb
      else jsonb_build_object('commentaire', v_commentaire)
    end
  );

  return v_statut;
end;
$$;

comment on function public.arbitrer_qc(text, text, text) is
  'Arbitrage QC par le porteur du jeton. Refait le filtre de suspension. Journalise chaque décision.';

-- Ouvert à `anon` EXPLICITEMENT — c'est le seul chemin d'écriture publique du
-- produit — et à personne d'autre par inadvertance.
revoke execute on function public.arbitrer_qc(text, text, text) from public;
grant execute on function public.arbitrer_qc(text, text, text) to anon, authenticated;
