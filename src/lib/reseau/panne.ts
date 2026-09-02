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
