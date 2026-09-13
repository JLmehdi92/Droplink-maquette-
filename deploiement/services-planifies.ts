/**
 * LES DEUX SERVICES PLANIFIÉS DE RAILWAY — CE QU'IL FAUT SAISIR, À LA MAIN.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER REMPLACE DEUX CONFIGURATIONS QUE RAILWAY NE PEUT PAS APPLIQUER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le dépôt a porté jusqu'au 06/09/2026 `deploiement/railway-cadence.json` et
 * `deploiement/railway-veille.json` : deux fichiers au schéma Railway, avec
 * `startCommand`, `cronSchedule` et `restartPolicyType`. Tout y était juste.
 * Ils ne pouvaient simplement JAMAIS être lus.
 *
 * Relevé le 06/09/2026 sur `docs.railway.com/guides/config-as-code`, mot pour
 * mot :
 *
 *     « railway.json/toml files continue to work for services that already
 *       use them until 2026-12-01 (hard cutoff). »
 *     « New services cannot opt into Config as Code. »
 *
 * `cadence` et `veille` sont des services NEUFS. La seconde phrase les exclut
 * définitivement : aucun chemin de configuration, aucun réglage, aucune
 * version du fichier ne les y abonnera. La voie n'est pas dépréciée pour eux,
 * elle est FERMÉE.
 *
 * ⚠️ ET C'ÉTAIT LE PIRE GENRE DE FAUX. Deux fichiers d'apparence officielle,
 * un `$schema` Railway, une suite de tests VERTE qui les validait ligne à
 * ligne — et rien, nulle part, ne disait qu'ils n'étaient appliqués par
 * personne. Un lecteur pressé (moi, le 06/09) en conclut que les services sont
 * configurés par le dépôt, ne saisit rien dans l'interface, et le suivi des
 * colis reste à l'arrêt sans qu'aucun signal ne parte. C'est L-014 dans sa
 * forme la plus coûteuse : un document affirme un état que personne n'exécute,
 * et une garde le certifie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS L'INFRASTRUCTURE AS CODE, QUE RAILWAY RECOMMANDE À LA PLACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vérifié le même jour sur `docs.railway.com/infrastructure-as-code` : le
 * fichier `.railway/railway.ts` gère « services, databases, volumes, buckets,
 * custom domains, environment variables, replicas, and canvas groups ». Aucune
 * planification. Il n'existe donc aujourd'hui AUCUNE voie versionnée pour
 * déclarer un cron chez Railway — la saisie manuelle n'est pas un pis-aller,
 * c'est le seul chemin.
 *
 * D'où ce fichier : puisque la configuration réelle vit dans une interface que
 * le dépôt ne peut pas atteindre, le dépôt garde au moins la RÉFÉRENCE de ce
 * qui doit y être tapé, sous une forme que les tests savent vérifier. Les noms
 * de champs sont ceux des libellés de l'interface, exprès : on ouvre ce
 * fichier à côté de l'onglet Settings et on recopie.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE TOUJOURS PAS : que Railway porte réellement
 * ces valeurs. Rien ici ne peut l'établir, et il ne faut pas faire semblant.
 * La seule preuve d'exécution est ailleurs, et elle est bonne : la table
 * `scheduler_heartbeat` se remplit, et l'écran Monitoring de l'admin fait
 * passer les deux tâches de « Jamais exécutée » à « Actif ».
 */

/** Un service Railway qui exécute une tâche puis s'éteint. */
export type ServicePlanifie = {
  /** Le champ « Service Name » de l'onglet Settings. */
  readonly nom: string;
  /** L'argument passé au planificateur — il doit exister dans ses `ROUTES`. */
  readonly tache: string;
  /**
   * Le champ « Custom Build Command ».
   *
   * ⚠️ IL NE DOIT SURTOUT PAS ÊTRE `pnpm build`. Défaut attrapé le 04/09/2026 :
   * `next build` LÈVE quand les variables Supabase sont absentes, et un service
   * planifié n'en reçoit que deux. Le build aurait échoué, le planificateur
   * n'aurait jamais tourné, et le produit aurait eu l'air déployé.
   */
  readonly commandeDeBuild: string;
  /** Le champ « Custom Start Command ». */
  readonly commandeDeDemarrage: string;
  /** Le champ « Cron Schedule », en UTC — Railway ne connaît pas d'autre fuseau. */
  readonly horaire: string;
  /**
   * Le champ « Restart Policy ».
   *
   * ⚠️ LE RÉGLAGE QUE PERSONNE NE PENSE À FAIRE. Le planificateur fait son
   * travail PUIS S'ÉTEINT : c'est son contrat. Railway, lui, voit un processus
   * qui se termine — et sous `ALWAYS` il le relance aussitôt. La cadence
   * deviendrait continue, c'est-à-dire un appel au fournisseur de suivi sans
   * aucune borne, et c'est le seul coût variable du produit.
   */
  readonly politiqueDeRedemarrage: "NEVER";
  /**
   * Les variables d'environnement à poser sur CE service, onglet Variables.
   *
   * ⚠️ `CRON_SECRET` doit être identique au service web, au caractère près. Un
   * écart ne produit pas d'erreur lisible : les routes de tâche répondent 404
   * à un secret refusé exactement comme à un inconnu — c'est délibéré, un 401
   * confirmerait leur existence. Le planificateur le dit dans son message
   * d'échec, et c'est la seule chose qui distingue les deux cas.
   *
   * IL NE SE RECOPIE DONC PAS À LA MAIN. Railway sait faire emprunter à un
   * service la valeur d'un autre du même projet, et c'est la forme à saisir :
   *
   *     CRON_SECRET = ${{<nom du service web>.CRON_SECRET}}
   *
   * Une valeur qu'on ne recopie pas est une valeur qu'on ne peut pas mal
   * recopier, et la régénérer d'un seul côté la propage.
   *
   * ⚠️ MAIS UNE RÉFÉRENCE EST ELLE AUSSI FAILLIBLE, ET SILENCIEUSEMENT : si le
   * nom du service est faux d'une lettre, Railway ne résout rien et transmet la
   * CHAÎNE `${{…}}`. Elle est non vide, elle franchit tout contrôle de
   * présence, et la route répond 404 — on chercherait une route disparue là où
   * c'est une substitution qui n'a pas eu lieu. C'est L-026, et le planificateur
   * refuse désormais de partir dans ce cas, en nommant la variable fautive.
   */
  readonly variables: readonly string[];
};

/**
 * ⚠️ DEUX SERVICES, ET C'EST UNE EXIGENCE D'ARCHITECTURE, PAS UN DÉTAIL.
 *
 * « Le veilleur ne peut pas être ce qu'il veille » (L-022). Un service unique
 * qui appellerait les deux routes les ferait tomber ENSEMBLE, et il ne
 * resterait personne pour le constater — c'est-à-dire exactement la panne que
 * la veille existe pour rendre visible.
 *
 * LES HORAIRES SONT DÉCALÉS EXPRÈS : la cadence au quart d'heure rond, la
 * veille cinq minutes après. Le veilleur observe ainsi un passage TERMINÉ,
 * jamais un passage en cours. Et les deux respectent le plancher de Railway :
 * « the shortest time between successive executions cannot be less than
 * 5 minutes ».
 */
export const SERVICES_PLANIFIES: readonly ServicePlanifie[] = [
  {
    nom: "cadence",
    tache: "cadence",
    commandeDeBuild: "echo planificateur-sans-build-next",
    commandeDeDemarrage: "node deploiement/planificateur.mjs cadence",
    horaire: "*/15 * * * *",
    politiqueDeRedemarrage: "NEVER",
    variables: ["PLANIFICATEUR_BASE_URL", "CRON_SECRET"],
  },
  {
    nom: "veille",
    tache: "veille",
    commandeDeBuild: "echo planificateur-sans-build-next",
    commandeDeDemarrage: "node deploiement/planificateur.mjs veille",
    horaire: "5,20,35,50 * * * *",
    politiqueDeRedemarrage: "NEVER",
    variables: ["PLANIFICATEUR_BASE_URL", "CRON_SECRET"],
  },
];
