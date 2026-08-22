-- 069 — Dire QUI a arbitré le contrôle qualité.
--
-- DÉFAUT TROUVÉ PAR AUDIT, et c'est un mensonge fait au client. Le vendeur peut
-- écrire `qc_status` depuis son éditeur — c'est une fonction voulue, il reçoit
-- parfois la réponse de son client par message privé et la reporte. Mais la
-- page publique affiche alors, au client : « VOUS avez validé cette commande ».
--
-- Le client lit une phrase qui parle de lui et qui est fausse. C'est le
-- principe XII pris à l'envers : l'interface affirme un état que personne n'a
-- produit. Et la conséquence n'est pas seulement cosmétique — c'est cette
-- phrase que le vendeur pourrait invoquer en cas de litige.
--
-- Second effet, sur la mesure : `analyser_activite` compte les approbations
-- sans distinguer l'auteur. Le compteur mélangeait une décision du client et un
-- report du vendeur, deux faits qui n'ont pas le même sens.
--
-- LE VENDEUR NE PEUT PAS ÉCRIRE CETTE COLONNE : elle n'est dans aucun `grant`,
-- ni en insertion ni en modification. Elle est posée soit par `arbitrer_qc`
-- — la voie du client, `security definer` —, soit par le déclencheur, qui
-- comble « vendeur » quand le statut change sans que l'auteur ait été déclaré.

alter table public.orders
  add column qc_decide_par text
    check (qc_decide_par is null or qc_decide_par in ('vendeur', 'client'));

create function public.qui_a_arbitre_le_qc()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Le statut change ET l'auteur n'a pas été déclaré dans la même instruction :
  -- c'est donc une écriture directe, celle de l'éditeur du vendeur.
  if new.qc_status is distinct from old.qc_status
     and new.qc_decide_par is not distinct from old.qc_decide_par then
    new.qc_decide_par := 'vendeur';
  end if;

  return new;
end;
$$;

revoke all on function public.qui_a_arbitre_le_qc() from public;

create trigger orders_qui_a_arbitre_le_qc
  before update of qc_status on public.orders
  for each row execute function public.qui_a_arbitre_le_qc();

create or replace function public.arbitrer_qc(
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
     set qc_status = v_statut,
         -- QUI A DÉCIDÉ, écrit dans la même instruction que la décision. Le
         -- déclencheur ne comblera donc pas cette colonne : il ne le fait que
         -- lorsqu'elle n'a pas bougé, c'est-à-dire quand c'est le vendeur qui
         -- écrit le statut depuis son éditeur.
         qc_decide_par = 'client'
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
