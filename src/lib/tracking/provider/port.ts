/**
 * LE PORT DU SUIVI — ce que le PRODUIT attend, exprimé sans aucun fournisseur.
 *
 * UN SEUL FICHIER DE L'APPLICATION CONNAÎTRA JAMAIS 17TRACK : son adaptateur.
 * La vraie justification n'est pas de pouvoir en changer un jour — c'est de
 * rendre la NORMALISATION ÉPROUVABLE SANS RÉSEAU. Un suivi qu'on ne peut tester
 * qu'en attendant qu'un vrai colis traverse la moitié du monde n'est pas testé,
 * il est espéré.
 *
 * CE QUE CE FICHIER NE CONTIENT PAS, ET NE DOIT JAMAIS CONTENIR : une URL, un
 * nom de fournisseur, un code transporteur numérique, un nom de champ de leur
 * réponse. Tout cela vit dans l'adaptateur. La règle est vérifiée par un test —
 * un fichier de port qui laisse fuir le vocabulaire du fournisseur ne remplit
 * plus aucun office.
 */

import type { Etape } from "../normalize";

/** Un point de passage, tel que le produit le comprend. */
export interface PointPort {
  readonly instant: string | null;
  readonly description: string | null;
  readonly lieu: string | null;
  readonly etape: string | null;
}

/** L'état d'un colis, tel que le produit le comprend. */
export interface EtatColisPort {
  /**
   * Le statut BRUT du fournisseur, conservé tel quel.
   *
   * Il n'est pas là pour être affiché mais pour être RETROUVÉ : un statut qu'on
   * n'a pas su traduire disparaîtrait sans laisser de trace, et on ne saurait
   * jamais qu'il a existé.
   */
  readonly statutBrut: string | null;
  readonly jalons: readonly { readonly etape: string; readonly date: string | null }[];
  readonly points: readonly PointPort[];
  readonly transporteur: number | null;
  readonly estimationDu: string | null;
  readonly estimationAu: string | null;
}

/**
 * Ce que rend une prise en charge ou une interrogation.
 *
 * `vide` N'EST PAS UNE ERREUR, et c'est la distinction la plus importante de ce
 * fichier. Un numéro fraîchement collé n'est pas encore scanné : le fournisseur
 * répond « rien », ce retour est facturé, et il ne doit déclencher NI la cadence
 * du silence NI l'abandon. Le confondre avec « introuvable » ferait abandonner
 * le suivi de colis parfaitement normaux, la veille du jour où ils bougent.
 */
export type ReponsePort =
  | { readonly statut: "ok"; readonly etat: EtatColisPort; readonly brut: unknown }
  | { readonly statut: "vide"; readonly brut: unknown }
  | { readonly statut: "refuse"; readonly motif: string }
  | { readonly statut: "indisponible"; readonly motif: string };

/**
 * L'adaptateur d'un fournisseur de suivi.
 *
 * `prendreEnCharge` est SÉPARÉE de `interroger` parce que les deux ne coûtent
 * pas la même chose : les fournisseurs facturent à la PRISE EN CHARGE d'un
 * numéro, pas à l'interrogation. Les fondre en une seule méthode rendrait
 * invisible le seul geste qui se paie.
 */
export interface FournisseurSuivi {
  /** Nom court, pour les journaux. Jamais affiché à un utilisateur. */
  readonly nom: string;

  /**
   * LES en-têtes HTTP susceptibles de porter la signature des notifications.
   *
   * Ils sont DÉCLARÉS ICI et pas écrits en dur dans la route, parce que leurs
   * noms sont du vocabulaire de fournisseur : les laisser dans la route ferait
   * de celle-ci un second fichier qui connaît le fournisseur, et la frontière
   * ne tiendrait plus qu'à la discipline de qui la relit.
   *
   * C'est une LISTE et non un nom unique parce que les documentations d'un même
   * fournisseur peuvent se contredire sur ce point — et un pari perdu sur un nom
   * refuse TOUTES les notifications en 401, donc arrête le suivi EN SILENCE.
   * Accepter plusieurs noms n'affaiblit rien : une requête non signée n'en porte
   * aucun, et la signature reste vérifiée à l'identique sur celui qui arrive.
   *
   * L'ordre compte : le premier en-tête PRÉSENT est celui qui fait foi.
   */
  readonly enTetesSignature: readonly string[];

  /** Déclare un numéro au fournisseur. C'est CE geste qui est facturé. */
  prendreEnCharge(numero: string, transporteur: number | null): Promise<ReponsePort>;

  /** Demande l'état d'un numéro déjà pris en charge. */
  interroger(numero: string, transporteur: number | null): Promise<ReponsePort>;

  /**
   * Vérifie qu'une notification vient bien du fournisseur.
   *
   * Elle prend le CORPS BRUT, jamais un objet analysé : la signature porte sur
   * les octets exacts reçus, et un aller-retour par `JSON.parse` puis
   * `JSON.stringify` réordonne les clefs, change les espaces et invalide la
   * signature — ou pire, la valide sur un contenu qui n'est plus celui reçu.
   */
  verifierNotification(corpsBrut: string, signature: string | null): boolean;

  /** Extrait l'état d'une notification déjà VÉRIFIÉE. */
  lireNotification(corpsBrut: string): ReponsePort & { readonly numero?: string };
}

/** L'étape que le produit affiche. Réexportée pour que le port se lise seul. */
export type { Etape };
