-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ LE BUDGET DE SUIVI MENTAIT DE SEPT UNITÉS, DANS LE SENS RASSURANT        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️ DÉFAUT RÉEL DE LA MIGRATION 174, TROUVÉ LE JOUR MÊME EN MESURANT LA
-- PRODUCTION EN LECTURE SEULE — pas en relisant le code.
--
-- `etat_budget_suivi()` compte les `tracked_parcels` dont `registered_at` est
-- posée. Mesuré en production : **2**. Or le fournisseur en annonce **9**
-- consommées sur 200. L'alerte Discord aurait donc annoncé « 198 restantes »
-- quand il en reste 191.
--
-- ── POURQUOI L'ÉCART EXISTE, ET POURQUOI IL NE SE RATTRAPERA PAS ──────────
--
-- Sept prises en charge ont été payées avant le 06/09/2026, quand les suites de
-- tests tournaient encore sur la PRODUCTION. Leurs lignes ont été effacées — un
-- test portait un `delete from public.tracked_parcels` — mais l'argent, lui,
-- est parti : le fournisseur décompte à la PRISE EN CHARGE, pas au stockage de
-- la ligne chez nous.
--
-- ⚠️ CE QUE ÇA ÉTABLIT, ET QUI VAUT PLUS QUE LE CORRECTIF : **notre base ne
-- peut pas connaître ce chiffre.** Elle compte ce qu'elle a gardé, pas ce qui a
-- été payé. L'AUTORITÉ est le tableau de bord du fournisseur, et elle le
-- restera. Un compteur qui se croit autoritaire sur une dépense faite ailleurs
-- est un compteur qui se trompera encore — la seule question est de combien.
--
-- D'où un DÉCALAGE EXPLICITE plutôt qu'un total bricolé : écrire 193 dans
-- `budget_suivi_total` donnerait le bon reste aujourd'hui et mentirait sur le
-- palier réel, que personne ne pourrait plus retrouver.

insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'budget_suivi_deja_consomme',
    0,
    1000000,
    'Les prises en charge payées au fournisseur mais ABSENTES de nos lignes — '
    'parce qu''elles ont été effacées, ou faites avant que le produit ne les '
    'consigne. Sept au 20/09/2026, brûlées avant le 06/09 par des suites qui '
    'visaient encore la production. Ce n''est pas un correctif ponctuel : notre '
    'base compte ce qu''elle a GARDÉ, le fournisseur facture ce qu''il a PRIS '
    'EN CHARGE, et les deux ne coïncideront jamais parfaitement. La valeur se '
    'relit sur le tableau de bord du fournisseur, qui fait autorité.'
  );

create or replace function public.etat_budget_suivi()
  returns table (utilisees bigint, total integer, restantes integer)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_comptees bigint;
  v_hors_traces integer;
  v_total integer;
  v_utilisees bigint;
begin
  select count(*) into v_comptees
  from public.tracked_parcels
  where registered_at is not null;

  select (s.value #>> '{}')::int into v_hors_traces
  from public.system_settings s
  where s.key = 'budget_suivi_deja_consomme';

  select (s.value #>> '{}')::int into v_total
  from public.system_settings s
  where s.key = 'budget_suivi_total';

  -- Les défauts vivent ici et nulle part en base : une clé absente signifie
  -- « personne n'a jamais décidé », et c'est l'état normal du produit.
  v_hors_traces := coalesce(v_hors_traces, 0);
  v_total := coalesce(v_total, 200);

  -- ⚠️ LE DÉCALAGE S'AJOUTE AUX DÉPENSES, il ne se retire pas du total. La
  -- différence n'est pas cosmétique : `total` doit continuer de dire ce que le
  -- palier donne réellement, sans quoi plus personne ne saurait de quel palier
  -- on parle le jour où il change.
  v_utilisees := v_comptees + v_hors_traces;

  return query select
    v_utilisees,
    v_total,
    -- Jamais de négatif : il se lirait comme un crédit dans un message d'alerte.
    greatest(v_total - v_utilisees, 0)::integer;
end;
$$;

comment on function public.etat_budget_suivi() is
  'Utilisées / total / restantes du budget de prises en charge. « Utilisées » additionne les tracked_parcels dont registered_at est posée ET le décalage budget_suivi_deja_consomme — les unités payées au fournisseur dont la ligne n''existe plus chez nous. ⚠️ CETTE BASE N''EST PAS L''AUTORITÉ : elle compte ce qu''elle a gardé, le fournisseur facture ce qu''il a pris en charge. Le tableau de bord du fournisseur fait foi, et le décalage sert à s''y raccorder.';
