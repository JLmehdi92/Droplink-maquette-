/**
 * LE CONTRAT DES PHRASES D'APERÇU — la moitié qui traverse vers le navigateur.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE LE BUILD A REFUSÉ L'AUTRE FORME, ET IL AVAIT
 * RAISON. Tout vivait dans `libelles-apercu.ts`, qui porte `server-only` — il
 * appelle `getTranslations` de `next-intl/server`. Or les trois aperçus sont
 * des Client Components : importer `substituerNom` depuis là faisait échouer la
 * compilation, avec le message exact de `server-only`.
 *
 * C'est la règle du projet appliquée telle quelle : *importer le mauvais client
 * doit CASSER LE BUILD plutôt que de fuiter silencieusement*. Ici ce n'est pas
 * un client Supabase, mais le mécanisme est le même — et il a fonctionné avant
 * qu'une seule ligne de `next-intl/server` n'atterrisse dans un bundle
 * navigateur.
 *
 * Ce module est donc NEUTRE : un type et une fonction pure, rien qui touche au
 * serveur. La FABRIQUE, elle, reste `server-only` — voir `libelles-apercu.ts`.
 */

/**
 * Ce qu'un aperçu « ce que voit le client » a besoin de montrer.
 *
 * Toutes ces phrases viennent de `page-publique.*`, dans la langue de
 * `shops.default_language` — jamais dans celle de l'URL vendeur. Le pourquoi
 * est écrit en entier dans `libelles-apercu.ts`.
 */
export interface LibellesApercu {
  /** Le titre de la page client. */
  readonly commande: string;
  /**
   * Le gabarit « pour {nom} », à substituer côté client.
   *
   * ⚠️ IL VOYAGE EN GABARIT, PAS EN PHRASE FINIE, parce que dans l'éditeur le
   * nom du client change À CHAQUE FRAPPE. Le résoudre côté serveur ferait
   * dépendre l'aperçu d'un aller-retour par caractère.
   */
  readonly pourGabarit: string;
  /** « pour votre client » — l'écran de marque n'a aucune commande réelle. */
  readonly pourGenerique: string;
  /** « Votre boutique » DANS LA LANGUE DE LA PAGE : l'aperçu de `/bienvenue` est d'une seule langue. */
  readonly nomProvisoire: string;
  readonly approuver: string;
  readonly statut: string;
  /** Le gabarit « Retrouvez {nom} », substitué avec le nom de la boutique. */
  readonly reseauxGabarit: string;
  /** La page client complète de l'aperçu de « Ma marque » (refonte, 02/10/2026). */
  readonly page: TextesPageApercu;
}

/**
 * LES TEXTES DE LA PAGE CLIENT D'APERÇU, dans la langue des pages client.
 *
 * Ce sont ceux de la VRAIE page (`page-publique.*`) ; seules les valeurs de
 * démonstration (dates, transporteur, numéro) ne viennent d'aucune commande, et
 * l'aperçu le sait : « pour votre client », jamais un nom inventé.
 */
export interface TextesPageApercu {
  readonly commandeDe: string;
  readonly titre: string;
  readonly sousTitre: string;
  readonly dateEstimee: string;
  /** La fourchette de livraison de démonstration, formatée dans la langue. */
  readonly dates: string;
  readonly etapes: readonly [string, string, string, string];
  /** Les dates des quatre étapes de démonstration, formatées dans la langue. */
  readonly quand: readonly [string, string, string, string];
  readonly enCours: string;
  readonly enAttente: string;
  readonly bandeau: string;
  readonly mouvement: string;
  readonly galerie: string;
  readonly qcTitre: string;
  readonly qcTexte: string;
  readonly qcRefuser: string;
  readonly qcApprouver: string;
  readonly livraisonTitre: string;
  readonly transporteur: string;
  readonly numero: string;
  readonly dateCourte: string;
  readonly contactTitre: string;
  readonly contactTexte: string;
  readonly contactBouton: string;
  readonly propulseSurtitre: string;
  readonly propulseTitre: string;
  readonly propulseTexte: string;
  readonly propulseBouton: string;
  readonly site: string;
}

/**
 * Substitue `{nom}` dans un gabarit d'aperçu.
 *
 * ⚠️ SUBSTITUTION LITTÉRALE, DONC MUETTE QUAND ELLE ÉCHOUE. Un gabarit qui
 * perdrait sa variable — une retraduction, un renommage — rendrait « pour »
 * tout seul, ou « Retrouvez » sans personne, sans que rien n'échoue :
 * `String.replace` sur un motif absent rend la chaîne inchangée.
 *
 * `tests/unit/apercu-langue-du-client.test.ts` exige donc que les deux gabarits
 * portent `{nom}` dans CHAQUE langue — et `i18n-parite` ne peut pas le voir, il
 * compare des clés et refuse les valeurs vides, jamais la forme d'une valeur.
 */
export function substituerNom(gabarit: string, nom: string): string {
  return gabarit.replace("{nom}", nom);
}
