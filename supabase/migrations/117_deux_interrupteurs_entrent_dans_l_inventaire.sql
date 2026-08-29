-- 117 — DEUX INTERRUPTEURS ENTRENT DANS L'INVENTAIRE FERMÉ.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ILS COUPENT, ET POURQUOI CE SONT CES DEUX-LÀ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `suivi_actif` coupe l'interrogation des transporteurs. C'est le SEUL POSTE DE
-- COÛT VARIABLE du produit : le fournisseur de suivi facture À LA PRISE EN
-- CHARGE, donc chaque colis nouvellement enregistré est une ligne de facture.
-- Sans interrupteur, arrêter la dépense demandait un déploiement — c'est-à-dire
-- de mesurer en heures ce qui doit se mesurer en secondes, le jour précis où
-- l'on découvre qu'un script a enregistré dix mille colis.
--
-- `inscriptions_ouvertes` ferme la porte d'entrée. Elle sert à une seule chose :
-- arrêter un afflux dont on n'a pas encore compris la nature, sans toucher aux
-- comptes qui travaillent.
--
-- ⚠️ CE SECOND INTERRUPTEUR NE PEUT PAS ÊTRE POSÉ SUR `shouldCreateUser`, et
-- c'est la contrainte qui décide de son emplacement. Refuser la création à
-- l'envoi du lien magique produit deux oracles mesurés sur ce projet : un code
-- 422 distinct, et surtout un écart de délai de seize fois (49 ms contre
-- 778 ms) qui reste lisible même en uniformisant les codes. N'importe qui
-- pourrait alors balayer des adresses et apprendre lesquelles ont un compte
-- ici — la liste que le marché de ce vertical achète. La porte se ferme donc
-- APRÈS le clic, dans le retour d'authentification : à ce moment la personne a
-- prouvé qu'elle possède la boîte, et aucun balayage anonyme ne l'atteint.
--
-- ⚠️ ÉCART ASSUMÉ, ÉCRIT ICI PARCE QU'IL SE DÉCOUVRIRAIT AUTREMENT EN
-- PRODUCTION : « fermer n'affecte pas les comptes existants » vaut pour les
-- comptes qui ont TERMINÉ leur onboarding. Un compte créé mais dont
-- `account_type` est resté nul est repoussé lui aussi — c'est délibéré : une
-- demande de lien crée `auth.users`, `profiles` et `shops` AVANT tout clic,
-- donc un afflux a déjà semé ses lignes quand on décide de fermer, et les
-- laisser franchir la porte reviendrait à ne rien fermer du tout.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI DES ENTIERS 0/1 ET NON UN BOOLÉEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `system_settings` porte du JSON, et tout le produit le lit par
-- `(value #>> '{}')::int`. Introduire un second encodage obligerait chaque
-- lecteur à savoir lequel s'applique — et un lecteur qui se trompe ne lève pas,
-- il rend une valeur. Les bornes `0..1` font le travail d'un type : hors de
-- l'intervalle, `ecrire_parametre` refuse.

insert into public.parametres_admis (cle, minimum, maximum, raison) values
  (
    'suivi_actif',
    0,
    1,
    'Interrupteur : 0 coupe l''interrogation des transporteurs, 1 la laisse '
    'courir. Bornes 0..1 parce que system_settings porte des entiers et que '
    'les bornes y font le travail d''un type booléen.'
  ),
  (
    'inscriptions_ouvertes',
    0,
    1,
    'Interrupteur : 0 ferme la création de comptes, 1 la laisse ouverte. La '
    'fermeture agit APRÈS le clic sur le lien magique, jamais à son envoi — '
    'refuser à l''envoi produirait un oracle d''existence de compte, mesuré à '
    'seize fois d''écart de délai sur ce projet.'
  );

/*
 * ── Les deux lectures, chacune sans argument ────────────────────────────────
 *
 * `lire_parametre_entier` prend une CLÉ et reste réservée aux administrateurs
 * depuis la 057 : ouverte, elle laisserait lire n'importe quel réglage, et la
 * forme de sa réponse ferait d'elle un oracle d'existence sur n'importe quelle
 * clé devinée. Chaque interrupteur a donc sa fonction propre, sans argument,
 * qui ne rend qu'une valeur — la même que l'écran d'administration affiche.
 *
 * Le défaut est écrit DANS LA FONCTION et nulle part en base. Une clé absente
 * signifie « personne n'a jamais décidé », qui est l'état normal du produit :
 * insérer le défaut au démarrage ferait croire qu'il a été choisi alors qu'il
 * n'a été que subi, et l'écran ne pourrait plus distinguer les deux.
 *
 * LES DEUX DÉFAUTS SONT « OUVERT ». Un produit dont la base est vide doit
 * fonctionner : partir fermé transformerait une base neuve, ou une lecture qui
 * échoue, en panne totale et silencieuse du produit.
 */

create function public.lire_suivi_actif()
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_valeur int;
begin
  select (s.value #>> '{}')::int into v_valeur
  from public.system_settings s
  where s.key = 'suivi_actif';

  return coalesce(v_valeur, 1) <> 0;
end;
$$;

comment on function public.lire_suivi_actif() is
  'L''interrupteur d''interrogation des transporteurs, lisible par la cadence '
  'qui tourne sans humain. Sans argument, à dessein : lire_parametre_entier '
  'prend une clé et servirait d''oracle d''existence sur n''importe quelle clé '
  'devinée. Défaut ouvert : une base neuve doit fonctionner.';

-- ⚠️ Postgres accorde `EXECUTE` à `PUBLIC` par défaut. On ferme, puis on ouvre
-- au seul rôle qui en a besoin. La cadence tourne avec le client SYSTÈME : ni
-- `anon` ni `authenticated` n'ont rien à faire de cette valeur.
revoke execute on function public.lire_suivi_actif() from public, anon, authenticated;
grant execute on function public.lire_suivi_actif() to service_role;

create function public.lire_inscriptions_ouvertes()
  returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  v_valeur int;
begin
  select (s.value #>> '{}')::int into v_valeur
  from public.system_settings s
  where s.key = 'inscriptions_ouvertes';

  return coalesce(v_valeur, 1) <> 0;
end;
$$;

comment on function public.lire_inscriptions_ouvertes() is
  'L''interrupteur de création de comptes, lu par le retour d''authentification '
  'APRÈS le clic — jamais à l''envoi du lien, où refuser produirait un oracle '
  'sur l''existence d''un compte. Défaut ouvert.';

-- Le retour d'authentification s'exécute avec la session fraîchement échangée,
-- donc en `authenticated`. `anon` n'atteint jamais ce chemin : lui accorder le
-- droit exposerait la valeur sur la surface non authentifiée sans rien
-- débloquer.
revoke execute on function public.lire_inscriptions_ouvertes() from public, anon;
grant execute on function public.lire_inscriptions_ouvertes() to authenticated;
