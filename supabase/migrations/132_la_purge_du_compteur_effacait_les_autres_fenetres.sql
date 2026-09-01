-- LA PURGE DU COMPTEUR DE DÉBIT EFFAÇAIT LES COMPTEURS DES AUTRES SURFACES.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LE DÉFAUT, MESURÉ LE 02/09/2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `consommer_quota` purge les lignes périmées, et c'est nécessaire : sans elle
-- le coût de chaque appel croîtrait avec le trafic passé, sur le chemin de
-- chaque requête protégée. Mais la condition de purge employait la fenêtre de
-- L'APPELANT pour juger des lignes de TOUT LE MONDE :
--
--     where fenetre_debut < v_debut - make_interval(secs => p_fenetre_secondes * 2)
--
-- Or les surfaces n'ont pas la même fenêtre. La page publique compte par
-- MINUTE (60 s) ; l'authentification compte par HEURE (3 600 s). Un seul appel
-- venu de la page publique fixait donc le seuil à « il y a deux minutes » et
-- supprimait toutes les lignes d'authentification, dont la fenêtre courante a
-- couramment cinquante minutes d'âge.
--
-- RELEVÉ : 13 lignes `auth-email` et 3 lignes `auth-ip` en base, puis UNE
-- requête `GET /p/<jeton inexistant>` depuis une adresse neuve — toutes les
-- lignes d'authentification supprimées, seules survivent celles de la minute
-- courante.
--
-- ⚠️ CE QUE ÇA COÛTAIT : la page publique est le cœur du produit, ouverte en
-- permanence par de vrais clients. Chaque ouverture remettait donc à zéro les
-- plafonds d'authentification. Les 30 tentatives par heure et par adresse IP,
-- les 6 envois d'email par adresse, **n'existaient pas en pratique** — et rien
-- ne le disait : les compteurs fonctionnaient parfaitement quand on les
-- éprouvait seuls, en base calme. C'est le trafic légitime qui les effaçait.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- LA CORRECTION : ON NE PURGE QUE SA PROPRE SURFACE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La clé est composée `surface:empreinte`, et une surface a exactement une
-- fenêtre. Borner la purge au préfixe de la clé de l'appelant rend donc la
-- comparaison de fenêtre correcte par construction : on ne compare plus que des
-- lignes qui partagent la durée de fenêtre qu'on emploie pour les juger.
--
-- ⚠️ AUCUNE COLONNE AJOUTÉE, DÉLIBÉRÉMENT. Stocker la fenêtre sur chaque ligne
-- aurait marché aussi, mais aurait laissé la possibilité d'écrire une ligne
-- avec une fenêtre qui contredit celle de sa surface — un second endroit où la
-- vérité peut diverger. Le préfixe, lui, est déjà là et ne peut pas mentir.
--
-- La borne de 200 lignes par appel est conservée : c'est elle qui empêche un
-- appel de payer la dette de tout le trafic passé.

create or replace function public.consommer_quota(
  p_cle text,
  p_plafond integer,
  p_fenetre_secondes integer
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_debut timestamptz;
  v_compte integer;
  v_surface text;
begin
  if p_plafond <= 0 or p_fenetre_secondes <= 0 then
    raise exception 'plafond et fenêtre doivent être strictement positifs'
      using errcode = '22023';
  end if;

  v_debut := public.fenetre_courante(p_fenetre_secondes);

  insert into public.rate_limit as r (cle, fenetre_debut, compte)
  values (p_cle, v_debut, 1)
  on conflict (cle, fenetre_debut)
    do update set compte = r.compte + 1
  returning r.compte into v_compte;

  -- Purge opportuniste, BORNÉE EN NOMBRE **ET EN SURFACE**.
  --
  -- Le second bornage est la correction du 02/09/2026 : sans lui, un appel de
  -- la page publique (fenêtre 60 s) supprimait les lignes d'authentification
  -- (fenêtre 3 600 s), qu'il jugeait périmées avec SA propre fenêtre.
  if v_compte = 1 then
    v_surface := split_part(p_cle, ':', 1);

    delete from public.rate_limit
    where ctid in (
      select ctid from public.rate_limit
      where cle like v_surface || ':%'
        and fenetre_debut < v_debut - make_interval(secs => p_fenetre_secondes * 2)
      limit 200
    );
  end if;

  return v_compte <= p_plafond;
end;
$function$;

-- Les droits ne changent pas — la signature est identique — mais on les
-- réaffirme : `create or replace` conserve les privilèges existants, et compter
-- sur ce comportement sans le dire est le genre de dépendance implicite qui
-- surprend le jour où elle change. Seul le rôle SYSTÈME appelle ce compteur :
-- ni `anon` ni `authenticated`, sans quoi n'importe qui pourrait épuiser le
-- quota d'un tiers dont il connaît la clé.
revoke all on function public.consommer_quota(text, integer, integer) from public;
revoke all on function public.consommer_quota(text, integer, integer) from anon;
revoke all on function public.consommer_quota(text, integer, integer) from authenticated;
grant execute on function public.consommer_quota(text, integer, integer) to service_role;
