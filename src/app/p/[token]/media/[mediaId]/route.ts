import { NextResponse } from "next/server";
import { signerMediaPlein } from "@/lib/page-publique/lecture";

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
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ token: string; mediaId: string }> },
): Promise<NextResponse> {
  const { token, mediaId } = await contexte.params;

  const url = await signerMediaPlein(token, mediaId);
  if (url === null) {
    return NextResponse.json({ erreur: "introuvable" }, { status: 404 });
  }

  // `no-store` : l'URL est signée et périme. La mettre en cache la ferait servir
  // après expiration, et l'image casserait sans que rien ne le signale.
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
