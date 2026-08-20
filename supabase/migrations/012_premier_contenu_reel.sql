-- 012 — La marque du PREMIER CONTENU RÉEL.
--
-- `order_created` est émis à la première sauvegarde de contenu réel, jamais à
-- l'ouverture de l'éditeur : un brouillon ouvert puis abandonné est exactement
-- le cas « teste une ou deux fois puis disparaît », et le compter comme une
-- création gonflerait la métrique de verdict du côté rassurant.
--
-- POURQUOI UNE FONCTION EN BASE ET PAS UNE ÉCRITURE APPLICATIVE.
--
-- `first_content_at` n'est PAS écrivable par `authenticated` — la migration 006
-- l'a délibérément laissée hors du `grant update`, parce que c'est une MESURE et
-- non une donnée du vendeur : la lui laisser écrire reviendrait à lui laisser
-- écrire notre métrique de verdict. Une écriture applicative avec le client à
-- session échouerait donc, et c'est ainsi que ce défaut a été trouvé.
--
-- Le contournement facile aurait été le client service-role. Il est refusé :
-- ici, un humain écrit ses PROPRES données, et c'est exactement le cas où la RLS
-- doit faire son travail. La fonction est `security definer`, mais elle vérifie
-- l'appartenance DANS SON CORPS — comme `regenerer_jeton_public`.
--
-- ELLE REND UN BOOLÉEN, et c'est le point : `order_created` ne doit être émis
-- qu'une fois. La condition `first_content_at is null` est évaluée par la BASE,
-- dans l'écriture elle-même. Deux sauvegardes simultanées ne peuvent donc pas
-- produire deux créations — une lecture suivie d'une écriture, elle, l'aurait
-- permis.

create function public.marquer_premier_contenu(p_order_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop uuid;
  v_marque boolean := false;
begin
  select public.mon_shop_id() into v_shop;
  if v_shop is null then
    raise exception 'Aucune boutique pour cet appelant.' using errcode = 'DL013';
  end if;

  -- `security definer` a mis la RLS de côté : l'appartenance se vérifie ici.
  -- Même réponse qu'une commande inexistante — distinguer les deux révélerait
  -- l'existence de la commande d'un autre vendeur.
  perform 1 from public.orders o where o.id = p_order_id and o.shop_id = v_shop;
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'DL014';
  end if;

  -- LES NOTES INTERNES NE COMPTENT PAS. Elles sont pour le vendeur, pas pour son
  -- client : une commande qui ne porte qu'une note n'a rien à montrer.
  update public.orders
  set first_content_at = now()
  where id = p_order_id
    and first_content_at is null
    and (
      coalesce(btrim(customer_label), '') <> ''
      or coalesce(btrim(product_ref), '') <> ''
      or coalesce(btrim(tracking_number), '') <> ''
    );

  if found then
    v_marque := true;
  end if;

  return v_marque;
end;
$$;

comment on function public.marquer_premier_contenu(uuid) is
  'Pose first_content_at si la commande porte du contenu réel. Rend true UNE SEULE fois.';

-- Postgres accorde EXECUTE à PUBLIC par défaut : un droit qui ne s'écrit pas
-- dans le corps de la fonction, donc qu'aucune relecture de code ne peut voir.
revoke execute on function public.marquer_premier_contenu(uuid) from public, anon;
grant execute on function public.marquer_premier_contenu(uuid) to authenticated;
