-- 067 — L'inscription n'est comptée qu'une fois par compte.
--
-- DÉFAUT ÉTABLI PAR LECTURE DU CHEMIN. Le retour du lien magique émet
-- `inscription` quand `onboardingAFaire(profil)` est vrai, et le commentaire
-- affirme que « le critère rend l'émission naturellement unique ».
--
-- IL NE LA REND PAS UNIQUE. Le critère est `account_type is null`, qui reste
-- vrai TANT QUE l'onboarding n'est pas soumis. Un fournisseur qui demande un
-- lien, clique, tombe sur l'écran de bienvenue et ferme l'onglet — puis
-- recommence le lendemain, puis le surlendemain — produit TROIS événements
-- `inscription` pour UN compte.
--
-- POURQUOI C'EST PIRE QU'UN DOUBLON ORDINAIRE. L'inscription est le
-- DÉNOMINATEUR du taux d'activation. Un dénominateur gonflé fait BAISSER le
-- taux : on chercherait un problème d'activation chez des utilisateurs qui
-- n'existent pas. Et le biais est corrélé au comportement même qu'on mesure —
-- ceux qui recomptent sont exactement ceux qui n'activent pas — donc il
-- amplifie sa propre erreur.
--
-- LA MARQUE VIT EN BASE, comme celle de la création : une condition dérivée
-- d'un autre état n'est pas une marque, c'est une coïncidence. Et elle se REND
-- si l'émission échoue, pour la même raison que la 066.

alter table public.profiles
  add column signup_event_at timestamptz;

create function public.reclamer_evenement_inscription()
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select p.id into v_profil from public.profiles p where p.user_id = (select auth.uid());
  if v_profil is null then
    raise exception 'Aucun profil pour cet appelant.' using errcode = 'DL026';
  end if;

  -- LA CONDITION EST ÉVALUÉE PAR LA BASE, dans l'écriture elle-même : deux
  -- retours de lien simultanés ne peuvent pas produire deux émissions.
  update public.profiles
     set signup_event_at = now()
   where id = v_profil
     and signup_event_at is null;

  return found;
end;
$$;

create function public.liberer_evenement_inscription()
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_profil uuid;
begin
  select p.id into v_profil from public.profiles p where p.user_id = (select auth.uid());
  if v_profil is null then
    raise exception 'Aucun profil pour cet appelant.' using errcode = 'DL026';
  end if;

  update public.profiles
     set signup_event_at = null
   where id = v_profil
     and signup_event_at is not null;

  return found;
end;
$$;

revoke all on function public.reclamer_evenement_inscription() from public;
revoke all on function public.liberer_evenement_inscription() from public;
grant execute on function public.reclamer_evenement_inscription() to authenticated;
grant execute on function public.liberer_evenement_inscription() to authenticated;

-- REPRISE DE L'EXISTANT : tout compte ayant déjà terminé son onboarding a
-- forcément vu son événement partir au moins une fois. Poser la marque évite
-- une réémission au prochain passage — et l'on date de l'inscription, pas
-- d'aujourd'hui.
update public.profiles
   set signup_event_at = created_at
 where signup_event_at is null
   and account_type is not null;
