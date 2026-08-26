/**
 * QUI DEVIENT LA PHOTO DE COUVERTURE, ET QUAND.
 *
 * ⚠️ DÉFAUT RÉEL, TROUVÉ À L'AUDIT DU 26/08/2026, ET LE CLIENT LE VOYAIT.
 *
 * La décision vivait dans la fermeture d'un `useCallback` et lisait
 * `medias.length`, capturé au rendu qui avait construit cette fermeture. Le
 * dépôt d'un lot chaîne tous les fichiers sur UNE SEULE instance de cette
 * fermeture : pour les huit fichiers d'une sélection, `medias.length` valait
 * donc `0` huit fois. La base recevait huit écritures de couverture, la
 * dernière gagnait — pendant que l'écran, lui, évaluait la liste FRAÎCHE et
 * encadrait la première.
 *
 * Le vendeur envoyait son lien en croyant avoir mis la photo 1 en avant ; son
 * client voyait la photo 8. Rien ne cassait, rien n'était journalisé, et le
 * vendeur ne pouvait s'en apercevoir qu'en rouvrant sa page publique.
 *
 * POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE LIGNE DANS LE COMPOSANT :
 *
 * Le dépôt est asynchrone, séquentiel et déclenché depuis un composant client.
 * Aucune bibliothèque de rendu n'est installée dans ce dépôt, donc une décision
 * enfermée dans le composant n'est éprouvable par RIEN — et c'est précisément
 * ce qui a laissé le défaut vivre. Sortie ici, elle se conduit comme ce qu'elle
 * est : une machine à états minuscule, dont on peut jouer un lot entier en
 * quelques lignes.
 *
 * LE COMPTE EST TENU, PAS DÉDUIT. Il est exact à l'instant de l'appel, alors
 * qu'une valeur lue dans l'état React est celle du rendu qui a créé la
 * fermeture. C'est toute la différence entre les deux comportements.
 */

export interface SuiviDeCouverture {
  /**
   * Enregistre un média confirmé, et dit s'il doit devenir la couverture.
   *
   * Vrai UNIQUEMENT pour le premier média d'une galerie vide. Le compte est lu
   * puis incrémenté dans le même geste : deux appels successifs ne peuvent pas
   * rendre `true` tous les deux, quelle que soit la vitesse à laquelle ils
   * s'enchaînent.
   */
  ajouter(): boolean;
  /** Enregistre un média retiré. */
  retirer(): void;
  /** Le compte courant — pour les tests, et pour lire un état sans le deviner. */
  compte(): number;
}

export function creerSuiviDeCouverture(nombreInitial: number): SuiviDeCouverture {
  // Un compte négatif n'a aucun sens et rendrait `ajouter()` faux pour le
  // premier média d'une galerie vide : on borne à l'entrée plutôt que de faire
  // confiance à l'appelant.
  let compte = Number.isInteger(nombreInitial) && nombreInitial > 0 ? nombreInitial : 0;

  return {
    ajouter(): boolean {
      const premier = compte === 0;
      compte += 1;
      return premier;
    },
    retirer(): void {
      compte = Math.max(0, compte - 1);
    },
    compte(): number {
      return compte;
    },
  };
}
