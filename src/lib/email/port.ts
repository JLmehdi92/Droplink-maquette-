/**
 * CE QUE LE PRODUIT ATTEND D'UN EXPÉDITEUR D'EMAIL.
 *
 * Un PORT, pas une API — même forme que `lib/tracking/provider/port.ts`, et
 * pour la même raison. Ce n'est pas de pouvoir changer de fournisseur un jour :
 * c'est que la DÉCISION d'envoyer, et ce qu'on fait de l'échec, restent
 * éprouvables sans réseau. Un seul fichier connaîtra jamais un fournisseur.
 *
 * ── POURQUOI TROIS ISSUES ET NON DEUX ──────────────────────────────────────
 *
 * `envoye` / `refuse` suffirait à un appelant qui veut juste savoir si ça a
 * marché. Il ne suffit pas ici, parce que les deux échecs n'ont pas la même
 * signification opérationnelle et n'appellent pas la même réaction :
 *
 *   - `refuse`         : le fournisseur a été joint et n'a pas voulu. On
 *                        réessaiera, la panne est peut-être passagère.
 *   - `non_configure`  : PERSONNE N'A ÉTÉ JOINT, et personne ne le sera tant
 *                        qu'une variable manque. Réessayer est inutile ; ce
 *                        qu'il faut, c'est le dire fort.
 *
 * Confondre les deux produirait exactement le défaut que L-024 décrit : « un
 * point d'ingestion qui répond 200 ne prouve pas qu'il a accepté ». Un
 * expéditeur non configuré qui rendrait `envoye` — ou même un `refuse`
 * indistinct — laisserait le veilleur consigner des alertes parties qui ne sont
 * jamais parties. C'est la pire défaillance possible pour un mécanisme dont
 * l'unique raison d'être est de nous prévenir.
 *
 * AUCUNE DE CES ISSUES N'EST UNE EXCEPTION. Un envoi qui échoue ne doit pas
 * faire échouer le passage de tâche qui l'a demandé : on veut le journal ET la
 * suite du travail. C'est le TYPAGE qui force l'appelant à traiter les trois
 * cas, pas une relecture (L-030).
 */

/**
 * ⚠️ AUCUN DESTINATAIRE ICI, ET C'EST LA PROPRIÉTÉ QUI COMPTE.
 *
 * Une première version portait `destinataire: string` — que l'adaptateur
 * ignorait, puisqu'il lit l'adresse dans la configuration. Un champ que le
 * contrat déclare et que personne n'honore est un mensonge en attente : le
 * premier appelant qui s'y fie enverra ailleurs qu'il ne croit.
 *
 * Il est retiré plutôt que branché, parce que le comportement de l'adaptateur
 * était le bon : la destination d'une alerte d'exploitation vient de la
 * CONFIGURATION, jamais de l'appel. Une alerte dont l'appelant choisit le
 * destinataire est une alerte qu'on peut détourner — et le détournement le plus
 * simple consiste à l'envoyer à une adresse que personne ne relève.
 *
 * Le jour où des emails de MARQUE partiront vers les vendeurs, ils auront leur
 * propre port : destinataire variable, gabarit, langue du vendeur. Ce port-ci
 * n'a qu'un correspondant possible, et c'est nous.
 */
export interface Message {
  readonly sujet: string;
  /**
   * Corps en TEXTE BRUT, jamais en HTML.
   *
   * Une alerte d'exploitation est lue sur un téléphone, souvent en pleine nuit,
   * parfois par un client de messagerie qui n'affiche pas les images. Le texte
   * brut ne peut ni se rendre à moitié, ni cacher une information derrière un
   * style, ni déclencher un filtre anti-hameçonnage. Et il n'a pas besoin d'un
   * moteur de gabarits pour exister — ce que le brief prévoit (React Email)
   * servira aux emails destinés aux VENDEURS, qui eux sont de la marque.
   */
  readonly texte: string;
}

export type ResultatEnvoi =
  | { readonly statut: "envoye"; readonly id: string }
  | { readonly statut: "refuse"; readonly motif: string }
  | { readonly statut: "non_configure"; readonly manquant: readonly string[] };

export interface Expediteur {
  envoyer(message: Message): Promise<ResultatEnvoi>;
}
