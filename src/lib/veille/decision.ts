/**
 * LA DÉCISION D'ALERTER — pure, sans réseau, sans base.
 *
 * Même partage que `lib/tracking/schedule.ts` : le module qui DÉCIDE ne parle à
 * personne, et le module qui parle ne décide rien. C'est ce qui rend la règle
 * ci-dessous falsifiable en quelques millisecondes plutôt qu'en montant un
 * planificateur.
 *
 * ── LE PROBLÈME QUE CE MODULE RÉSOUT ───────────────────────────────────────
 *
 * Le brief interdit d'alerter sur une tâche jamais exécutée, et il a raison :
 *
 *   « `never_ran` n'est pas une alerte : une tâche posée ce matin n'a pas
 *     encore eu son premier passage ; la signaler ferait chercher une panne
 *     inexistante. Une alerte qui se trompe est une alerte qu'on apprend à
 *     ignorer. »
 *
 * Mais appliquée seule, cette règle laisse un trou par lequel est passé l'état
 * actuel du produit : une tâche qui n'est JAMAIS déployée n'est jamais
 * signalée non plus. « Pas encore » et « jamais » produisent la même absence de
 * ligne, et l'absence de ligne ne se distingue pas d'elle-même.
 *
 * CE QUI LES DISTINGUE N'EST PAS LA TÂCHE ABSENTE, C'EST L'ÂGE DE CELUI QUI LA
 * CHERCHE. Un veilleur qui vient de naître ne sait rien. Un veilleur qui tourne
 * depuis quatre périodes de retard et n'a jamais vu battre sa jumelle ne
 * regarde pas une tâche fraîche — il regarde une tâche qui n'existe pas.
 *
 * D'où la règle : `jamais_vue` n'alerte QUE si l'observateur est lui-même assez
 * vieux pour que le silence signifie quelque chose. La preuve est portée par sa
 * propre ancienneté, jamais par une horloge de déploiement qu'il faudrait
 * penser à mettre à jour.
 *
 * ── ET POURQUOI UN VEILLEUR NE SE VEILLE PAS LUI-MÊME ──────────────────────
 *
 * `decider` écarte l'observateur de son propre verdict. Ce n'est pas une
 * optimisation : un veilleur arrêté n'exécute pas le code qui constaterait son
 * arrêt. Un mécanisme qui prétendrait surveiller sa propre vivacité rendrait
 * toujours « je vais bien », y compris — surtout — quand ce n'est plus vrai.
 * L-022 : « le veilleur ne peut pas être ce qu'il veille. »
 */

export type EtatVeille = "actif" | "en_retard" | "jamais_vue";

/** Ce que la base rapporte d'une tâche attendue. */
export interface BattementVu {
  readonly source: string;
  readonly etat: EtatVeille;
  /** Minutes depuis le dernier battement. `null` quand il n'y en a jamais eu. */
  readonly minutes: number | null;
  /** Premier battement observé. `null` quand la tâche n'a jamais battu. */
  readonly premierBattement: string | null;
}

export type MotifAlerte = "en_retard" | "jamais_deployee";

export interface Alerte {
  readonly source: string;
  readonly motif: MotifAlerte;
  /**
   * Clé de repos. Elle NE PORTE PAS le nom de l'observateur, délibérément :
   * deux veilleurs qui constatent la même panne doivent réserver la MÊME clé,
   * donc n'envoyer qu'un seul email. L'inverse en enverrait un par observateur,
   * et le volume est ce qui apprend à ignorer une alerte.
   */
  readonly cle: string;
  readonly sujet: string;
  readonly texte: string;
}

/**
 * Combien de temps l'observateur doit avoir vécu avant que le silence d'une
 * tâche jamais vue devienne une information.
 *
 * DÉRIVÉ du seuil de retard plutôt qu'ajouté à l'inventaire des paramètres :
 * ce n'est pas une valeur qu'un administrateur a besoin de régler, c'est une
 * conséquence de celle qu'il règle déjà. Un paramètre de plus est une surface
 * de plus, et une valeur que personne ne touchera jamais dérive en silence.
 *
 * Quatre périodes : assez pour qu'un démarrage décalé, un premier passage raté
 * et un redémarrage tiennent dedans sans produire de fausse alerte. Un plancher
 * d'une heure parce qu'un seuil de retard réglé à cinq minutes ramènerait la
 * grâce à vingt, ce qui est plus court qu'un déploiement.
 */
export function graceMinutes(retardMinutes: number): number {
  return Math.max(60, retardMinutes * 4);
}

/** Minutes écoulées depuis un instant, ou `null` si l'instant est illisible. */
function ancienneteMinutes(depuis: string | null, maintenant: Date): number | null {
  if (depuis === null) return null;
  const t = Date.parse(depuis);
  if (Number.isNaN(t)) return null;
  return (maintenant.getTime() - t) / 60_000;
}

export interface DemandeDeVeille {
  /** L'observateur. Il est écarté de son propre verdict. */
  readonly veilleur: string;
  /** L'état de TOUTES les tâches attendues, l'observateur compris. */
  readonly battements: readonly BattementVu[];
  readonly maintenant: Date;
  readonly retardMinutes: number;
}

export function decider(demande: DemandeDeVeille): readonly Alerte[] {
  const { veilleur, battements, maintenant, retardMinutes } = demande;

  const moi = battements.find((b) => b.source === veilleur);
  const monAge = ancienneteMinutes(moi?.premierBattement ?? null, maintenant);
  const grace = graceMinutes(retardMinutes);

  const alertes: Alerte[] = [];

  for (const b of battements) {
    if (b.source === veilleur) continue;

    if (b.etat === "en_retard") {
      const minutes = Math.round(b.minutes ?? 0);
      alertes.push({
        source: b.source,
        motif: "en_retard",
        cle: `veille:${b.source}:en_retard`,
        sujet: `[DropLink] Tâche en retard : ${b.source}`,
        // LE SIGNALEMENT PORTE SA VALEUR, jamais un jugement seul : « 214
        // minutes sur un seuil de 60 » se vérifie, « la tâche est en retard »
        // se croit.
        texte:
          `La tâche de fond « ${b.source} » n'a pas battu depuis ${minutes} minutes, ` +
          `pour un seuil de ${retardMinutes}.\n\n` +
          `Constaté par « ${veilleur} » à ${maintenant.toISOString()}.\n\n` +
          `Ce que cela implique : tant qu'elle ne bat pas, aucun colis n'est interrogé, ` +
          `aucun abandon n'est prononcé, aucune immobilité n'est nommée, et la purge des ` +
          `réponses brutes à 90 jours ne tourne pas.`,
      });
      continue;
    }

    if (b.etat === "jamais_vue") {
      /*
       * LE SILENCE NE DEVIENT UNE INFORMATION QU'À PARTIR D'UN CERTAIN ÂGE.
       *
       * `monAge === null` couvre deux cas et les traite pareil : l'observateur
       * n'a pas encore de premier battement, ou son inventaire ne le contient
       * pas. Dans les deux cas il n'a AUCUNE preuve d'ancienneté — et on
       * n'alerte jamais sur une absence de preuve. Se taire par ignorance est
       * réparable ; crier par ignorance ne l'est pas.
       */
      if (monAge === null || monAge < grace) continue;

      alertes.push({
        source: b.source,
        motif: "jamais_deployee",
        cle: `veille:${b.source}:jamais_deployee`,
        sujet: `[DropLink] Tâche jamais déployée : ${b.source}`,
        texte:
          `La tâche de fond « ${b.source} » n'a JAMAIS battu.\n\n` +
          `Ce n'est pas un démarrage en cours : « ${veilleur} » tourne depuis ` +
          `${Math.round(monAge)} minutes, soit plus que la grâce de ${grace} minutes ` +
          `accordée à un premier passage. Aucun planificateur ne l'appelle.\n\n` +
          `Constaté à ${maintenant.toISOString()}.`,
      });
    }
  }

  return alertes;
}
