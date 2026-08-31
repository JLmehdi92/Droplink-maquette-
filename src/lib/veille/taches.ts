/**
 * L'INVENTAIRE DES TÂCHES DE FOND — la seule liste, pour les deux lecteurs.
 *
 * Elle vivait dans `lib/audit/surveillance.ts`, c'est-à-dire du côté de l'ÉCRAN.
 * Elle est descendue ici parce qu'elle a désormais DEUX lecteurs : l'écran
 * d'administration, et le veilleur qui envoie les alertes. Deux listes se
 * seraient séparées le jour où une tâche est ajoutée à l'une — et la panne
 * qu'on n'aurait pas vue est exactement celle qu'une seconde liste devait
 * couvrir. Le sens de la dépendance est celui-ci : l'écran et le veilleur
 * lisent l'inventaire, l'inventaire ne connaît ni l'un ni l'autre.
 *
 * ⚠️ CETTE LISTE EST CE QUI REND LE TROISIÈME ÉTAT POSSIBLE. `scheduler_heartbeat`
 * ne porte que les sources ayant DÉJÀ battu : sans inventaire, une tâche jamais
 * exécutée est invisible, donc indiscernable d'une tâche qui n'existe pas. Une
 * sonde qui part de la table ne peut rendre que ce que la table contient, et un
 * ensemble vide passe tout.
 *
 * ── POURQUOI DEUX, ET PAS UNE ──────────────────────────────────────────────
 *
 * Il n'y en avait qu'une, et le commentaire d'alors disait que la « veille
 * mutuelle entre deux planificateurs » du brief (§3, décision 11) n'était PAS
 * implémentée — l'afficher aurait annoncé une protection inexistante.
 *
 * Elle l'est depuis la migration 128. `veille-mutuelle` n'est pas une seconde
 * copie de la cadence : c'est un passage qui ne fait QUE regarder l'autre, et
 * qui doit donc être appelé par un planificateur DIFFÉRENT. Deux tâches sur le
 * même planificateur ne veillent rien — elles s'arrêtent ensemble, et c'est
 * précisément le défaut que L-022 nomme.
 *
 * ⚠️ LA LIMITE QUI RESTE, ET QU'IL FAUT DIRE. Si les DEUX planificateurs sont
 * absents — l'état du produit tant que rien n'est déployé — aucun code de ce
 * dépôt ne s'exécute, donc aucune alerte ne part. Aucun mécanisme interne ne
 * peut couvrir ce cas : il faudrait un tiers qui nous attende. La veille
 * mutuelle couvre la mort de L'UN des deux, qui est le cas réel après
 * déploiement. Prétendre plus serait la fausse assurance que ce fichier
 * cherche à éviter.
 */

/** La cadence de suivi : interroge les transporteurs, purge, abandonne. */
export const TACHE_CADENCE = "cadence-suivi";

/** Le passage qui ne fait que veiller sur l'autre. */
export const TACHE_VEILLE = "veille-mutuelle";

export const TACHES_ATTENDUES: readonly string[] = [TACHE_CADENCE, TACHE_VEILLE] as const;
