-- ═══════════════════════════════════════════════════════════════════════════
-- UNE RÉVISION DU CLIENT RESTE DU CLIENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ DÉFAUT RÉEL, PROUVÉ PAR EXÉCUTION LE 31/08/2026, en transaction annulée,
-- en appelant deux fois `arbitrer_qc` sur le MÊME jeton public :
--
--     1re décision (approuve) → qc_decide_par = 'client'   ✅
--     RÉVISION   (refuse)     → qc_decide_par = 'vendeur'  ❌
--
-- ── LE COMMENTAIRE DISAIT VRAI, LE CODE FAISAIT AUTRE CHOSE ────────────────
--
-- La migration 069 déclare : « le statut change ET l'auteur n'a pas été DÉCLARÉ
-- DANS LA MÊME INSTRUCTION ». L'implémentation testait en réalité « l'auteur
-- n'a pas CHANGÉ DE VALEUR » :
--
--     and new.qc_decide_par is not distinct from old.qc_decide_par
--
-- Sur la PREMIÈRE décision, `old` vaut NULL et `new` vaut 'client' : distinct,
-- le déclencheur n'écrase pas — d'où deux tests verts. Sur une RÉVISION, les
-- deux valent 'client' : `is not distinct`, et le déclencheur écrase à
-- 'vendeur'.
--
-- La réversibilité est pourtant une DÉCISION PRODUIT explicite de la 024 : « un
-- client qui regarde mieux ses photos et change d'avis est un cas normal ». La
-- colonne existe précisément pour ne pas écrire « VOUS avez validé » à quelqu'un
-- qui n'a rien validé ; sur une révision, elle disait exactement l'inverse.
--
-- Le défaut est LATENT — aucun écran ne lit encore `qc_decide_par` — et c'est
-- la seule raison pour laquelle il n'a blessé personne. Il aurait mordu le jour
-- où la page publique s'en serait servie, c'est-à-dire longtemps après que la
-- donnée fausse se soit accumulée.
--
-- ── LE MARQUEUR DIT CE QUE LA COMPARAISON NE POUVAIT PAS DIRE ──────────────
--
-- « L'auteur a-t-il été déclaré par cette instruction ? » n'est pas lisible
-- depuis `old` et `new` : réécrire la même valeur est indiscernable de ne pas y
-- toucher. Seul l'appelant le sait, donc c'est l'appelant qui le dit — par un
-- marqueur LOCAL à la transaction, du mécanisme déjà employé par la 090 pour
-- l'ingestion de suivi.
--
-- ⚠️ LE CORPS D'`arbitrer_qc` CI-DESSOUS EST REPRIS DE `pg_get_functiondef`,
-- pas reconstruit de mémoire. Le reconstruire aurait réintroduit deux écarts
-- relevés à la relecture : le code d'erreur (`22023`, et non un code `DL`) et
-- la troncature par `v_commentaire`.

create or replace function public.qui_a_arbitre_le_qc()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  -- Le statut change ET aucune instruction n'a déclaré l'auteur : c'est donc
  -- une écriture directe, celle de l'éditeur du vendeur.
  if new.qc_status is distinct from old.qc_status
     and coalesce(current_setting('droplink.arbitrage_du_client', true), '') <> 'oui' then
    new.qc_decide_par := 'vendeur';
  end if;

  return new;
end;
$$;

comment on function public.qui_a_arbitre_le_qc() is
  'Comble « vendeur » quand le statut QC change sans qu''aucune instruction ait déclaré l''auteur. La déclaration passe par le marqueur droplink.arbitrage_du_client, posé par arbitrer_qc : comparer old et new ne pouvait pas distinguer une révision du client d''une valeur inchangée, et attribuait donc au vendeur toute décision revue par le client.';

revoke all on function public.qui_a_arbitre_le_qc() from public;

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

  -- LA DÉCLARATION D'AUTEUR EST DITE, PAS DEVINÉE. Le marqueur est local à la
  -- transaction et remis à vide juste après l'écriture, pour qu'une écriture
  -- ultérieure de la même transaction retrouve le comportement par défaut.
  perform set_config('droplink.arbitrage_du_client', 'oui', true);

  update public.orders
     set qc_status = v_statut,
         qc_decide_par = 'client'
   where id = v_order;

  perform set_config('droplink.arbitrage_du_client', '', true);

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
  'Arbitrage du contrôle qualité par le destinataire, par jeton public. Pose droplink.arbitrage_du_client pour que le déclencheur d''attribution n''écrase pas l''auteur lors d''une RÉVISION — un client qui change d''avis reste un client.';

-- ⚠️ `create or replace` conserve l'ACL, mais on la repose explicitement : le
-- jour où cette fonction devra être `drop`ée, les droits partiront avec elle et
-- la ligne manquante ne se verrait qu'à l'usage.
revoke all on function public.arbitrer_qc(text, text, text) from public;
grant execute on function public.arbitrer_qc(text, text, text) to anon, authenticated;
