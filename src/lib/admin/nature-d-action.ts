/**
 * LA LECTURE D'UNE ACTION DE JOURNAL — un seul point de décision.
 *
 * Cette règle vivait en DEUX exemplaires, un par écran. Le Panneau distinguait
 * `compte.suspension` de `compte.reactivation` ; le Journal repliait tout
 * `compte.*` sur « suspension ». Les deux lisent la même colonne et en
 * disaient deux choses différentes — et c'est le Journal, celui qu'on ouvre
 * précisément pour savoir ce qui s'est passé, qui rendait une réactivation en
 * rouge, pilule et encart de motif compris.
 *
 * Le journal d'audit est la pièce qu'on produit en cas de litige : y présenter
 * une réactivation comme une suspension affirme le contraire de ce que la base
 * a enregistré.
 */

/** Ce que l'action EST — sert à la couleur, jamais au filtre. */
export type NatureDAction = "suspension" | "reactivation" | "parametre" | "consultation";

/** Ce dans quoi l'action se RANGE — sert au filtre, calqué sur le SQL. */
export type FamilleDAction = "suspension" | "parametre" | "consultation";

/**
 * La nature exacte, pour colorer.
 *
 * L'ordre des tests n'est pas indifférent : `compte.reactivation` doit être
 * reconnue AVANT le préfixe `compte.`, sinon elle retombe sur la suspension —
 * c'est exactement le défaut d'origine.
 *
 * Une action inconnue tombe en `consultation`, jamais en `suspension` : un
 * défaut qui peindrait en rouge par défaut ferait lire une alerte là où il n'y
 * en a pas, et une alerte qui se trompe est une alerte qu'on apprend à ignorer.
 */
export function natureDAction(action: string): NatureDAction {
  if (action.startsWith("compte.reactivation")) return "reactivation";
  // Le déblocage d'un lien (166) RÉTABLIT, comme une réactivation ; le blocage, lui,
  // coupe, et tombe dans la règle `compte.` qui suit. En base, les deux se rangent dans
  // la famille « suspension » (like 'compte.%'), ce que `familleDAction` reproduit.
  if (action === "compte.deblocage_lien") return "reactivation";
  if (action.startsWith("compte.")) return "suspension";
  if (action.startsWith("parametre.")) return "parametre";
  return "consultation";
}

/**
 * La famille, pour le filtre.
 *
 * ⚠️ ELLE NE DISTINGUE PAS LA RÉACTIVATION, et c'est voulu : en base,
 * `lire_journal_admin` range tout `compte.%` dans la famille « suspension »
 * (migration 115). Distinguer ici ferait qu'un filtre « suspensions »
 * afficherait moins de lignes que le décompte annoncé juste au-dessus, sans
 * qu'aucune requête n'échoue.
 *
 * La parenté avec le SQL est vérifiée par `tests/unit/nature-d-action.test.ts`,
 * qui lit la migration plutôt que de s'en souvenir.
 */
export function familleDAction(action: string): FamilleDAction {
  if (action.startsWith("compte.")) return "suspension";
  if (action.startsWith("parametre.")) return "parametre";
  return "consultation";
}
