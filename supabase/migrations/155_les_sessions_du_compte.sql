/*
 * LES SESSIONS DU COMPTE — « Voir les sessions », sur l'écran « Paramètres ».
 *
 * POURQUOI UNE FONCTION. `auth.sessions` vit hors du schéma exposé, et c'est
 * bien : PostgREST ne doit jamais la parcourir. Le vendeur a pourtant le droit
 * de savoir quels appareils tiennent son compte — c'est la seule façon de
 * décider en connaissance de cause s'il faut les déconnecter. La fonction rend
 * donc SES sessions et rien d'autre, et le filtre vit dans son corps : aucun
 * argument ne désigne un compte, donc aucun argument ne peut en désigner un
 * autre.
 *
 * ⚠️ CE QU'ELLE NE REND PAS, ET C'EST DÉLIBÉRÉ :
 *  - L'ADRESSE IP. Une session volée afficherait à l'intrus toutes les adresses
 *    du propriétaire — son domicile, son travail. L'appareil et la dernière
 *    activité suffisent à reconnaître les siens.
 *  - LES JETONS, les clés HMAC, le compteur de rafraîchissement : ce qui permet
 *    de REJOUER une session n'a rien à faire dans une liste.
 *
 * « CET APPAREIL » vient du jeton de l'appelant (`session_id`), jamais d'un
 * paramètre : sans quoi l'écran pourrait être amené à marquer comme sienne la
 * session d'un autre, et le vendeur la garderait en croyant garder la sienne.
 *
 * `security definer` parce qu'`authenticated` n'a aucun droit sur `auth`, et
 * `search_path` épinglé. Exécution accordée à `authenticated` SEUL : un anonyme
 * n'a pas de compte, donc rien à lister.
 */
create function public.lister_mes_sessions()
  returns table (
    id uuid,
    creee_le timestamptz,
    active_le timestamptz,
    agent text,
    cet_appareil boolean
  )
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at at time zone 'UTC', s.updated_at, s.created_at),
         left(s.user_agent, 400),
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
    from auth.sessions s
   where s.user_id = auth.uid()
     and (s.not_after is null or s.not_after > now())
   order by 3 desc
   limit 50;
$$;

revoke all on function public.lister_mes_sessions() from public;
revoke all on function public.lister_mes_sessions() from anon;
grant execute on function public.lister_mes_sessions() to authenticated;
