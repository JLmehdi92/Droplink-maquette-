-- ═══════════════════════════════════════════════════════════════════════════
-- LES TROIS ANGLES MORTS DU CATALOGUE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Trois propriétés qui ne s'écrivent nulle part dans le code, ne se voient dans
-- aucune relecture, et qu'aucune sonde ne regardait. Relevées le 01/09/2026 en
-- interrogeant `pg_proc` et `pg_trigger`, pas en lisant les migrations.
--
-- ── 1. UNE FONCTION SANS CHEMIN DE RECHERCHE DU TOUT ────────────────────────
--
-- `refuser_truncate_audit` est la SEULE des 93 fonctions du schéma dont
-- `proconfig` est nul. Son corps ne référence aucun objet, donc il n'y a rien à
-- substituer : l'effet est nul aujourd'hui.
--
-- On la ferme quand même, et pour une raison qui n'est pas cosmétique : c'est
-- la fonction qui garde le JOURNAL D'AUDIT, la pièce qu'on produirait en cas de
-- litige. Une exception dans l'inventaire est ce qui fait qu'on cesse de lire
-- l'inventaire — et la sonde qui recense les chemins de recherche filtrait
-- `prosecdef`, donc ne l'a jamais vue.
--
-- ── 2. UNE FONCTION AVEC UN CHEMIN DE RECHERCHE OUVERT ──────────────────────
--
-- `compter_commandes_par_etat` porte `search_path = public, pg_temp` là où les
-- 91 autres portent `""`. Elle est `security invoker`, donc un appelant qui
-- substituerait un objet n'obtiendrait que ses propres droits : là encore,
-- aucun effet exploitable aujourd'hui.
--
-- ⚠️ MAIS `pg_temp` DANS UN CHEMIN DE RECHERCHE EST UNE PORTE. N'importe quel
-- rôle peut créer une table temporaire, et une table temporaire nommée `orders`
-- serait résolue AVANT `public.orders` si la référence n'était pas qualifiée.
-- Elle l'est ici — le corps écrit bien `public.orders`. La protection tient
-- donc à ce que personne ne dé-qualifie jamais une référence dans cette
-- fonction précise : c'est une protection qui tient à une absence.
--
-- ⚠️ ON NE RÉÉCRIT PAS LE CORPS. `alter function … set search_path` change le
-- réglage sans toucher au code. Recréer la fonction obligerait à recopier son
-- corps, donc à le retaper de mémoire ou à le coller — et c'est exactement le
-- geste qui a déjà produit une surcharge orpheline sur ce projet.
--
-- ── 3. LES DEUX DÉCLENCHEURS DU JOURNAL SONT « ORIGIN » ─────────────────────
--
-- `admin_audit_log_append_only` et `admin_audit_log_no_truncate` portent
-- `tgenabled = 'O'`. Un déclencheur ORIGIN ne s'exécute PAS quand la session
-- pose `session_replication_role = 'replica'`.
--
-- Mesuré, trois fois, chacune en transaction annulée :
--   set local role authenticated;  set session_replication_role = 'replica'  → 42501
--   set local role service_role;   set session_replication_role = 'replica'  → 42501
--   sans set role (donc `postgres`)                                          → AUCUNE ERREUR
--
-- Ni la clé publiable, ni la clé service-role, ni PostgREST ne peuvent donc
-- contourner l'append-only. Le porteur de la chaîne de connexion directe, si —
-- et sans passer par du DDL, donc sans que les déclencheurs d'événement de
-- PostgREST voient quoi que ce soit.
--
-- ⚠️ CE QUE `ENABLE ALWAYS` FAIT, ET CE QU'IL NE FAIT PAS. Il rend le
-- déclencheur insensible à `session_replication_role`. Il n'arrête pas un
-- adversaire déterminé : `postgres` est propriétaire de la table et peut
-- toujours `drop trigger`. Sa valeur est de forcer un DDL VISIBLE plutôt qu'un
-- `set` silencieux — on ne referme pas la porte, on la fait grincer.

alter function public.refuser_truncate_audit() set search_path = '';

alter function public.compter_commandes_par_etat() set search_path = '';

alter table public.admin_audit_log
  enable always trigger admin_audit_log_append_only;

alter table public.admin_audit_log
  enable always trigger admin_audit_log_no_truncate;
