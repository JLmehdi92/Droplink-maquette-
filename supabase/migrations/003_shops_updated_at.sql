-- 003 — Faire vivre `shops.updated_at`.
--
-- Défaut de la 001 : la colonne `updated_at` a un défaut à `now()` et rien ne la
-- réécrit ensuite. Elle affiche donc la date de CRÉATION en prétendant être une
-- date de modification, indéfiniment.
--
-- C'est la forme la plus banale du principe XII — l'interface n'affirme jamais
-- ce que la base n'a pas enregistré. Une colonne qui porte un nom sans porter la
-- garantie correspondante est un mensonge en attente : personne ne s'en aperçoit
-- tant que rien ne l'affiche, et le jour où un écran s'en sert, il est faux
-- sans être cassé.
--
-- Le déclencheur est en base et non dans le code applicatif, pour la raison
-- habituelle : une règle applicative peut être oubliée dans un nouveau chemin
-- d'écriture, une règle en base ne peut pas l'être.

create function public.toucher_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.toucher_updated_at() from public, anon, authenticated;

create trigger shops_toucher_updated_at
  before update on public.shops
  for each row execute function public.toucher_updated_at();
