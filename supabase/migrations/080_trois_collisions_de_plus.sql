-- 080 — TROIS COLLISIONS QUE L'INVENTAIRE A FAIT LEVER, ET QUE LA RELECTURE
-- N'AVAIT PAS VUES.
--
-- La migration précédente sur ce sujet corrigeait quatre collisions repérées à
-- la main. La sonde d'inventaire, elle, interroge le CATALOGUE et rend tous les
-- couples (code, message) de toutes les fonctions. Elle en a trouvé trois de
-- plus — dont la plus lourde du produit :
--
--   DL010  « Le jeton PUBLIC est immuable »  ET  « Le jeton de DÉSABONNEMENT
--          est immuable ». Le brief pose « un jeton, un pouvoir » comme
--          principe : l'un donne accès à toute la commande, à vie ; l'autre
--          désinscrit d'un email. Les faire porter le même code, c'est
--          interdire à un appelant de distinguer une tentative de rotation du
--          lien public d'une modification anodine. Le code fait partie du
--          contrat, et celui-là gardait l'invariant le plus lourd du produit.
--
--   DL032  « motif obligatoire » (suspension d'un compte)  ET  « cle
--          obligatoire » (écriture d'un paramètre système). Deux surfaces
--          administratives sans rapport, un seul code.
--
--   DL033  « auto-suspension refusée »  ET  « le colis et la commande
--          n'appartiennent pas au même vendeur ». Sans le moindre rapport, et
--          celle-là est arrivée récemment : la migration 063 a pris un code déjà
--          pris, parce que rien ne l'en empêchait.
--
-- C'EST LA TROISIÈME FOIS QUE CE MOTIF SE PRÉSENTE : une propriété qui vit dans
-- la base est invisible à toute relecture de code. Un code d'erreur est éparpillé
-- dans quatre-vingts fichiers ; personne ne tient la liste de tête. La vraie
-- correction n'est donc aucune de ces trois lignes — c'est l'inventaire qui les
-- a trouvées, et qui échouera la prochaine fois.

/*
 * LE JETON PUBLIC ET LE JETON DE DÉSABONNEMENT SE SÉPARENT.
 *
 * DL010 reste au jeton PUBLIC : c'est lui qui est cité partout, et c'est celui
 * dont l'immuabilité fait l'objet d'une suite jamais désactivable. Le jeton de
 * désabonnement prend DL041.
 *
 * LES TROIS CORPS CI-DESSOUS SONT CEUX DES MIGRATIONS D'ORIGINE, MOT POUR MOT,
 * aux seuls codes près — type de retour, volatilité, sous-requêtes et sorties
 * anticipées comprises. Les réécrire « en mieux » au passage aurait mêlé un
 * changement de contrat à un changement de comportement, et rendu impossible de
 * dire lequel des deux a cassé quoi.
 */
create or replace function public.jeton_public_immuable()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.public_token is distinct from old.public_token then
    -- LA SEULE PORTE : un drapeau de session que seule la fonction de rotation
    -- pose. Les clients passent par PostgREST et n'exécutent pas de SQL libre ;
    -- ils ne peuvent donc pas le poser eux-mêmes.
    if coalesce(current_setting('droplink.rotation_jeton', true), '') <> 'oui' then
      raise exception
        'Le jeton public est immuable. Utiliser public.regenerer_jeton_public().'
        -- Code métier DÉLIBÉRÉMENT NON RÉESSAYABLE. Un refus métier qui
        -- porterait « 40001 » serait interprété comme un conflit de
        -- sérialisation, et la couche de reprise le rejouerait en boucle : un
        -- refus définitif deviendrait une tempête de requêtes.
        using errcode = 'DL010';
    end if;
  end if;

  if new.unsubscribe_token is distinct from old.unsubscribe_token then
    if coalesce(current_setting('droplink.rotation_jeton', true), '') <> 'oui' then
      raise exception
        'Le jeton de désabonnement est immuable.'
        using errcode = 'DL041';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.jeton_public_immuable() from public, anon, authenticated;

/* La clé manquante d'un paramètre système prend son propre code. */
create or replace function public.ecrire_parametre(p_cle text, p_valeur jsonb)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if nullif(btrim(coalesce(p_cle, '')), '') is null then
    raise exception 'cle obligatoire' using errcode = 'DL042';
  end if;

  insert into public.system_settings (key, value, updated_by)
  values (
    btrim(p_cle),
    p_valeur,
    (select p.id from public.profiles p where p.user_id = (select auth.uid()))
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.ecrire_parametre(text, jsonb) from public;
grant execute on function public.ecrire_parametre(text, jsonb) to authenticated;

/* Le croisement colis / commande prend son propre code. */
create or replace function public.verifier_colis_du_meme_vendeur()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_shop_commande uuid;
  v_shop_colis    uuid;
begin
  select o.shop_id into v_shop_commande from public.orders o where o.id = new.order_id;
  select tp.shop_id into v_shop_colis from public.tracked_parcels tp where tp.id = new.parcel_id;

  -- Une extrémité absente : les clés étrangères refuseront de toute façon. On
  -- ne double pas leur message, on les laisse parler.
  if v_shop_commande is null or v_shop_colis is null then
    return new;
  end if;

  if v_shop_commande <> v_shop_colis then
    raise exception 'le colis et la commande n''appartiennent pas au meme vendeur'
      using errcode = 'DL043';
  end if;

  return new;
end;
$$;

revoke all on function public.verifier_colis_du_meme_vendeur() from public;
