/*
 * 143 — L'INTERRUPTEUR D'INSCRIPTION NE FERMAIT QU'UN FORMULAIRE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE ROUGE, MESURÉ LE 06/09/2026 AVANT D'ÉCRIRE CETTE MIGRATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Interrupteur `inscriptions_ouvertes` posé à 0, puis création d'un compte par
 * un chemin qui ne traverse PAS `/fr/inscription` :
 *
 *     auth.users : 1
 *     profiles   : 1
 *     shops      : 1
 *
 * Un compte complet est né pendant une fermeture. C'est mot pour mot le défaut
 * que la migration 141 a corrigé — et elle l'a corrigé À UN SEUL ENDROIT.
 *
 * ⚠️ POURQUOI C'EST L-025 ET NON UNE RÉGRESSION. La 141 a déplacé la lecture de
 * `lire_inscriptions_ouvertes` dans `sInscrire`, avant `signUp`, et la sonde de
 * fumée qui la garde rejoue le VRAI FORMULAIRE. Les deux sont justes. Mais la
 * garde a hérité du champ de vision de la CORRECTION — le formulaire — au lieu
 * de celui du problème : *aucun compte ne doit naître*. Elle regarde là où le
 * défaut n'est plus.
 *
 * ⚠️ ET C'EST L-029 DANS SA FORME EXACTE. La phrase juste, aujourd'hui, est
 * « ce serait ouvert si quelqu'un activait Google » — donc c'est en sursis. La
 * connexion Google est écrite, inerte, et son activation est la prochaine
 * mission : `partirVersGoogle` part vers un fournisseur qui, au retour, insère
 * dans `auth.users` sans jamais traverser `sInscrire`. Mesuré le 06/09 :
 * `external.google = false` chez Supabase et `AUTH_GOOGLE_ACTIF` absent — la
 * porte n'est fermée que par une ABSENCE, et cette absence est datée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OÙ L'INVARIANT DOIT VIVRE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recopier la lecture dans chaque chemin qui ouvre une session produirait des
 * copies dont on ne corrigerait que celle qu'on a sous les yeux — c'est
 * exactement ce que `lib/comptes/apres-session` raconte avoir évité une fois
 * déjà. Et le prochain chemin ne serait pas couvert davantage.
 *
 * `creer_profil_et_shop` est le SEUL passage obligé : tout compte, quel que
 * soit son fournisseur, naît par un `insert` dans `auth.users`, donc par ce
 * déclencheur. Le principe directeur du projet s'applique tel quel — *une règle
 * applicative peut être oubliée dans un nouveau chemin de code, une règle en
 * base ne peut pas l'être*.
 *
 * ⚠️ LA GARDE APPLICATIVE DE `sInscrire` RESTE, ET ELLE N'EST PAS REDONDANTE.
 * Elle seule sait rendre `?erreur=fermees`, c'est-à-dire une phrase que le
 * visiteur comprend. Celle-ci ne sait produire qu'un refus de base. La première
 * est le message, la seconde est la garantie ; retirer la première rendrait le
 * produit brutal, retirer la seconde le rendrait faux.
 *
 * ⚠️ LA LECTURE QUI ÉCHOUE LAISSE ENTRER, comme dans `sInscrire`. Le défaut de
 * `lire_inscriptions_ouvertes` est « ouvert » ; une base momentanément
 * illisible ne doit pas fermer le produit sans que personne l'ait décidé. Seul
 * un `false` franc ferme.
 *
 * ⚠️ LE CODE D'ERREUR FAIT PARTIE DU CONTRAT (L-013). `DL052` n'est pas
 * réessayable : un refus métier qui porterait `40001` transformerait une
 * fermeture décidée en boucle de réessais.
 */

create or replace function public.creer_profil_et_shop()
  returns trigger
  language plpgsql
  security definer
  -- `search_path` épinglé : sans lui, un schéma placé en tête par l'appelant
  -- pourrait faire résoudre `profiles` vers une table qu'il contrôle.
  set search_path = ''
as $$
declare
  nouveau_profil_id uuid;
  v_ouvertes boolean;
begin
  /*
   * LE BLOC N'ENTOURE QUE LA LECTURE, et c'est délibéré. Rattraper plus large
   * masquerait un échec d'insertion de `profiles` ou de `shops` — c'est-à-dire
   * qu'on rendrait silencieux un compte né sans son profil, l'état que
   * `suivreApresSession` doit ensuite rattraper à l'écran.
   */
  begin
    v_ouvertes := public.lire_inscriptions_ouvertes();
  exception
    when others then
      v_ouvertes := true;
  end;

  if v_ouvertes = false then
    raise exception 'Les inscriptions sont fermées.' using errcode = 'DL052';
  end if;

  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  returning id into nouveau_profil_id;

  insert into public.shops (owner_id)
  values (nouveau_profil_id);

  return new;
end;
$$;

comment on function public.creer_profil_et_shop() is
  'Crée le profil et le shop à la naissance d''un compte, ET refuse cette '
  'naissance quand `inscriptions_ouvertes` vaut 0 (migration 143). La garde '
  'vit ici parce que c''est le SEUL passage obligé : lue dans `sInscrire` '
  'seule, elle ne fermait que le formulaire — mesuré le 06/09/2026, un compte '
  'complet naissait par tout autre chemin, dont le retour Google à venir. '
  'Lecture en échec = laisse entrer, comme côté applicatif.';

/*
 * ⚠️ `create or replace` CONSERVE LES PRIVILÈGES EXISTANTS, donc ce revoke ne
 * corrige rien aujourd'hui. Il est redéclaré parce qu'un droit d'exécution ne
 * s'écrit dans le corps d'aucune fonction (L-027) : quiconque relira ce fichier
 * pour comprendre la garde doit voir, au même endroit, que personne ne peut
 * l'appeler à la main.
 */
revoke execute on function public.creer_profil_et_shop()
  from public, anon, authenticated;
