-- ═══════════════════════════════════════════════════════════════════════════
-- LES BORNES DES PARAMÈTRES SYSTÈME DESCENDENT EN BASE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DÉFAUT TROUVÉ À L'AUDIT DU 26/08/2026.
--
-- `ecrire_parametre(p_cle, p_valeur)` ne vérifiait que deux choses : que
-- l'appelant est administrateur, et que la clé n'est pas vide. L'inventaire
-- fermé — deux clés, avec leurs bornes — n'existait QUE dans TypeScript
-- (`lib/audit/parametres.ts`). Un administrateur appelant la RPC directement,
-- hors du formulaire, écrivait donc n'importe quelle clé avec n'importe quelle
-- valeur.
--
-- CE QUE ÇA N'OUVRAIT PAS : aucune escalade. Il faut déjà être administrateur
-- actif, et rien ne lit une clé hors inventaire aujourd'hui.
--
-- POURQUOI ON LE CORRIGE QUAND MÊME : la phrase juste était « ce serait un
-- problème si un futur écran lisait une clé qu'un admin peut écrire hors
-- bornes ». Une protection qui tient à ce que personne n'ajoute quelque chose
-- n'est pas une protection, c'est un sursis (L-029). Et la décision produit
-- n° 10 prévoit explicitement d'ajouter des clés à `system_settings` : le futur
-- en question est au programme.
--
-- CE QUE CETTE MIGRATION ÉTABLIT, ET CE QU'ELLE N'ÉTABLIT PAS.
--
-- Elle rend l'inventaire et les bornes VÉRIFIÉS PAR LA BASE. Elle ne remplace
-- pas la validation Zod côté application : celle-ci reste ce qui donne au
-- vendeur un message utile plutôt qu'une erreur SQL. Les deux disent la même
-- chose, et c'est délibéré — « une règle applicative peut être oubliée dans un
-- nouveau chemin de code, une règle en base ne peut pas l'être ».
--
-- ⚠️ LES DEUX LISTES DOIVENT RESTER D'ACCORD, et rien dans ce fichier ne peut
-- l'imposer. C'est `tests/rls/parametres-et-facturation.test.ts` qui compare
-- l'inventaire TypeScript à celui-ci, DANS LES DEUX SENS : une clé décrite ici
-- et absente du code, et une clé du code absente d'ici.
--
-- LES QUATRE CODES DE REFUS SONT NEUFS (DL044 à DL047). Le premier jet
-- réemployait DL032-DL035, qui désignent déjà le motif de suspension
-- obligatoire, l'auto-suspension refusée, la suspension d'un administrateur et
-- le plafond mensuel de commandes. La sonde `codes-erreur` l'a refusé : un
-- SQLSTATE fait partie du CONTRAT, et un appelant qui distingue dessus se
-- tromperait sans jamais le savoir.
--
-- POURQUOI UNE TABLE ET NON UN `case` DANS LA FONCTION : une table se lit, se
-- compare et s'inventorie depuis une requête. Un `case` enfoui dans un corps de
-- fonction ne se compare à rien — c'est précisément ce qui a permis à
-- l'inventaire de vivre dans un seul des deux mondes.

create table public.parametres_admis (
  cle text primary key,
  minimum bigint not null,
  maximum bigint not null,
  raison text not null,
  constraint parametres_admis_bornes_coherentes check (minimum <= maximum)
);

-- RLS DÈS LA CRÉATION, comme toute table de ce dépôt. Aucune policy : cette
-- table n'est lue que par `ecrire_parametre`, qui est `security definer`. Une
-- table sans RLS serait grande ouverte à `anon`, et le fichier de migration ne
-- le dirait pas.
alter table public.parametres_admis enable row level security;
alter table public.parametres_admis force row level security;
revoke all on public.parametres_admis from anon, authenticated;

insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'seuil_colis_par_compte',
    1,
    1000000,
    'Minimum 1 et non 0 : à zéro, tout compte ayant pris un colis en charge '
    'serait signalé, donc le panneau signalerait l''usage normal du produit.'
  ),
  (
    'retard_veilleur_minutes',
    5,
    10080,
    'Sous la période du planificateur lui-même, le veilleur serait déclaré en '
    'retard entre deux battements normaux : l''alerte décrirait la cadence, '
    'pas une panne. Le maximum est une semaine.'
  );

comment on table public.parametres_admis is
  'Inventaire fermé des paramètres système et de leurs bornes. Vérifié par '
  'ecrire_parametre, et comparé à l''inventaire TypeScript par une suite de '
  'tests, dans les deux sens.';

-- ─────────────────────────────────────────────────────────────────────────────
-- La fonction consulte désormais l'inventaire.
--
-- `create or replace` suffit ici : la liste d'arguments ne change PAS. Un
-- changement de signature en créerait une SECONDE, les deux coexisteraient, et
-- un appel résoudrait l'ancienne sans erreur — c'est pourquoi le `drop` est
-- obligatoire dans ce cas, et inutile dans celui-ci.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.ecrire_parametre(p_cle text, p_valeur jsonb)
  returns boolean
  language plpgsql
  volatile
  security definer
  set search_path = ''
as $$
declare
  v_cle text;
  v_borne public.parametres_admis%rowtype;
  v_valeur numeric;
begin
  if not public.est_admin() then
    raise exception 'introuvable' using errcode = 'DL031';
  end if;

  v_cle := nullif(btrim(coalesce(p_cle, '')), '');
  if v_cle is null then
    raise exception 'cle de parametre obligatoire' using errcode = 'DL044';
  end if;

  -- LA CLÉ DOIT ÊTRE À L'INVENTAIRE. Le code d'erreur est DISTINCT de celui de
  -- la clé vide : « cette clé n'existe pas » et « vous n'avez rien saisi » sont
  -- deux corrections différentes pour celui qui lit le message.
  select * into v_borne from public.parametres_admis where cle = v_cle;
  if not found then
    raise exception 'parametre inconnu' using errcode = 'DL045';
  end if;

  -- LA VALEUR DOIT ÊTRE UN ENTIER. `jsonb_typeof` plutôt qu'un transtypage
  -- direct : `p_valeur::numeric` sur une chaîne JSON lèverait une erreur de
  -- transtypage brute, illisible, et portant un SQLSTATE qui n'est pas le nôtre.
  -- UN SEUL MESSAGE POUR UN SEUL CODE. Le premier jet distinguait « non
  -- numérique » et « non entière » sous le même code : la sonde `codes-erreur`
  -- l'a refusé, et elle a raison. Un appelant qui distingue sur un code doit
  -- obtenir la même information dans tous les cas où ce code sort ; deux
  -- formulations sous un code unique donnent l'illusion d'une distinction qui
  -- ne lui est pas offerte.
  if jsonb_typeof(p_valeur) is distinct from 'number'
     or p_valeur::text::numeric <> trunc(p_valeur::text::numeric) then
    raise exception 'valeur entiere attendue' using errcode = 'DL046';
  end if;

  v_valeur := p_valeur::text::numeric;

  if v_valeur < v_borne.minimum or v_valeur > v_borne.maximum then
    raise exception 'valeur hors bornes' using errcode = 'DL047';
  end if;

  insert into public.system_settings (key, value, updated_by)
  values (
    v_cle,
    p_valeur,
    (select p.id from public.profiles p where p.user_id = (select auth.uid()))
  )
  on conflict (key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();

  return true;
end;
$$;

comment on function public.ecrire_parametre(text, jsonb) is
  'Écrit un paramètre système. La clé doit être à l''inventaire et la valeur '
  'dans ses bornes — vérifié EN BASE, pas seulement par le formulaire. La '
  'trace est posée par déclencheur, pas par cette fonction.';

-- Les droits ne survivent pas à un `create or replace` avec changement de
-- propriétaire, et ils ne coûtent rien à reposer. Postgres accorde EXECUTE à
-- PUBLIC par défaut : ce `revoke` n'est pas une précaution, c'est la seule
-- chose qui ferme la fonction.
revoke all on function public.ecrire_parametre(text, jsonb) from public;
grant execute on function public.ecrire_parametre(text, jsonb) to authenticated;
