/*
 * UN COMMENTAIRE CONTENANT DES CARACTÈRES DE CONTRÔLE FAISAIT PERDRE LA
 * DÉCISION DU CLIENT — EN SILENCE, ET EN LE PUNISSANT.
 *
 * DÉFAUT MESURÉ LE 02/09/2026, de bout en bout sur le serveur servi :
 *
 *   commentaire absent         200 · qc en_attente -> approuve
 *   1 000 × « a »              200 · qc en_attente -> approuve
 *   600 × U+0001               200 · qc en_attente -> approuve
 *   700 × U+0001               404 · qc RESTE en_attente
 *   1 000 × U+0001             404 · qc RESTE en_attente
 *
 * DEUX UNITÉS POUR UNE SEULE RÈGLE, ET C'EST TOUT LE DÉFAUT. La troncature
 * compte des CARACTÈRES (`left(…, 1000)`) ; la contrainte du journal
 * (`order_events_payload_taille`) compte le JSON RENDU, plafonné à 4 000. Un
 * caractère de contrôle s'échappe en six caractères dans un JSON, donc mille
 * d'entre eux rendent 6 019 :
 *
 *   length(jsonb_build_object('commentaire', repeat(chr(1),1000))::text) = 6019
 *   length(jsonb_build_object('commentaire', repeat('a',   1000))::text) = 1019
 *
 * `journaliser()` est appelée par `perform` DANS la transaction d'`arbitrer_qc`.
 * Son refus (`23514`) emportait donc l'`update orders` avec lui : la décision
 * du client était annulée, et il recevait `{"erreur":"introuvable"}` —
 * c'est-à-dire le message réservé au lien mort. Le vendeur, lui, ne voyait ni
 * décision ni ligne de journal : son client « n'avait jamais répondu ».
 *
 * ⚠️ ET LE CLIENT ÉTAIT COMPTÉ COMME BALAYEUR DE JETONS. Ce 404-là sort par la
 * branche des jetons inconnus, donc `signalerJetonInconnu()` était appelée.
 * Mesuré : le compteur `publique-inconnu` passe bien de 0 à 1, alors qu'un
 * corps refusé par Zod, lui, ne l'arme pas. À vingt armements dans la fenêtre,
 * `verifierQuotaPublique()` refuse et SA PROPRE PAGE DE COMMANDE devient un 404
 * pour lui. C'est exactement le dommage que le commentaire de la route dit
 * avoir fermé : la distinction a été écrite pour l'échec Zod, au-dessus, et ne
 * voyait pas l'échec qui se produit EN BASE, en dessous. L-025 dans sa forme
 * exacte — le garde regarde là où le défaut n'est plus.
 *
 * LE CORRECTIF EST L'ASSAINISSEMENT, PAS UN PLAFOND PLUS HAUT. Un commentaire
 * de client ne contient pas légitimement de caractère de contrôle ; les
 * relever du plafond du journal ne ferait que déplacer la borne, et la même
 * divergence d'unités reviendrait au premier champ ajouté à la charge utile.
 *
 * CE QUE LE TEXTE LÉGITIME NE PERD PAS — mesuré, cas par cas : accents, emoji,
 * cyrillique, chinois, arabe, sauts de ligne et tabulations. Seuls tombent les
 * caractères non imprimables. Après assainissement, le pire cas construit
 * exprès (mille guillemets, mille antislashs, mélange hostile) rend 2 080
 * caractères de JSON — la moitié du plafond.
 *
 * ⚠️ LE CORPS EST REPRIS DE `pg_get_functiondef`, comme pour les 121 et 127, et
 * une seule ligne change. Le reconstruire de mémoire avait déjà failli
 * réintroduire deux écarts, et vient de faire diverger une contrainte de la
 * migration 133 en une seule passe.
 */

-- DROP EXPLICITE : la règle du projet, et la seule façon d'être certain qu'une
-- liste d'arguments identique ne masque pas une seconde surcharge.
drop function if exists public.arbitrer_qc(text, text, text);

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

  /*
   * ASSAINI PUIS TRONQUÉ, EN BASE, ET DANS CET ORDRE.
   *
   * Tronquer d'abord ne suffisait pas : mille caractères tronqués peuvent
   * rendre six mille caractères de JSON. C'est le retrait des caractères non
   * imprimables qui borne le RENDU, et la troncature qui borne la longueur
   * lisible. Les deux, parce qu'elles ne bornent pas la même chose.
   *
   * `[:print:]` couvre l'Unicode imprimable en UTF-8 — les accents, les emoji
   * et les alphabets non latins passent. Le saut de ligne et la tabulation sont
   * exemptés nommément : ce sont les deux seuls caractères de contrôle qu'un
   * client tape volontairement.
   */
  v_commentaire := left(
    regexp_replace(
      coalesce(nullif(btrim(p_commentaire), ''), ''),
      '[^\n\t[:print:]]', '', 'g'
    ),
    1000
  );

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
  'Arbitrage du contrôle qualité par le destinataire, par jeton public. Le commentaire est ASSAINI (caractères non imprimables retirés) puis tronqué : la troncature borne la longueur lisible, l''assainissement borne le JSON rendu, et le journal est plafonné sur ce dernier. Ne déplace PAS updated_at, et n''écrit au journal que si la décision CHANGE, dans la limite de 200 par jour et par commande.';

-- Les droits ne survivent PAS au drop : reposés à l'identique.
revoke all on function public.arbitrer_qc(text, text, text) from public;
grant execute on function public.arbitrer_qc(text, text, text) to anon, authenticated;
