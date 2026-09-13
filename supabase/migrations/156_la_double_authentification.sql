/*
 * LA DOUBLE AUTHENTIFICATION — ce que la base exige d'un compte qui l'a activée.
 *
 * POURQUOI EN BASE. L'écran de vérification et les gardes de l'application
 * redirigent une session qui n'a pas saisi son code ; mais une redirection est
 * une règle d'APPLICATION, et le jeton d'accès, lui, parle directement à
 * PostgREST. Quelqu'un qui connaît le mot de passe sans avoir le téléphone
 * obtient une session `aal1` parfaitement valide : sans cette migration, il
 * lirait les commandes, les notes internes et les `public_token` en appelant
 * l'API à la main, et la double authentification ne protégerait qu'un écran.
 *
 * ⚠️ POURQUOI UN `db_pre_request` ET PAS DES POLICIES. Des policies RESTRICTIVES
 * sur chaque table protégeraient les tables — et pas les fonctions
 * `security definer`, qui contournent la RLS par construction : analyses,
 * listes, écritures. Il faudrait ajouter la garde dans le corps de chacune, et
 * la suivante l'oublierait (L-029). Le crochet de PostgREST s'exécute AVANT
 * CHAQUE requête, table ou fonction, et une seule fonction le porte.
 *
 * CE QU'IL EXIGE : un compte qui porte au moins un facteur VÉRIFIÉ doit
 * présenter un jeton `aal2`. Un compte sans facteur, un anonyme, le rôle de
 * service passent — `auth.uid()` est nul pour les deux derniers, et un facteur
 * seulement ENRÔLÉ (non vérifié) ne protège encore rien.
 *
 * Ce crochet ne voit PAS le serveur d'authentification : défi, vérification,
 * déconnexion restent donc possibles depuis une session `aal1` — c'est
 * précisément ce qui permet de saisir son code. Et Supabase refuse de lui-même,
 * en `aal1`, de changer le mot de passe, l'adresse ou de retirer un facteur :
 * mesuré le 13/09/2026 sur la base de tests.
 */
create function public.exiger_aal_du_compte()
  returns void
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then
    return;
  end if;
  if exists (
    select 1
      from auth.mfa_factors f
     where f.user_id = auth.uid()
       and f.status = 'verified'
  ) then
    -- 42501 et non une erreur applicative : pour l'appelant, c'est un refus de
    -- droit, et le message ne dit rien de plus que ce que l'écran dit déjà.
    raise exception 'verification en deux etapes requise'
      using errcode = '42501';
  end if;
end;
$$;

-- PostgREST appelle le crochet avec le rôle de la requête : `anon`,
-- `authenticated` et `service_role` doivent pouvoir l'exécuter, sans quoi CHAQUE
-- requête échouerait. Il ne rend rien et n'écrit rien : l'exposer ne donne rien.
revoke all on function public.exiger_aal_du_compte() from public;
grant execute on function public.exiger_aal_du_compte() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.exiger_aal_du_compte';

notify pgrst, 'reload config';

/*
 * « LA DOUBLE AUTHENTIFICATION EST-ELLE ACTIVE SUR MON COMPTE ? » — pour l'écran
 * « Paramètres ». `authenticated` n'a aucun droit sur `auth.mfa_factors`
 * (mesuré) : la fonction rend les facteurs TOTP VÉRIFIÉS de l'appelant, leur
 * identifiant et leur date, jamais leur secret.
 */
create function public.lister_mes_facteurs()
  returns table (id uuid, cree_le timestamptz)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select f.id, f.created_at
    from auth.mfa_factors f
   where f.user_id = auth.uid()
     and f.factor_type = 'totp'
     and f.status = 'verified'
   order by f.created_at;
$$;

revoke all on function public.lister_mes_facteurs() from public;
revoke all on function public.lister_mes_facteurs() from anon;
grant execute on function public.lister_mes_facteurs() to authenticated;
