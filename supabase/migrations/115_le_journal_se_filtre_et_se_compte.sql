-- 115 — Le journal d'audit se filtre, se borne dans le temps, et se compte.
--
-- LES DEUX PLANCHES POSENT DES FILTRES : par famille d'action — suspensions,
-- consultations, paramètres — et par fenêtre — 7 ou 30 derniers jours. Et un
-- décompte : « 1 284 entrées ».
--
-- POURQUOI CE N'EST PAS DU CONFORT. Ce journal enregistre CHAQUE consultation,
-- y compris les lectures. Il grossit donc à la vitesse de notre propre activité,
-- et les consultations y sont mille fois plus nombreuses que les décisions. Sans
-- filtre, la seule chose qu'on ne retrouve jamais est précisément celle qu'on
-- vient y chercher : la suspension qu'on relit parce qu'elle est contestée.
--
-- LES FAMILLES SONT DÉDUITES DU PRÉFIXE DE L'ACTION, pas d'une colonne. Ajouter
-- une colonne obligerait à la renseigner à chaque écriture, donc à ne pas
-- l'oublier — et c'est exactement le genre de règle qu'un nouveau chemin de code
-- oublie. Le préfixe, lui, existe déjà : `compte.suspension`, `comptes.liste`,
-- `parametre.modification`.
--
-- ⚠️ ELLE RESTE `stable`, ET C'EST UNE PROPRIÉTÉ, PAS UN DÉTAIL. PostgREST
-- exécute une fonction `stable` en transaction LECTURE SEULE : le moteur
-- refuserait toute écriture qu'on y ajouterait. « Lire le journal n'écrit pas
-- dans le journal » cesse d'être une intention pour devenir une règle que la
-- base fait respecter.
--
-- LA CHARGE UTILE RESTE FERMÉE, sauf deux valeurs. Le MOTIF, parce que c'est la
-- pièce qu'on demanderait en cas de litige. Et l'AVANT/APRÈS d'un paramètre
-- système, parce qu'un seuil n'appartient à aucun vendeur : ce sont nos propres
-- réglages. Les critères d'une consultation restent fermés, eux, alors que la
-- planche les affiche — ils contiennent la RECHERCHE saisie, donc souvent
-- l'adresse d'un vendeur, et le brief l'a tranché : « étaler tout le reste
-- ferait de ce journal une surface de fuite de plus ».
--
-- `drop` OBLIGATOIRE : la liste d'arguments ET le type de retour changent. Sans
-- lui, Postgres créerait une SECONDE surcharge à trois arguments, les deux
-- coexisteraient, et un appel à trois arguments résoudrait l'ANCIENNE — sans la
-- moindre erreur.

drop function if exists public.lire_journal_admin(text, text, int);

create function public.lire_journal_admin(
  p_famille text,
  p_depuis_jours int,
  p_curseur_date text,
  p_curseur_id text,
  p_limite int
)
  returns table (
    id uuid,
    admin_email text,
    action text,
    resource_type text,
    resource_id text,
    target_email text,
    occurred_at timestamptz,
    motif text,
    avant text,
    apres text
  )
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_limite int := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_famille text := nullif(btrim(coalesce(p_famille, '')), '');
  v_depuis timestamptz := case
    when coalesce(p_depuis_jours, 0) > 0 then now() - make_interval(days => p_depuis_jours)
    else null
  end;
  v_date timestamptz := nullif(btrim(coalesce(p_curseur_date, '')), '')::timestamptz;
  v_id uuid := nullif(btrim(coalesce(p_curseur_id, '')), '')::uuid;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  -- UNE FAMILLE INCONNUE EST REFUSÉE, jamais ignorée : ignorée, elle rendrait
  -- le journal ENTIER, soit l'inverse de ce qu'on demande à un filtre — et sur
  -- CE journal, « tout » veut dire les milliers de lignes qui masquent la seule
  -- qu'on cherchait.
  if v_famille is not null and v_famille not in ('suspension', 'consultation', 'parametre') then
    raise exception 'famille d''action inconnue : %', v_famille using errcode = 'DL050';
  end if;

  -- AUCUNE ÉCRITURE ICI. Lire le journal ne se journalise pas : sans cette
  -- règle, ouvrir la page d'audit y ajouterait une ligne, laquelle apparaîtrait
  -- à la consultation suivante, et le journal se remplirait de sa propre
  -- consultation en noyant ce qu'il est censé conserver.
  return query
  select
    a.id, a.admin_email, a.action, a.resource_type, a.resource_id,
    a.target_email, a.occurred_at,
    a.payload ->> 'motif',
    -- L'AVANT ET L'APRÈS D'UN PARAMÈTRE, et rien d'autre de la charge utile.
    -- Sans l'avant, la ligne dit « le seuil vaut maintenant 1 200 » — ce que la
    -- table dit déjà. Ce qu'on cherche six mois plus tard, c'est ce qu'il valait
    -- AVANT qu'on le change.
    case when a.action like 'parametre.%' then a.payload ->> 'avant' end,
    case when a.action like 'parametre.%' then a.payload ->> 'apres' end
  from public.admin_audit_log a
  where (v_date is null or (a.occurred_at, a.id) < (v_date, v_id))
    and (v_depuis is null or a.occurred_at >= v_depuis)
    and (
      v_famille is null
      or (v_famille = 'suspension' and a.action like 'compte.%')
      or (v_famille = 'parametre' and a.action like 'parametre.%')
      -- LA CONSULTATION EST DÉFINIE PAR EXCLUSION, et c'est délibéré : toute
      -- action future qui n'est ni une décision sur un compte ni un réglage est
      -- une LECTURE. Une liste positive aurait laissé la prochaine action hors
      -- de tous les filtres, donc introuvable par tous.
      or (v_famille = 'consultation'
          and a.action not like 'compte.%'
          and a.action not like 'parametre.%')
    )
  order by a.occurred_at desc, a.id desc
  limit v_limite;
end;
$$;

comment on function public.lire_journal_admin(text, int, text, text, int) is
  'Lecture du journal d''audit, filtrable par famille et par fenêtre.
   DÉLIBÉRÉMENT `stable` : PostgREST l''exécute donc en transaction lecture seule,
   et toute écriture qu''on y ajouterait serait refusée par le moteur. « Lire le
   journal n''écrit pas dans le journal » n''est plus une intention mais une
   propriété que la base fait respecter.';

revoke all on function public.lire_journal_admin(text, int, text, text, int) from public;
grant execute on function public.lire_journal_admin(text, int, text, text, int) to authenticated;

/*
 * LE DÉCOMPTE, POUR L'EN-TÊTE.
 *
 * Il porte les MÊMES filtres que la lecture : un total qui ignorerait le filtre
 * afficherait « 1 284 entrées » au-dessus d'une liste qui en montre trois, et
 * l'on chercherait longtemps les 1 281 autres.
 *
 * `stable` comme sa jumelle, et pour la même raison : compter le journal ne
 * l'écrit pas non plus.
 */
create function public.compter_journal_admin(p_famille text, p_depuis_jours int)
  returns bigint
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_famille text := nullif(btrim(coalesce(p_famille, '')), '');
  v_depuis timestamptz := case
    when coalesce(p_depuis_jours, 0) > 0 then now() - make_interval(days => p_depuis_jours)
    else null
  end;
  v_total bigint;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  if v_famille is not null and v_famille not in ('suspension', 'consultation', 'parametre') then
    raise exception 'famille d''action inconnue : %', v_famille using errcode = 'DL050';
  end if;

  select count(*) into v_total
  from public.admin_audit_log a
  where (v_depuis is null or a.occurred_at >= v_depuis)
    and (
      v_famille is null
      or (v_famille = 'suspension' and a.action like 'compte.%')
      or (v_famille = 'parametre' and a.action like 'parametre.%')
      or (v_famille = 'consultation'
          and a.action not like 'compte.%'
          and a.action not like 'parametre.%')
    );

  return v_total;
end;
$$;

revoke all on function public.compter_journal_admin(text, int) from public;
grant execute on function public.compter_journal_admin(text, int) to authenticated;

comment on function public.compter_journal_admin(text, int) is
  'Nombre d''entrées du journal, avec les MÊMES filtres que la lecture. '
  'Garde interne : est_admin(). N''écrit rien.';
