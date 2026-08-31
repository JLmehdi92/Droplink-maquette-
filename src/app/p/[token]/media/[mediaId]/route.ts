import { NextResponse } from "next/server";
import { signerMediaPlein } from "@/lib/page-publique/lecture";
import { signalerJetonInconnu, verifierQuotaPublique } from "@/lib/limitation/quota";

/**
 * Signe la lecture d'UN média plein, à l'ouverture du visionneur.
 *
 * POURQUOI UNE ROUTE ET PAS UNE SERVER ACTION. Une Server Action est une
 * mutation par contrat, et son appel embarque le runtime d'actions dans le
 * document. Ici on LIT, sur une page qui compte ses octets, depuis un îlot déjà
 * chargé — un `fetch` vers une route coûte zéro octet de plus.
 *
 * ⚠️ `/api/*` — et tout ce qui n'est pas le matcher du middleware — n'est
 * protégé par RIEN d'autre que sa propre garde. Cette route n'est pas sous
 * `/api`, mais la règle vaut pareil : elle porte SA garde, ici la validation du
 * jeton et l'appartenance du média à la commande qu'il désigne, arbitrées EN
 * BASE et pas ici.
 *
 * Un jeton inconnu, révoqué, suspendu, ou un média étranger rendent tous 404 :
 * un seul chemin de sortie, aucun oracle.
 *
 * ELLE EST FREINÉE, DEPUIS L'AUDIT. Elle était la seule des quatre entrées
 * publiques sans compteur : le commentaire ci-dessus affirmait qu'elle portait
 * SA garde et n'en nommait qu'une. Sans plafond, un détenteur d'un seul lien
 * — légitime, ou fuité, le jeton étant immuable à vie — pouvait boucler dessus
 * et faire émettre des milliers d'URL signées valables quinze minutes, dont chacune
 * SURVIT à une suspension du compte : la fonction en base cesse d'en émettre,
 * mais R2 ne révoque pas celles déjà signées.
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ token: string; mediaId: string }> },
): Promise<NextResponse> {
  const { token, mediaId } = await contexte.params;

  // EN CAS DE PANNE DU COMPTEUR, ON AUTORISE. C'est la règle de la surface
  // publique : refuser pénaliserait les clients d'un vendeur pour un incident
  // qui ne les concerne pas. `verifierQuotaPublique` porte déjà cette décision.
  const quota = await verifierQuotaPublique();
  if (!quota.autorise) {
    // 404 ET NON 429, comme partout sur cette surface : un code distinct
    // apprendrait à un balayeur qu'il a touché quelque chose.
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  const url = await signerMediaPlein(token, mediaId);
  if (url === null) {
    // LE BALAYAGE SE COUPE LUI-MÊME, quelle que soit l'entrée choisie. Sans cet
    // appel, le compteur des jetons inconnus n'était armé que par la page : il
    // suffisait de balayer par ici pour n'en jamais consommer un seul essai.
    await signalerJetonInconnu();
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  // `no-store` : l'URL est signée et périme. La mettre en cache la ferait servir
  // après expiration, et l'image casserait sans que rien ne le signale.
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
