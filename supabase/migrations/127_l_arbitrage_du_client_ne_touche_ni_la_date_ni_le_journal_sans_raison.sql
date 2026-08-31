-- ═══════════════════════════════════════════════════════════════════════════
-- L'ARBITRAGE DU CLIENT NE DÉPLACE PAS LA DATE, ET N'ÉCRIT QUE S'IL DIT
-- QUELQUE CHOSE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Deux défauts du même appel, laissés ouverts par la migration 120 et fermés
-- ici après avoir tranché ce qu'elle laissait à Wassim.
--
-- ── 1. `updated_at` RÉPOND À UNE QUESTION, ET CE N'EST PAS CELLE-LÀ ─────────
--
-- La 120 a arrêté la CONSULTATION et signalé que l'ARBITRAGE déplaçait lui
-- aussi `updated_at`, en laissant l'arbitrage ouvert : une décision de contrôle
-- qualité change réellement l'état de la commande, contrairement à une simple
-- ouverture de lien.
--
-- La question est tranchée par la définition que la 090 a écrite, et qui n'a
-- jamais varié : `updated_at` répond à **« quand le VENDEUR a-t-il touché cette
-- commande »**. Un client qui approuve ses photos n'est pas le vendeur. Le tri
-- « modifiées » sert au vendeur à retrouver ce qu'IL a modifié ; y faire remonter
-- les décisions de ses clients lui rend un ordre qu'il ne peut pas prévoir, et
-- le brief dit ailleurs que ce tri est un outil de travail, pas un fil
-- d'actualité.
--
-- Ce que le vendeur perd : rien. `qc_status` porte la décision, l'historique
-- porte sa date et son auteur, et l'écran Commandes a un filtre QC dédié. La
-- donnée n'est pas effacée, elle est rangée là où elle répond à sa question.
--
-- ── 2. LE JOURNAL N'AVAIT AUCUNE BORNE ─────────────────────────────────────
--
-- `arbitrer_qc` journalisait à CHAQUE appel, y compris quand la décision est
-- identique à la précédente. Le jeton étant immuable à vie — y compris un lien
-- fuité — quiconque le détient pouvait inscrire 14 400 lignes par jour et par
-- adresse dans `order_events`, en restant sous le plafond d'écriture publique
-- (10/min). Le seul frein était un DÉBIT, jamais un CUMUL.
--
-- L'historique est la pièce qu'un vendeur produirait en cas de litige ; noyé
-- sous des milliers de lignes, il cesse d'être lisible. Et le compteur
-- d'approbations des analyses devient faux.
--
-- DEUX BORNES, ET AUCUNE NE GÊNE UN CLIENT RÉEL :
--
--   a. ON N'ÉCRIT QUE SI LA DÉCISION CHANGE. Réaffirmer la même décision ne dit
--      rien de neuf ; c'est sémantiquement correct, et cela ferme à lui seul le
--      cas courant — le script qui rappelle « approuve » en boucle.
--
--   b. AU-DELÀ DE 200 ARBITRAGES DANS LA JOURNÉE, on cesse d'écrire. La borne
--      est QUOTIDIENNE, pas totale : le lendemain, le client retrouve un journal
--      qui enregistre. Une borne totale aurait rendu la commande définitivement
--      muette, ce qui est pire que le mal.
--
--      ⚠️ L'ARBITRAGE LUI-MÊME N'EST JAMAIS REFUSÉ, et c'est délibéré : refuser
--      au-delà d'un seuil laisserait quiconque détient le lien EMPÊCHER le vrai
--      client d'approuver sa commande. On borne la trace, jamais le droit.
--
--      200 est très au-dessus de tout usage réel — un client qui hésite change
--      d'avis deux ou trois fois — et très en dessous des 14 400 que le débit
--      seul autorisait.
--
-- ⚠️ LE CORPS EST REPRIS DE `pg_get_functiondef`, comme pour la 121. Le
-- reconstruire de mémoire avait déjà failli réintroduire deux écarts.

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
  v_ancien public.qc_status;
  v_commentaire text;
  v_aujourdhui integer;
begin
  -- La valeur d'énumération est vérifiée AVANT d'être employée : une valeur
  -- citée mais absente ferait échouer l'écriture, et la transaction étant
  -- partagée, annulerait la mutation entière.
  if p_decision not in ('approuve', 'refuse') then
    raise exception 'décision inconnue : %', p_decision using errcode = '22023';
  end if;

  select o.id, o.qc_status into v_order, v_ancien
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

  -- LA DÉCLARATION D'AUTEUR EST DITE, PAS DEVINÉE (migration 121), ET
  -- L'ÉCRITURE EST DÉCLARÉE HORS-VENDEUR (migration 120) : les deux marqueurs
  -- sont locaux à la transaction et remis à vide juste après.
  perform set_config('droplink.arbitrage_du_client', 'oui', true);
  perform set_config('droplink.ecriture_hors_vendeur', 'oui', true);

  update public.orders
     set qc_status = v_statut,
         qc_decide_par = 'client'
   where id = v_order;

  perform set_config('droplink.arbitrage_du_client', '', true);
  perform set_config('droplink.ecriture_hors_vendeur', '', true);

  -- ── LE JOURNAL N'ENREGISTRE QUE CE QUI DIT QUELQUE CHOSE ──────────────────
  if v_ancien is distinct from v_statut then
    select count(*) into v_aujourdhui
    from public.order_events e
    where e.order_id = v_order
      and e.type in ('qc_approuve', 'qc_refuse')
      and e.occurred_at >= date_trunc('day', now());

    if v_aujourdhui < 200 then
      perform public.journaliser(
        v_order,
        case when v_statut = 'approuve' then 'qc_approuve' else 'qc_refuse' end,
        'client',
        case
          when v_commentaire = '' then '{}'::jsonb
          else jsonb_build_object('commentaire', v_commentaire)
        end
      );
    end if;
  end if;

  return v_statut;
end;
$$;

comment on function public.arbitrer_qc(text, text, text) is
  'Arbitrage du contrôle qualité par le destinataire, par jeton public. Ne déplace PAS updated_at — qui répond à « quand le vendeur a-t-il touché cette commande » — et n''écrit au journal que si la décision CHANGE, dans la limite de 200 par jour et par commande. La décision, elle, n''est jamais refusée : borner la trace ne doit pas laisser quiconque détient le lien empêcher le vrai client d''approuver.';

revoke all on function public.arbitrer_qc(text, text, text) from public;
grant execute on function public.arbitrer_qc(text, text, text) to anon, authenticated;
