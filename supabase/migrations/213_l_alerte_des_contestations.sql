-- 213 — L'ALERTE DES CONTESTATIONS EN ATTENTE, SUR LA VUE D'ENSEMBLE DE L'ADMINISTRATION
--
-- Décision de Mehdi du 03/10/2026 (contre-audit, D3) : la maquette (`admin.html`) ouvre la vue
-- d'ensemble sur une alerte « Une contestation attend votre réponse », avec la référence de la
-- plus ancienne et sa date d'envoi. Le produit n'avait aucun moyen de la dire sans ouvrir la
-- liste — et ouvrir la liste écrit au journal (168-169), ce qu'une simple alerte ne doit pas
-- faire à chaque affichage de l'accueil.
--
-- CE QUE LA FONCTION REND, ET RIEN DE PLUS : un NOMBRE, la RÉFÉRENCE COURTE de la plus ancienne
-- (`#` + 6 derniers caractères de l'identifiant de commande, la règle de `referenceCourte`,
-- `lib/commandes/reference.ts`) et
-- l'instant où elle a été envoyée. Ni le message du vendeur, ni son image, ni sa boutique : ce
-- sont des contenus, et leur lecture reste écrite au journal par `lire_contestation_admin`.
-- D'où l'absence de trace ici, comme `compter_doublons_admin` (170).
--
-- LECTURE SEULE (`stable`), `security definer` parce que `link_contests` n'est lisible par
-- `authenticated` que pour SA boutique (168) ; la garde est donc DANS la fonction, la même que
-- partout ailleurs : `est_admin()`, qui exige la double authentification depuis la 186.

create function public.compter_contestations_en_attente_admin()
  returns table (en_attente bigint, plus_ancienne_ref text, plus_ancienne_le timestamptz)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  select (select count(*) from public.link_contests c where c.status = 'en_attente')::bigint,
         (select '#' || upper(right(replace(c.order_id::text, '-', ''), 6))
            from public.link_contests c
           where c.status = 'en_attente'
           order by c.created_at asc, c.id asc
           limit 1),
         (select c.created_at
            from public.link_contests c
           where c.status = 'en_attente'
           order by c.created_at asc, c.id asc
           limit 1);
end;
$$;

-- Postgres l'ouvre à PUBLIC à sa naissance (mesuré, CLAUDE.md § sécurité) : on referme.
revoke all on function public.compter_contestations_en_attente_admin() from public;
revoke all on function public.compter_contestations_en_attente_admin() from anon;
grant execute on function public.compter_contestations_en_attente_admin() to authenticated;

comment on function public.compter_contestations_en_attente_admin() is
  'Nombre de contestations en attente, référence courte et date d''envoi de la plus ancienne (213). Un nombre et une référence seulement, aucun contenu : aucune trace au journal. Garde interne : est_admin().';
