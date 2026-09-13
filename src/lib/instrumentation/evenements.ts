/**
 * Catalogue des événements d'usage.
 *
 * L'instrumentation est une FEATURE du MVP, pas un extra : un compteur branché
 * après coup démarre avec un historique vide, donc inexploitable au moment
 * précis où il faut décider. Le livrable réel de cette phase est la donnée
 * d'usage, pas le revenu.
 *
 * UN FAIT, UN POINT D'ÉMISSION. Trois appels dispersés pour le même événement
 * rendent le double comptage inévitable, et un double comptage sur un
 * NUMÉRATEUR gonfle le taux du côté rassurant — c'est-à-dire du côté qu'on ne
 * remet jamais en question.
 */

export const EVENEMENTS = {
  // --- Compte ---
  INSCRIPTION: "inscription",
  ONBOARDING_TERMINE: "onboarding_termine",
  /**
   * Réglages de marque enregistrés — un geste qui rhabille TOUTES les pages
   * publiques du vendeur à la fois. Distinct de `ONBOARDING_TERMINE` : l'écart
   * entre les deux dit si le vendeur revient régler sa marque après coup, donc
   * si l'écran sert à autre chose qu'à cocher une case le premier jour.
   */
  MARQUE_ENREGISTREE: "marque_enregistree",
  /**
   * Le titulaire a supprimé son compte, ou vidé ses données (écran Paramètres).
   * Ce sont les deux sorties VOLONTAIRES du produit : les confondre avec
   * l'inactivité ferait lire un départ comme un oubli, et la rétention de la
   * semaine 4 est une métrique de verdict. `objets` : les médias et le logo mis
   * en purge — l'ampleur de ce qui part.
   */
  COMPTE_SUPPRIME: "compte_supprime",
  DONNEES_SUPPRIMEES: "donnees_supprimees",

  // --- Commandes ---
  /**
   * Émis à l'OUVERTURE de l'éditeur. Distinct de `ORDER_CREATED`, et c'est
   * l'ÉCART ENTRE LES DEUX qui porte l'information : un brouillon ouvert puis
   * abandonné est exactement le cas « teste une ou deux fois puis disparaît ».
   */
  EDITEUR_OUVERT: "order_editor_opened",
  /**
   * Émis à la PREMIÈRE SAUVEGARDE DE CONTENU RÉEL, jamais à l'ouverture.
   * Contenu réel = nom du client, référence produit, numéro de suivi, ou média.
   * PAS les notes internes seules : elles sont pour le vendeur, pas pour son
   * client, et une commande qui n'en porte que ne sera jamais envoyée.
   */
  COMMANDE_CREEE: "order_created",
  COMMANDE_MODIFIEE: "commande_modifiee",
  COMMANDE_ARCHIVEE: "commande_archivee",
  COMMANDE_DUPLIQUEE: "commande_dupliquee",
  /**
   * L'export CSV. Il porte le nombre de lignes ET si le plafond a coupé.
   *
   * Sans le second, on ne saurait pas si le plafond de cinq mille gêne
   * réellement quelqu'un — on saurait seulement qu'il existe. C'est la même
   * discipline que pour un média refusé : un refus sans sa mesure ne dit pas de
   * combien on s'est trompé.
   */
  EXPORT_CSV: "export_csv",

  // --- Médias ---
  MEDIA_AJOUTE: "media_ajoute",
  /**
   * Doit TOUJOURS porter le motif ET la taille réelle. Sans la taille, on ne
   * saura pas de combien le seuil s'est trompé, seulement qu'il s'est déclenché.
   */
  MEDIA_REFUSE: "media_refuse",

  // --- Lien ---
  LIEN_PARTAGE: "lien_partage",
  LIEN_REVOQUE: "lien_revoque",
  /** Émis CÔTÉ SERVEUR au rendu. Borne haute des vues réelles. */
  PAGE_PUBLIQUE_RENDUE: "page_publique_rendue",
  /**
   * Émis APRÈS le rendu, pas pendant. WhatsApp, Snap et Discord chargent les
   * liens qu'on leur colle : compter au rendu gonflerait PAR CONSTRUCTION la
   * métrique de verdict.
   */
  VUE_ENREGISTREE: "vue_enregistree",

  // --- QC ---
  QC_APPROUVE: "qc_approuve",
  QC_REFUSE: "qc_refuse",

  // --- Suivi ---
  /**
   * LA PRISE EN CHARGE CHEZ LE FOURNISSEUR — LE SEUL GESTE FACTURÉ.
   *
   * Le fournisseur facture à la prise en charge, pas à l'interrogation : ce
   * compteur est donc le seul du produit qui corresponde à une ligne de facture,
   * et le seul dont l'exactitude se paie en argent.
   *
   * ⚠️ IL AVAIT UN SECOND POINT D'ÉMISSION, dans l'ingestion, franchi à CHAQUE
   * interrogation de cadence qui appliquait un état. Le compteur mesurait donc
   * les interrogations — un colis long en compte des dizaines — et non les
   * prises en charge. C'est le double comptage sur le pire des compteurs :
   * celui qui aurait servi à décider si le coût variable du produit tient.
   */
  COLIS_PRIS_EN_CHARGE: "colis_pris_en_charge",
  /**
   * Un état de colis appliqué en base, avec l'étape atteinte.
   *
   * C'est ce que l'ingestion SAIT réellement : elle voit l'état que le
   * fournisseur rapporte, jamais la transition depuis l'état précédent — la
   * base applique `greatest(actuel, candidat)` sans le lui dire.
   */
  ETAPE_FRANCHIE: "etape_franchie",
  PREMIER_SCAN: "premier_scan",
  /**
   * Un numéro fraîchement collé n'est souvent pas encore scanné. Ce retour vide
   * compte dans les compteurs de coût mais ne déclenche ni la cadence du silence
   * ni l'abandon.
   */
  INTERROGATION_VIDE: "interrogation_vide",
  SUIVI_ABANDONNE: "suivi_abandonne",
  COLIS_IMMOBILISE: "colis_immobilise",

  // --- Notifications ---
  NOTIFICATION_ENVOYEE: "notification_envoyee",
  NOTIFICATION_ECHOUEE: "notification_echouee",
  NOTIFICATION_REBOND: "notification_rebond",
} as const;

export type NomEvenement = (typeof EVENEMENTS)[keyof typeof EVENEMENTS];

/**
 * Événements servant de DÉNOMINATEUR dans une métrique de verdict.
 *
 * Ils méritent une vigilance particulière : un dénominateur perdu fait MONTER
 * le taux, donc se trompe du côté rassurant. Une métrique légèrement faussée est
 * pire qu'une métrique cassée, parce qu'elle reste crédible.
 */
export const EVENEMENTS_DENOMINATEURS: readonly NomEvenement[] = [
  EVENEMENTS.INSCRIPTION,
  EVENEMENTS.EDITEUR_OUVERT,
  EVENEMENTS.PAGE_PUBLIQUE_RENDUE,
];

/**
 * Événements CATALOGUÉS MAIS PAS ENCORE ÉMIS, et pourquoi.
 *
 * Ce registre existe parce que l'alternative est pire dans les deux sens. Les
 * retirer du catalogue ferait disparaître du dépôt la trace d'une mesure qu'on
 * a décidé de prendre — et le brief les nomme. Les laisser sans rien dire les
 * rendrait indiscernables de ceux qui sont branchés : une lecture du catalogue
 * conclurait que le produit mesure ce qu'il ne mesure pas, et c'est exactement
 * L-014, un document qui affirme un état que personne n'a exécuté.
 *
 * La sonde `tests/unit/instrumentation-inventaire.test.ts` compare ce registre
 * aux sites d'émission réels DANS LES DEUX SENS : un événement qui perd son
 * émetteur sans être déclaré ici fait échouer, et une déclaration devenue
 * inutile aussi.
 */
export const EVENEMENTS_SANS_EMETTEUR: ReadonlyMap<NomEvenement, string> = new Map([
  [
    EVENEMENTS.LIEN_PARTAGE,
    "Le partage est un geste de NAVIGATEUR — copier le lien, ouvrir la page. " +
      "L'émettre depuis le serveur exigerait une action dédiée, donc un point " +
      "d'entrée public de plus pour une mesure ; l'émettre depuis le client le " +
      "rendrait invisible derrière un bloqueur. À trancher avec Wassim, pas à " +
      "brancher au plus vite.",
  ],
  [
    EVENEMENTS.NOTIFICATION_ENVOYEE,
    "Aucun envoi d'email n'existe encore dans le produit : `src/lib/email/` ne " +
      "contient que la correction de saisie d'adresse. Un émetteur posé avant " +
      "la fonctionnalité mesurerait le vide.",
  ],
  [
    EVENEMENTS.NOTIFICATION_ECHOUEE,
    "Même raison : il n'y a pas d'envoi, donc pas d'échec d'envoi. Et cet " +
      "événement-là n'a de sens qu'avec le précédent — un taux d'échec sans " +
      "dénominateur ne se lit pas.",
  ],
  [
    EVENEMENTS.NOTIFICATION_REBOND,
    "Un rebond est rapporté par le prestataire d'envoi, sur un point de " +
      "réception qui n'existe pas. Il viendra avec le sous-domaine d'envoi " +
      "dédié et sa configuration SPF/DKIM/DMARC.",
  ],
]);
