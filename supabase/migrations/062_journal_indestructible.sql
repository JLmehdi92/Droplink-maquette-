-- 062 — Le journal d'audit résiste aussi au `TRUNCATE`.
--
-- DÉFAUT ÉTABLI PAR EXÉCUTION : `truncate admin_audit_log` a effacé 1 330
-- lignes sans un mot, sous `postgres` comme sous `service_role` — qui détient
-- explicitement ce privilège. Le déclencheur append-only est `FOR EACH ROW` sur
-- `UPDATE OR DELETE` ; `TRUNCATE` ne déclenche aucun déclencheur de ligne, et
-- le catalogue confirmait qu'aucun déclencheur d'instruction n'existait.
--
-- CE JOURNAL EST LA PIÈCE QUI FONDE NOTRE STATUT D'HÉBERGEUR. C'est ce qu'on
-- produirait en cas de litige pour établir qui a consulté ou suspendu quoi. Sa
-- protection ne peut pas s'arrêter à la porte de service.
--
-- DEUX GESTES, PAS UN. Le déclencheur refuse l'ordre ; le `revoke` retire le
-- droit de l'émettre. L'un sans l'autre laisserait la phrase « ce serait
-- effaçable si quelqu'un contournait X » — et une protection qui tient à une
-- absence n'en est pas une.

create function public.refuser_truncate_audit()
  returns trigger
  language plpgsql
  as $$
begin
  raise exception 'le journal d''audit ne peut pas etre vide'
    using errcode = 'DL030';
end;
$$;

revoke all on function public.refuser_truncate_audit() from public;

create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.refuser_truncate_audit();

revoke truncate on public.admin_audit_log from service_role;
