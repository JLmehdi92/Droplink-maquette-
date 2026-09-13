/*
 * LE JOURNAL NE SAVAIT PAS SE RÉPARTIR.
 *
 * POURQUOI. Comparé au pixel à `AdminLogs` du kit admin le 13/09/2026, l'écran
 * rendait 534 éléments contre 612. Le kit pose au-dessus de sa liste cinq
 * tuiles de volume et, à sa droite, un anneau de répartition : combien
 * d'entrées, et de quelle sorte. `compter_journal_admin` sait compter UNE
 * famille à la fois ; obtenir les quatre chiffres demandait quatre allers-retours
 * sur l'écran le plus lourd du produit, pour une réponse que Postgres sait
 * rendre en une passe.
 *
 * ⚠️ ELLE NE LIT QUE `admin_audit_log`, DONC NOS PROPRES GESTES. Le journal ne
 * contient aucune donnée de vendeur : il contient ce que les administrateurs ont
 * FAIT. La lire ne consulte donc rien de tiers, et n'écrit aucune entrée — ce
 * qui est indispensable ici plus qu'ailleurs : un compteur qui s'incrémenterait
 * en se lisant rendrait le journal illisible dès la deuxième ouverture.
 *
 * ⚠️ LE PLAFOND EST CELUI DE `compter_journal_admin`, ET IL EST DÉLIBÉRÉ. Compter
 * exactement 10 000 entrées coûte le parcours de 10 000 lignes à chaque
 * ouverture ; l'écran dit « 50 ou plus de 10 000 » plutôt que de payer un
 * comptage complet pour une précision dont personne ne décide. Les quatre
 * nombres sont donc bornés de la même façon, et par la même valeur — deux
 * plafonds différents sur la même carte feraient un total qui ne serait pas la
 * somme de ses parts.
 *
 * ⚠️ LES FAMILLES SONT CELLES DE LA MIGRATION 115, pas des nouvelles. `compte.%`
 * se range tout entier dans « suspension », réactivations comprises : distinguer
 * ici ferait qu'un filtre afficherait moins de lignes que le chiffre annoncé
 * juste au-dessus, sans qu'aucune requête n'échoue.
 */

create function public.repartir_journal_admin(
  p_depuis_jours int,
  p_plafond int
)
  returns table (
    total bigint,
    suspensions bigint,
    parametres bigint,
    consultations bigint
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_plafond int := least(greatest(coalesce(p_plafond, 10000), 1), 100000);
  v_depuis timestamptz := case
    when coalesce(p_depuis_jours, 0) > 0 then now() - make_interval(days => p_depuis_jours)
    else null
  end;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  return query
  with borne as (
    select j.action
      from public.admin_audit_log j
     where v_depuis is null or j.occurred_at >= v_depuis
     limit v_plafond
  )
  select
    count(*),
    count(*) filter (where action like 'compte.%'),
    count(*) filter (where action like 'parametre.%'),
    -- LE RESTE, ET NON UNE TROISIÈME LISTE DE PRÉFIXES. Une action inconnue doit
    -- tomber quelque part, et « consultation » est le seul rangement qui
    -- n'affirme rien de faux à son sujet — c'est déjà la règle du code.
    count(*) filter (where action not like 'compte.%' and action not like 'parametre.%')
  from borne;
end;
$$;

revoke all on function public.repartir_journal_admin(int, int) from public;
grant execute on function public.repartir_journal_admin(int, int) to authenticated;

comment on function public.repartir_journal_admin(int, int) is
  'Répartition du journal d''audit par famille, bornée au même plafond que compter_journal_admin. Garde interne : est_admin(). Ne lit que nos propres gestes — aucune donnée tierce, donc aucun audit.';
