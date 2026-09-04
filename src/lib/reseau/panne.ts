/**
 * RECONNAÎTRE UNE COUPURE DE TRANSPORT, ET ELLE SEULE.
 *
 * ⚠️ CE MODULE EXISTE PARCE QUE LE MÊME DÉFAUT A ÉTÉ TROUVÉ DEUX FOIS EN UN
 * JOUR, SUR DEUX SURFACES QUI NE SE RESSEMBLENT PAS.
 *
 *   - `lireProfilAvec` traitait toute erreur de `getUser()` comme une session
 *     refusée : deux éjections sur 200 requêtes, à 11,1 s et 11,4 s, et le
 *     vendeur lisait « Votre session a expiré » alors qu'elle était intacte.
 *
 *   - `lirePanneau` levait sur toute erreur de lecture du stockage : un
 *     `TypeError: fetch failed` rendait TOUT le panneau d'administration en
 *     500 — alertes, compteurs et tâches comprises, c'est-à-dire précisément ce
 *     qu'on vient y chercher quand le réseau va mal.
 *
 * Les deux fois, le produit affirmait une cause qu'il n'avait pas constatée.
 * C'est le principe XII à l'envers : *l'interface n'affirme jamais ce que la
 * base n'a pas enregistré.* Un serveur injoignable n'a rien enregistré du tout.
 *
 * ⚠️ LA LISTE EST VOLONTAIREMENT ÉTROITE ET ÉNUMÉRÉE, comme celle de
 * `scripts/transport.mjs`. Un message métier — `Invalid login credentials`,
 * `session_not_found`, une violation de contrainte — n'y entre pas et ne doit
 * jamais y entrer : l'élargir transformerait cette distinction en machine à
 * transformer de vrais défauts en incidents passagers, c'est-à-dire à les
 * rendre invisibles exactement comme le faisait le défaut d'origine, dans
 * l'autre sens.
 *
 * ⚠️ ET CE N'EST PAS UN ENROBAGE QUI RÉESSAIE. Il ne masque rien : il NOMME.
 * L'appelant décide ensuite quoi faire — refuser en le disant, ou dégrader une
 * partie de l'écran — et c'est toujours un état visible, jamais un silence.
 */
export function estPanneDeTransport(message: string): boolean {
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|terminated|timeout/i.test(
    message,
  );
}

/**
 * UNE LECTURE EST-ELLE MOMENTANÉMENT ILLISIBLE ? — la règle, en un seul endroit.
 *
 * ⚠️ ELLE VIT ICI PARCE QUE LE MÊME DÉFAUT A ÉTÉ CORRIGÉ QUATRE FOIS, dont
 * trois sur le SEUL panneau d'administration :
 *
 *   02/09  `stockage_total_admin`  — 500 sur tout l'écran, correctif posé là.
 *   04/09  `lire_journal_admin`    — même `Promise.all`, levait toujours.
 *   04/09  `etat_veilleur`         — troisième lecture du même écran.
 *   04/09  `lireSurveillance`      — l'écran voisin, trois lectures, aucune garde.
 *
 * Chaque correctif regardait là où le défaut venait d'apparaître : c'est L-025,
 * *un garde écrit après coup hérite du champ de vision de la CORRECTION, pas du
 * problème.* Recopier la condition une cinquième fois produirait une cinquième
 * occurrence. Un concept, un endroit.
 *
 * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS : elle NOMME. Panne de transport →
 * elle écrit dans le journal du serveur et rend `true`, l'appelant décidant de
 * dégrader. Tout le reste → elle LÈVE. Ce n'est jamais un `catch` muet : une
 * erreur applicative — droit manquant, fonction absente, contrainte violée —
 * doit continuer de casser, sinon un écran vivrait « indisponible » pour
 * toujours sans que personne cherche pourquoi.
 *
 * ⚠️ ET L'APPELANT DOIT RENDRE `null`, JAMAIS UNE VALEUR NEUTRE. Une liste vide
 * affirme « il n'y a rien », un zéro affirme « on a compté » : ce sont des
 * affirmations, et sur une lecture qui n'a pas abouti ce sont des affirmations
 * fausses. C'est le principe XII appliqué à une base qui n'a rien répondu.
 */
export function lectureIllisible(
  resultat: { readonly error: { readonly message: string } | null },
  quoi: string,
): boolean {
  if (resultat.error === null) return false;
  if (!estPanneDeTransport(resultat.error.message)) {
    throw new Error(`lecture ${quoi} impossible : ` + resultat.error.message);
  }
  console.error(`[lecture] ${quoi} momentanément illisible — ` + resultat.error.message);
  return true;
}
