-- 048 — Lister les paramètres ÉCRITS, pour distinguer « décidé » de « subi ».
--
-- `lire_parametre_entier` rend une valeur, jamais son origine : un seuil de
-- 1 200 rendu par le défaut et un seuil de 1 200 écrit un soir par quelqu'un
-- sont indiscernables. Or ce sont deux situations opposées — la première n'a
-- jamais été décidée, la seconde l'a été et peut être remise en cause.
--
-- C'EST LE MÊME MOTIF QUE `scheduler_heartbeat` : l'ABSENCE de ligne EST une
-- information. Trois états, pas deux : « jamais décidé » (aucune ligne),
-- « décidé » (ligne présente), et la valeur elle-même. Insérer les défauts en
-- base au démarrage effacerait le premier état, définitivement.
--
-- `stable` : cette fonction ne doit rien écrire, et PostgREST l'exécute en
-- transaction lecture seule — le moteur refusera toute écriture qu'on y
-- ajouterait plus tard. La garde ne tient pas à la relecture du corps.
--
-- ELLE N'AUDITE PAS, et c'est délibéré : l'audit trace un HUMAIN qui lit les
-- données d'un TIERS. Un seuil du produit n'appartient à personne. L'auditer
-- noierait les vraies consultations de comptes, qui sont ce qu'on relit en cas
-- de litige.
create function public.lister_parametres()
  returns table (
    cle          text,
    valeur       jsonb,
    modifie_le   timestamptz,
    modifie_par  text
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  -- ELLE REFUSE, elle ne rend pas un ensemble vide. Un ensemble vide serait ici
  -- indiscernable de « aucun paramètre n'a jamais été écrit », qui est l'état
  -- NORMAL du produit : un appelant sans droits lirait donc les défauts en
  -- croyant lire la configuration. Un refus se voit, un vide se confond.
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select
    s.key,
    s.value,
    s.updated_at,
    -- NULL quand le compte a été supprimé (`on delete set null`). L'écran le
    -- NOMME au lieu de l'omettre : côté administration, une case vide ferait
    -- croire qu'il n'y a rien à savoir.
    p.email
  from public.system_settings s
  left join public.profiles p on p.id = s.updated_by
  order by s.key;
end;
$$;

comment on function public.lister_parametres() is
  'Rend les paramètres ÉCRITS. Une clé absente n''a jamais été décidée : son défaut vient de l''appel.';

revoke all on function public.lister_parametres() from public;
grant execute on function public.lister_parametres() to authenticated;
