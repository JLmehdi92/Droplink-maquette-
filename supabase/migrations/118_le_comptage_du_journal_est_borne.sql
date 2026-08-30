-- LE COMPTAGE DU JOURNAL COÛTAIT CENT FOIS LA PAGE QU'IL DÉCORE.
--
-- MESURÉ LE 30/08/2026, au plafond, dans une transaction annulée : 517 031
-- lignes dans `admin_audit_log`, deux séries concordantes après rodage jeté.
--
--   fenêtre « toutes », comptage exact, famille suspension   381 / 511 ms
--   fenêtre « toutes », comptage exact, famille consultation 399 / 414 ms
--   fenêtre « toutes », comptage exact, sans filtre          324 / 313 ms
--   LA PAGE ELLE-MÊME, 50 lignes triées                        0 /   0 ms
--
-- Le comptage était donc CENT POUR CENT de la latence de l'écran.
--
-- ⚠️ ET AUCUN INDEX NE LE RATTRAPE. C'est la leçon L-017, et elle a failli me
-- tromper dans l'autre sens : à 17 031 lignes ce comptage faisait un `Seq Scan`
-- à 3,7 ms, ce qui ressemblait à un index manquant. Un index d'expression sur
-- la famille a été essayé et mesuré : il fait passer la famille `suspension` de
-- 19 à 5 ms sur une fenêtre bornée, et ne change RIEN à la famille
-- `consultation`, qui est la majoritaire. Un agrégat complet doit visiter
-- chaque ligne ; il ne se rattrape par aucun index.
--
-- Sur une fenêtre de 30 jours, l'index de récence borne déjà le balayage :
-- 19 à 24 ms à 517 031 lignes, et c'est acceptable. C'est la fenêtre
-- « toutes » — celle qui n'a aucune borne de date — qui coûte.
--
-- LE REMÈDE EST DE NE PAS DEMANDER PLUS QUE NÉCESSAIRE, comme la liste des
-- commandes le fait déjà pour sa propre pagination. Le comptage s'arrête à
-- 10 001 lignes :
--
--   borné à 10 001, famille consultation    4,4 / 4,3 ms
--   borné à 10 001, famille suspension      9,5 / 9,7 ms
--   borné à 10 001, sans filtre             9,6 / 10,0 ms
--
-- Soit un facteur 30 à 100, et un plafond STABLE : le coût cesse de croître
-- avec la table, qui est append-only et ne décroît jamais.
--
-- CE QUE L'ÉCRAN DIT ALORS EST PLUS VRAI, PAS MOINS. « plus de 10 000 entrées »
-- est ce que la base a réellement établi ; « 517 031 » l'était aussi, mais au
-- prix d'une demi-seconde pour un nombre que personne ne lit chiffre à chiffre.
-- Un décompte au-delà de dix mille ne sert plus à décider, il sert à rassurer.
--
-- LA BORNE EST À 10 001 ET NON 10 000, pour que l'appelant distingue « exactement
-- dix mille » de « au moins dix mille et un ». Sans ce +1, une table portant
-- exactement 10 000 entrées s'afficherait « plus de 10 000 » — faux d'une unité,
-- et faux dans le sens qui exagère.

drop function if exists public.compter_journal_admin(text, int);

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

  -- LE `limit` VIT DANS LA SOUS-REQUÊTE, jamais autour du `count`. Un
  -- `count(*) ... limit 10001` ne borne rien : il produit UNE ligne, et la
  -- borne s'applique à ce résultat unique. C'est la sous-requête qui doit
  -- cesser de lire.
  select count(*) into v_total
  from (
    select 1
    from public.admin_audit_log a
    where (v_depuis is null or a.occurred_at >= v_depuis)
      and (
        v_famille is null
        or (v_famille = 'suspension' and a.action like 'compte.%')
        or (v_famille = 'parametre' and a.action like 'parametre.%')
        or (v_famille = 'consultation'
            and a.action not like 'compte.%'
            and a.action not like 'parametre.%')
      )
    limit 10001
  ) borne;

  return v_total;
end;
$$;

-- ⚠️ LES DROITS SE REPOSENT APRÈS UN `drop`. Postgres ne les conserve pas, et
-- une fonction recréée sans eux hérite du défaut : `EXECUTE` accordé à PUBLIC.
-- L'oubli est invisible à la relecture — il ne s'écrit pas dans le corps.
revoke all on function public.compter_journal_admin(text, int) from public;
grant execute on function public.compter_journal_admin(text, int) to authenticated;

comment on function public.compter_journal_admin(text, int) is
  'Compte les entrées du journal, BORNÉ à 10 001. Au-delà, l''appelant affiche '
  '« plus de 10 000 » : le comptage exact coûtait 313 à 511 ms au plafond, pour '
  'une page qui en coûte 0. Un agrégat complet ne se rattrape par aucun index.';
