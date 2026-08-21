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
  COLIS_PRIS_EN_CHARGE: "colis_pris_en_charge",
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
