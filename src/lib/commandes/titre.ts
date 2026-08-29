/**
 * COMMENT UNE COMMANDE S'APPELLE, à l'écran ET dans l'onglet du navigateur.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ EN PILOTANT LE 29/08/2026. L'onglet de l'éditeur
 * annonçait « Nouvelle commande » pour TOUTES les commandes, y compris une
 * commande vieille de trois jours, remplie, expédiée et déjà consultée par son
 * client. Il n'existe aucune route « créer une commande » : la Server Action
 * crée la ligne en base puis redirige vers `/commandes/<id>`. Ce titre, écrit
 * pour l'instant qui suit la création, s'appliquait donc à vie.
 *
 * Ça ne se voyait pas en relisant, parce que le TITRE À L'ÉCRAN était juste :
 * l'en-tête portait déjà le nom du client. Les deux règles vivaient à deux
 * endroits, et une seule des deux avait été écrite.
 *
 * CE QUE ÇA COÛTAIT : un fournisseur à 200 commandes par semaine travaille avec
 * plusieurs onglets ouverts. Quatorze onglets nommés « Nouvelle commande » ne
 * se distinguent pas — et c'est exactement le profil sur lequel le produit est
 * dimensionné.
 *
 * LA RÈGLE VIT ICI ET NULLE PART AILLEURS. La sortir d'un des deux appelants
 * n'aurait fait que déplacer la divergence ; c'est de l'avoir écrite deux fois
 * que venait le défaut.
 */

/**
 * Le nom d'une commande.
 *
 * `libelleBrouillon` est passé par l'appelant plutôt que lu ici : ce module ne
 * connaît pas la langue, et une chaîne visible ne se met jamais en dur.
 */
export function titreDeCommande(
  nomDuClient: string | null | undefined,
  libelleBrouillon: string,
): string {
  const nom = (nomDuClient ?? "").trim();
  return nom === "" ? libelleBrouillon : nom;
}
