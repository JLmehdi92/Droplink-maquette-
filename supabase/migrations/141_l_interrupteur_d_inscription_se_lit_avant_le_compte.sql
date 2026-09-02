/*
 * `lire_inscriptions_ouvertes` DOIT ÊTRE LISIBLE PAR QUI N'A PAS ENCORE DE
 * COMPTE.
 *
 * ⚠️ L-027 DANS SA FORME EXACTE, ET ELLE M'A REPRIS EN PLEINE CORRECTION.
 *
 * L'interrupteur d'inscription se lisait dans `suivreApresSession`, donc APRÈS
 * `signUp` : mesuré sur un serveur servi, inscriptions fermées, la réponse
 * était bien `?erreur=fermees` et le compte naissait quand même — 1
 * `auth.users`, 1 `profiles`, 1 `shops`. La correction déplace la lecture dans
 * `sInscrire`, avant l'appel.
 *
 * Et là, la fermeture a cessé de mordre du tout : `303 → /fr/bienvenue`, alors
 * que l'interrupteur valait 0. La cause n'est écrite dans le corps d'aucune
 * fonction, donc invisible à toute relecture — il a fallu interroger le
 * catalogue :
 *
 *     lire_inscriptions_ouvertes   anon           EXECUTE = false
 *                                  authenticated  EXECUTE = true
 *
 * Appelée après `signUp`, la session existait : le rôle était `authenticated`
 * et l'appel passait. Appelée avant, l'appelant est `anon` — le rôle même de
 * quelqu'un qui n'a pas encore de compte, c'est-à-dire le seul rôle qui puisse
 * jamais s'inscrire. L'appel échouait, et la branche « lecture illisible »
 * laissait entrer, exactement comme elle doit le faire quand la base va mal.
 *
 * ⚠️ CE MODE DE DÉFAILLANCE EST LE PIRE POSSIBLE : la garde était en place, son
 * code était juste, le journal portait une ligne d'erreur que personne ne lit,
 * et l'écran se comportait comme si l'interrupteur était ouvert. C'est
 * précisément ce que le brief dit du droit d'exécution — *il ne s'écrit pas
 * dans le corps d'une fonction, aucun contrôle textuel ne peut le voir, il faut
 * interroger le catalogue*.
 *
 * CE QUE CE DROIT DIVULGUE : un booléen global, identique pour tout le monde,
 * que le formulaire d'inscription révèle de toute façon dès qu'il refuse. Il ne
 * dépend d'aucune adresse, d'aucun compte, d'aucune donnée de vendeur — ce
 * n'est donc pas un oracle, et l'accorder à `anon` n'ouvre rien.
 *
 * ⚠️ ET SEULEMENT CELLE-LÀ. `lire_suivi_actif`, sa voisine, garde son droit
 * inchangé : elle décrit une dépense qui nous concerne, et personne d'anonyme
 * n'a de raison de la lire.
 */

grant execute on function public.lire_inscriptions_ouvertes() to anon;

comment on function public.lire_inscriptions_ouvertes() is
  'Interrupteur de la création de comptes. Lisible par `anon` DÉLIBÉRÉMENT '
  '(migration 141) : la fermeture est vérifiée AVANT `signUp`, donc par '
  'quelqu''un qui n''a pas encore de session. Le rendre `authenticated` seul '
  'ferait échouer la lecture en silence, et la branche de repli laisse entrer.';
