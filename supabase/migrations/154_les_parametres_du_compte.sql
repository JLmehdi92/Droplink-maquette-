/*
 * LES PARAMÈTRES DU COMPTE — ce que l'écran « Paramètres » écrit en base.
 *
 * POURQUOI. Le kit vendeur dessine un écran de paramètres (`SettingsView`) que
 * le dépôt n'avait pas. Wassim a tranché le 13/09/2026 : l'écran porte les
 * fonctions, et il les porte SÉCURISÉES. Cette migration pose ce que la base
 * doit porter pour la première phase : un nom affiché, et une adresse de profil
 * qui suit enfin celle du compte.
 *
 * ⚠️ PAS DE TÉLÉPHONE, ET C'EST UNE DÉCISION. Le kit propose un « Téléphone
 * (optionnel) » : rien dans le produit ne s'en sert — aucun envoi, aucun
 * contact, aucune vérification. Collecter une donnée personnelle qu'aucune
 * fonction n'emploie est exactement ce que la minimisation interdit, et un
 * champ facultatif qu'on remplit « parce qu'il est là » est une fuite en
 * attente.
 */

/*
 * LE NOM AFFICHÉ. NULL = non renseigné, et le tableau de bord salue alors la
 * boutique, ou personne. Borné à 80 caractères EN BASE : une règle applicative
 * s'oublie dans un nouveau chemin d'écriture, une contrainte de colonne non.
 */
alter table public.profiles
  add column nom_affiche text;

alter table public.profiles
  add constraint profiles_nom_affiche_borne check (
    nom_affiche is null or length(btrim(nom_affiche)) between 1 and 80
  );

comment on column public.profiles.nom_affiche is
  'Le nom du vendeur tel qu''il le choisit, affiché dans son espace. NULL = non renseigné. Jamais montré à ses clients.';

/*
 * LE DROIT D'ÉCRITURE EST UN PRIVILÈGE DE COLONNE, jamais une policy — c'est ce
 * qui empêche un vendeur d'écrire `role`. `tests/rls/catalogue.test.ts` compare
 * cet inventaire au catalogue dans les deux sens.
 */
grant update (nom_affiche) on public.profiles to authenticated;

/*
 * L'ADRESSE DU PROFIL SUIT CELLE DU COMPTE.
 *
 * ⚠️ ELLE ÉTAIT COPIÉE UNE SEULE FOIS, À LA CRÉATION (`creer_profil_et_shop`),
 * et plus jamais. Tant qu'aucun écran ne changeait l'adresse, rien ne pouvait
 * diverger ; l'écran de paramètres la change. Sans ce déclencheur, un vendeur
 * qui confirme sa nouvelle adresse garderait l'ancienne partout où le produit
 * lit `profiles.email` — la garde qui refuse un mot de passe contenant
 * l'adresse, l'administration, le journal d'audit —, et rien ne le dirait.
 *
 * ⚠️ IL NE SE DÉCLENCHE QU'À LA CONFIRMATION. `auth.users.email` ne change
 * qu'une fois le lien de confirmation suivi ; tant que la demande est en
 * attente, l'adresse proposée vit dans `email_change`, que ce déclencheur
 * ignore. Une adresse que personne n'a prouvée ne remplace jamais l'ancienne.
 *
 * `security definer` parce que le déclencheur s'exécute pour le compte du
 * serveur d'authentification, qui n'a aucun droit sur `public.profiles`.
 * `search_path` épinglé, et AUCUN droit d'exécution : une fonction de
 * déclencheur n'a rien à faire appelée directement.
 */
create function public.suivre_adresse_du_compte()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles
       set email = new.email
     where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.suivre_adresse_du_compte() from public;
revoke all on function public.suivre_adresse_du_compte() from anon, authenticated;

create trigger suivre_adresse_du_compte
  after update of email on auth.users
  for each row execute function public.suivre_adresse_du_compte();
