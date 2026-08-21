-- 043 — Suspendre un compte, et pouvoir le prouver.
--
-- C'EST LA CAPACITÉ QUI FONDE NOTRE STATUT D'HÉBERGEUR. Tout le reste du produit
-- peut être refait ; celle-ci est la seule dont l'absence nous expose
-- directement. D'où l'attention disproportionnée qu'elle reçoit.
--
-- LA CHAÎNE COMPLÈTE : suspension en base → la fonction de lecture publique
-- filtre `profiles.status = 'active'` → la page cesse d'être servie. Son mode de
-- défaillance est SILENCIEUX : si un maillon manquait, rien n'échouerait — le
-- statut serait écrit, l'audit consigné, l'écran afficherait « suspendu », et la
-- page publique continuerait de répondre. Tout dirait que le compte est coupé.
-- Il ne le serait pas.
--
-- `security definer` parce que `profiles.status` n'est accordé en écriture à
-- PERSONNE : c'est un privilège de colonne, évalué avant toute policy, et c'est
-- ce qui empêche un vendeur de se réactiver lui-même.
--
-- TROIS REFUS, ET CHACUN A SA RAISON :
--
--   1. On ne se suspend pas soi-même. Le geste est irréversible depuis
--      l'intérieur : l'administrateur perdrait son propre accès et plus personne
--      ne pourrait le rétablir.
--   2. On ne suspend pas un autre administrateur. Un compte d'administration
--      compromis pourrait sinon couper tous les autres en quelques secondes, et
--      il ne resterait aucun chemin de récupération.
--   3. Le motif est OBLIGATOIRE et non vide. C'est la pièce qu'on demanderait en
--      cas de litige. Une suspension sans motif est une décision qu'on ne peut
--      plus justifier six mois plus tard, quand celui qui l'a prise ne s'en
--      souvient plus.

create function public.suspendre_compte(
  p_profil  uuid,
  p_motif   text,
  p_ip_hash text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id   uuid;
  v_motif      text := nullif(btrim(coalesce(p_motif, '')), '');
  v_cible_role public.user_role;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_motif is null then
    -- Refus MÉTIER, donc code d'erreur distinct et NON réessayable. Un refus
    -- métier qui porterait un SQLSTATE réessayable transformerait un « non » en
    -- boucle : le code d'erreur fait partie du contrat.
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  if p_profil = v_admin_id then
    raise exception 'auto-suspension refusee' using errcode = 'DL033';
  end if;

  select p.role into v_cible_role from public.profiles p where p.id = p_profil;

  if v_cible_role is null then
    -- Compte absent : même sortie qu'un refus d'autorisation. Distinguer les
    -- deux permettrait d'énumérer les identifiants existants.
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_cible_role = 'admin' then
    raise exception 'suspension d''un administrateur refusee' using errcode = 'DL034';
  end if;

  -- L'AUDIT AVANT L'ÉCRITURE, dans la même transaction. Écrit après, il serait
  -- sauté par toute sortie anticipée qu'on ajouterait plus tard — et une
  -- suspension non tracée est exactement celle qu'on ne saurait pas justifier.
  perform public.journaliser_admin(
    'compte.suspension', 'profiles', p_profil::text, p_profil, p_ip_hash,
    jsonb_build_object('motif', v_motif)
  );

  update public.profiles set status = 'suspended' where id = p_profil;

  return true;
end;
$$;

comment on function public.suspendre_compte(uuid, text, text) is
  'Suspend un compte. Motif obligatoire, tracé en clair dans le journal.';

revoke all on function public.suspendre_compte(uuid, text, text) from public;
grant execute on function public.suspendre_compte(uuid, text, text) to authenticated;

/*
 * RÉACTIVER — et la réactivation rétablit les pages SUR LES MÊMES LIENS.
 *
 * Le `public_token` est immuable à vie : rien ici ne le touche. Un compte
 * réactivé retrouve exactement les liens qu'il avait envoyés, ce qui est la
 * seule façon de rendre la suspension réversible pour ses clients aussi.
 *
 * Elle est tracée comme la suspension : une réactivation non consignée laisserait
 * un compte revenir en service sans que rien ne dise qui l'a décidé.
 */
create function public.reactiver_compte(
  p_profil  uuid,
  p_motif   text,
  p_ip_hash text
)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_motif    text := nullif(btrim(coalesce(p_motif, '')), '');
  v_existe   boolean;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.user_id = (select auth.uid())
    and p.role = 'admin'
    and p.status = 'active';

  if v_admin_id is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_motif is null then
    raise exception 'motif obligatoire' using errcode = 'DL032';
  end if;

  select true into v_existe from public.profiles p where p.id = p_profil;
  if v_existe is null then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  perform public.journaliser_admin(
    'compte.reactivation', 'profiles', p_profil::text, p_profil, p_ip_hash,
    jsonb_build_object('motif', v_motif)
  );

  update public.profiles set status = 'active' where id = p_profil;

  return true;
end;
$$;

comment on function public.reactiver_compte(uuid, text, text) is
  'Réactive un compte. Les pages publiques reviennent sur les MÊMES liens.';

revoke all on function public.reactiver_compte(uuid, text, text) from public;
grant execute on function public.reactiver_compte(uuid, text, text) to authenticated;
