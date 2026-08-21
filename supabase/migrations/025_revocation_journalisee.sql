-- 025 — La révocation du lien écrit son événement.
--
-- LE PRINCIPE V L'EXIGE DEPUIS LE DÉBUT : « Aucune édition ne régénère le jeton.
-- Seule l'action explicite "révoquer et régénérer" le change, ET ELLE ÉCRIT UN
-- ÉVÉNEMENT. » La rotation existait depuis la migration 007 ; l'événement, non,
-- faute de table où l'écrire. L'exigence était donc à moitié tenue, et la moitié
-- manquante est celle qu'on ne voit pas — rien ne se comporte différemment quand
-- une trace n'est pas écrite.
--
-- C'EST LA TRACE QU'ON PRODUIRAIT EN CAS DE LITIGE : à quelle date le lien
-- envoyé à ce client a cessé de fonctionner. Sans elle, un vendeur ne peut ni
-- prouver ni dater sa propre décision.
--
-- LE JETON N'EST PAS DANS LA CHARGE UTILE, ni l'ancien ni le nouveau. Un jeton
-- ne transporte pas une donnée mais une CAPACITÉ, définitivement : l'écrire dans
-- un journal que d'autres écrans afficheront reviendrait à le republier sous un
-- autre nom. C'est précisément le défaut que le contrôle par VALEUR cherche.
--
-- `create or replace` sur la MÊME liste d'arguments : la fonction est bien
-- remplacée. Si la signature changeait, Postgres en créerait une SECONDE, les
-- deux coexisteraient, et un appel résoudrait l'ANCIENNE — sans erreur, donc
-- sans que rien ne signale que la révocation a cessé d'être tracée.

create or replace function public.regenerer_jeton_public(p_order_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_nouveau text;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL011';
  end if;

  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'DL012';
  end if;

  perform set_config('droplink.rotation_jeton', 'oui', true);

  update public.orders
  set public_token = public.generer_jeton_public(),
      unsubscribe_token = public.generer_jeton_public()
  where id = p_order_id
  returning public_token into v_nouveau;

  perform set_config('droplink.rotation_jeton', '', true);

  -- DANS LA MÊME TRANSACTION que la rotation. Une trace écrite après coup, dans
  -- un second appel, est une trace qui manque exactement les fois où quelque
  -- chose s'est mal passé.
  perform public.journaliser(p_order_id, 'lien_revoque', 'vendeur');

  return v_nouveau;
end;
$$;
