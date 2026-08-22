-- 082 — TOUTE ROTATION DE JETON LAISSE SA TRACE, QUEL QUE SOIT LE CHEMIN.
--
-- L'immuabilité du `public_token` est l'invariant le plus lourd du produit : le
-- jeton ne transfère pas une donnée, il transfère une CAPACITÉ, définitivement.
-- Elle est gardée par un déclencheur, ce qui est le bon endroit. Mais la SEULE
-- PORTE de ce déclencheur est un réglage de session — `droplink.rotation_jeton`
-- — et un réglage de session se pose par `set_config`.
--
-- MESURÉ : `set_config('droplink.rotation_jeton', 'oui', true)` suivi d'un
-- `update` réécrit le jeton SANS écrire le moindre `lien_revoque`. Le lien du
-- client cesse de fonctionner, et rien nulle part ne dit pourquoi ni quand.
--
-- CE N'EST PAS ATTEIGNABLE PAR POSTGREST : les clients n'exécutent pas de SQL
-- libre, ils appellent des fonctions. Le chemin passe donc par une connexion
-- directe — un script de maintenance, une migration, une console. C'est-à-dire
-- par nous. Et c'est exactement pour cela qu'il faut le fermer : la trace sert
-- à répondre « pourquoi ce lien ne marche plus », et la réponse la plus
-- probable est « quelqu'un chez nous a lancé quelque chose ».
--
-- ON NE FERME PAS LA PORTE, ON LA TRACE. Chercher à empêcher `set_config`
-- reviendrait à courir après tous les moyens de le poser ; on renverse : le
-- déclencheur ÉCRIT la trace lui-même, sur `AFTER UPDATE`, dès que le jeton a
-- changé. L'invariant cesse d'être « seule cette fonction sait faire tourner un
-- jeton » — ce qui tenait à une convention — pour devenir « aucune rotation
-- n'existe sans trace », qui tient à la base.
--
-- UN FAIT, UN POINT D'ÉMISSION. `regenerer_jeton_public` écrivait la trace
-- elle-même ; elle ne l'écrit plus. Deux points d'émission pour un seul fait
-- rendent le double comptage inévitable, et l'historique d'une commande est
-- précisément l'endroit où une ligne en double se lit comme deux révocations.

create function public.tracer_rotation_jeton()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.public_token is distinct from old.public_token then
    -- `journaliser` et non `journaliser_vendeur` : la rotation peut venir d'un
    -- chemin SANS vendeur connecté — c'est même le cas qui motive ce
    -- déclencheur. Une trace qui exigerait une session serait absente
    -- exactement dans le cas où elle sert.
    perform public.journaliser(new.id, 'lien_revoque', 'vendeur');
  end if;

  return new;
end;
$$;

comment on function public.tracer_rotation_jeton() is
  'Écrit `lien_revoque` dès que le jeton public change, QUEL QUE SOIT le chemin. L''invariant n''est plus « seule cette fonction sait », c''est « aucune rotation sans trace ».';

revoke all on function public.tracer_rotation_jeton() from public, anon, authenticated;

create trigger orders_tracer_rotation_jeton
  after update of public_token on public.orders
  for each row execute function public.tracer_rotation_jeton();

/*
 * `regenerer_jeton_public` cesse d'écrire la trace : le déclencheur s'en charge.
 *
 * Le reste du corps est celui du dépôt, mot pour mot. Le seul retrait est
 * l'appel à `journaliser`, devenu un doublon.
 */
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

  return v_nouveau;
end;
$$;

revoke execute on function public.regenerer_jeton_public(uuid) from public, anon;
grant execute on function public.regenerer_jeton_public(uuid) to authenticated;

/*
 * LE DROIT DE SUPPRIMER UNE COMMANDE EST RETIRÉ À `authenticated`.
 *
 * Le produit ne supprime aucune commande : il ARCHIVE. Une recherche dans le
 * dépôt ne trouve qu'une seule suppression, et elle porte sur les médias. Le
 * droit était donc accordé à personne — au sens où aucun code ne s'en sert —
 * mais accordé quand même.
 *
 * Ce que cela permettait : un compte pouvait faire redescendre sa propre courbe
 * d'usage. Les commandes créées sont une MÉTRIQUE DE VERDICT de la phase de
 * validation ; les rendre effaçables par celui qu'elles mesurent, c'est rendre
 * le verdict négociable. Et la disparition ne laisserait aucune trace : les
 * lignes de `order_events` partent en cascade avec la commande.
 *
 * `service_role` et `postgres` gardent le leur : la suppression d'un compte
 * doit continuer d'emporter ses données.
 *
 * Une protection qui tient à ce que personne n'ait encore écrit l'appel n'est
 * pas une protection. La phrase juste était « ce serait effaçable si quelqu'un
 * ajoutait un bouton », et un bouton « supprimer » est ce qu'on ajoute sans y
 * penser.
 */
revoke delete on public.orders from authenticated;
drop policy if exists orders_suppression on public.orders;
