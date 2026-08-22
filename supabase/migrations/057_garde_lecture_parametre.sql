-- 057 — `lire_parametre_entier` vérifie enfin qui l'appelle.
--
-- DÉFAUT ÉTABLI PAR EXÉCUTION, pas par relecture. En prenant le rôle
-- `authenticated` sans être administrateur :
--
--   select public.lire_parametre_entier('seuil_colis_par_compte', -1);  →  33
--
-- La valeur réellement stockée, pas le défaut. `system_settings` est pourtant
-- fermée à tous — `revoke all`, RLS forcée, aucune policy — mais le
-- `security definer` la contourne, et c'était la SEULE des trente-six fonctions
-- ouvertes à `authenticated` dont le corps ne vérifiait ni le rôle ni la
-- propriété. Ses quatorze voisines du périmètre admin portent toutes leur garde.
--
-- LE SECOND EFFET, PLUS DISCRET : le `(value #>> '{}')::int` LÈVE sur une clé
-- non entière et REND LE DÉFAUT sur une clé absente. La forme de la réponse est
-- donc un oracle d'existence sur n'importe quelle clé devinée.
--
-- L'IMPACT EST MINCE AUJOURD'HUI — deux seuils opérationnels — et c'est
-- précisément ce qui rend la correction urgente : la protection ne tient qu'à
-- l'ABSENCE de contenu sensible dans la table, et la décision produit n°10
-- prévoit explicitement d'y faire passer d'autres paramètres. La phrase juste
-- serait « ce serait une fuite si quelqu'un ajoutait une clé », donc c'est en
-- sursis.
--
-- `DROP` EXPLICITE OBLIGATOIRE : la fonction passe de `language sql` à
-- `language plpgsql`. Un `create or replace` refuserait le changement de
-- langage, et un changement de signature aurait créé une SECONDE surcharge que
-- les appels auraient continué de résoudre vers l'ANCIENNE, sans erreur.
--
-- Elle reste `stable` : elle n'écrit rien, et le moteur refusera toute écriture
-- qu'on y ajouterait. La lecture d'un seuil du produit n'est pas la lecture des
-- données d'un tiers — elle n'appelle donc aucune trace, et l'auditer noierait
-- les vraies consultations de comptes.

drop function if exists public.lire_parametre_entier(text, int);

create function public.lire_parametre_entier(p_cle text, p_defaut int)
  returns int
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_valeur int;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  select (s.value #>> '{}')::int into v_valeur
  from public.system_settings s
  where s.key = p_cle;

  return coalesce(v_valeur, p_defaut);
end;
$$;

comment on function public.lire_parametre_entier(text, int) is
  'Lit un seuil entier. Réservée aux administrateurs. Une ligne absente est un état NORMAL : le défaut vient de l''appel.';

revoke all on function public.lire_parametre_entier(text, int) from public;
grant execute on function public.lire_parametre_entier(text, int) to authenticated;
